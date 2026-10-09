import logging
import re
import json
import yaml
from typing import List, Dict, Any
from services.ingestion.db_adapters.mysql_adapter import MySQLAdapter
from services.ingestion.db_adapters.postgres_adapter import PostgresAdapter
from services.ingestion.db_adapters.mssql_adapter import MSSQLAdapter
from services.ingestion.db_adapters.mongodb_adapter import MongoDBAdapter

logger = logging.getLogger(__name__)

ADAPTERS = {
    "mysql": MySQLAdapter,
    "postgres": PostgresAdapter,
    "postgresql": PostgresAdapter,
    "mssql": MSSQLAdapter,
    "sqlserver": MSSQLAdapter,
    "mongodb": MongoDBAdapter,
}


def _process_mongo_query(raw_query: str, parameters_def: List[Dict[str, Any]], arguments: Dict[str, Any]) -> str:
    """Processes a MongoDB query or filter template.
    Substitutes parameters, safely eliminates unfilled/empty parameters (preventing $regex null errors),
    preserves collection prefixes e.g. db.coll.find({...}), and auto-generates filters if query is empty."""
    raw = (raw_query or "").strip().rstrip(";").strip()
    coll_prefix = ""
    coll_suffix = ""
    m_find = re.match(r'^((?:db\.)?[a-zA-Z0-9_\-]+\.find\s*\()(.*)(\)\s*)$', raw, re.DOTALL)
    if m_find:
        coll_prefix = m_find.group(1)
        raw = m_find.group(2).strip()
        coll_suffix = m_find.group(3)

    if not raw or raw == "{}":
        parsed = {}
    else:
        try:
            parsed = json.loads(raw)
        except Exception:
            token_pattern = re.compile(r'("(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\')|([^"\'\n]+)')
            parts = []
            for match in token_pattern.finditer(raw):
                s = match.group(1)
                c = match.group(2)
                if s is not None:
                    parts.append(s)
                elif c is not None:
                    parts.append(re.sub(r':(?!\s)', r': ', c))
                else:
                    parts.append(match.group(0))
            raw_clean = "".join(parts).strip()
            try:
                parsed = yaml.safe_load(raw_clean)
            except Exception:
                parsed = None

    # Map parameters and values
    param_map = {}
    for p in (parameters_def or []):
        p_name = p.get("name")
        if not p_name:
            continue
        p_type = (p.get("type") or "string").lower()
        val = arguments.get(p_name)
        if (val is None or str(val).strip() == "") and p.get("default") is not None and str(p.get("default")).strip() != "":
            val = p.get("default")

        is_empty = val is None or str(val).strip() == ""
        typed_val = None
        if not is_empty:
            if p_type in ["int", "integer"]:
                try:
                    typed_val = int(val)
                except Exception:
                    typed_val = str(val)
            elif p_type in ["float", "number"]:
                try:
                    typed_val = float(val)
                except Exception:
                    typed_val = str(val)
            elif p_type in ["bool", "boolean"]:
                typed_val = True if str(val).lower() in ["true", "1", "yes"] else False
            else:
                typed_val = str(val)

        param_map[p_name] = {
            "type": p_type,
            "val": typed_val,
            "is_empty": is_empty,
            "tokens": [f":{p_name}", f"{{{p_name}}}", f":${p_name}", f"{{${p_name}}}", f"${p_name}"]
        }

    def substitute_and_prune(node):
        if isinstance(node, dict):
            # Special check: regex object e.g. {"$regex": ":nama", "$options": "i"}
            if "$regex" in node:
                regex_val = str(node["$regex"])
                for p_name, p_info in param_map.items():
                    if any(tok in regex_val for tok in p_info["tokens"]):
                        if p_info["is_empty"]:
                            return None  # Unfilled regex -> drop completely!
                        else:
                            rep_str = str(p_info["val"])
                            new_r = regex_val
                            for tok in p_info["tokens"]:
                                new_r = new_r.replace(tok, rep_str)
                            node["$regex"] = new_r
                return node

            out = {}
            for k, v in node.items():
                if v is None:
                    continue
                # Direct unfilled token check
                is_unfilled_token = False
                for p_name, p_info in param_map.items():
                    if p_info["is_empty"] and any(tok == str(v).strip() for tok in p_info["tokens"]):
                        is_unfilled_token = True
                        break
                if is_unfilled_token:
                    continue  # drop this field

                new_v = substitute_and_prune(v)
                if new_v is None or new_v == {} or (new_v == [] and k in ("$and", "$or", "$nor")):
                    if k in ("$and", "$or", "$nor") or isinstance(v, (dict, list)):
                        continue
                out[k] = new_v
            return out

        elif isinstance(node, list):
            items = []
            for item in node:
                new_item = substitute_and_prune(item)
                if new_item is not None and new_item != {}:
                    items.append(new_item)
            return items

        elif isinstance(node, str):
            res_str = node
            for p_name, p_info in param_map.items():
                if not p_info["is_empty"]:
                    for tok in p_info["tokens"]:
                        if tok == res_str:
                            return p_info["val"]
                        elif tok in res_str:
                            res_str = res_str.replace(tok, str(p_info["val"]))
            return res_str

        return node

    if isinstance(parsed, dict):
        raw_str_check = json.dumps(parsed)
        has_any_placeholder = any(
            any(tok in raw_str_check for tok in p_info["tokens"])
            for p_info in param_map.values()
        )

        if has_any_placeholder:
            result_dict = substitute_and_prune(parsed) or {}
        else:
            # Auto-generate filter from filled params if query is {} or doesn't have placeholders
            auto_conditions = []
            for p_name, p_info in param_map.items():
                if not p_info["is_empty"]:
                    if p_info["type"] == "string":
                        auto_conditions.append({p_name: {"$regex": str(p_info["val"]), "$options": "i"}})
                    else:
                        auto_conditions.append({p_name: p_info["val"]})
            if auto_conditions:
                if len(auto_conditions) == 1:
                    result_dict = auto_conditions[0]
                else:
                    result_dict = {"$and": auto_conditions}
            else:
                result_dict = parsed or {}

        if isinstance(result_dict, dict) and "$and" in result_dict and isinstance(result_dict["$and"], list):
            if len(result_dict["$and"]) == 1:
                result_dict = result_dict["$and"][0]
            elif len(result_dict["$and"]) == 0:
                del result_dict["$and"]

        out_json = json.dumps(result_dict, ensure_ascii=False)
        if coll_prefix:
            return f"{coll_prefix}{out_json}{coll_suffix}"
        return out_json

    return raw_query


def _neutralize_param_condition(sql: str, p_name: str) -> str:
    """Replace every condition that uses an empty parameter (e.g. `col = :p`,
    `UPPER(col) LIKE UPPER('%:p%')`) with `1=1`, keeping parentheses balanced."""
    ph = re.escape(p_name)
    pat = re.compile(
        r'(?:UPPER\(\s*)?[\w."]+\s*\)?\s*'
        r'(?:NOT\s+LIKE|LIKE|ILIKE|IN|>=|<=|<>|!=|=|>|<)\s*'
        r'(?P<u>UPPER\(\s*)?(?P<p>\(\s*)?[\'"%]*(?::\s*\{' + ph + r'\}|:' + ph + r'(?!\w)|\{' + ph + r'\})[\'"%]*',
        re.IGNORECASE
    )
    pos = 0
    while True:
        m = pat.search(sql, pos)
        if not m:
            return sql
        opens = (1 if m.group('u') else 0) + (1 if m.group('p') else 0)
        end = m.end()
        while opens > 0:
            t = re.match(r'\s*\)', sql[end:])
            if not t:
                break
            end += t.end()
            opens -= 1
        sql = sql[:m.start()] + ' 1=1 ' + sql[end:]
        pos = m.start() + 5


class DatabaseIngester:
    def get_adapter(self, db_type: str):
        adapter = ADAPTERS.get(db_type.lower())
        if not adapter:
            raise ValueError(f"Unsupported database type '{db_type}'. Supported: {list(ADAPTERS.keys())}")
        return adapter

    def test_connection(self, db_type: str, config: Dict[str, Any]) -> bool:
        adapter = self.get_adapter(db_type)
        return adapter.test_connection(config)

    def extract_knowledge(self, db_type: str, config: Dict[str, Any], query: str, limit: int = 5000) -> List[Dict[str, Any]]:
        adapter = self.get_adapter(db_type)
        raw_records = adapter.execute_query(config, query, limit=limit)

        results = []
        # Chunk records in batches of 20
        batch_size = 20
        for i in range(0, len(raw_records), batch_size):
            batch = raw_records[i:i+batch_size]
            lines = [f"Database Type: {db_type} | Source Query: {query}"]
            for r_idx, record in enumerate(batch, start=i+1):
                fields = []
                for k, v in record.items():
                    if v is not None:
                        val_str = str(v).strip()
                        is_image = (
                            any(img_k in str(k).lower() for img_k in ['foto', 'photo', 'image', 'picture', 'avatar', 'img', 'gambar', 'base64']) or
                            val_str.startswith('/9j/') or
                            val_str.startswith('data:image') or
                            val_str.startswith('iVBORw0KGgo') or
                            val_str.startswith('R0lGOD') or
                            val_str.startswith('UklGR')
                        )
                        # Never truncate base64 image strings during ingestion; allow generous limit for other text
                        if not is_image and len(val_str) > 2500:
                            val_str = val_str[:2500] + "... [truncated]"
                        fields.append(f"{k}: {val_str}")
                lines.append(f"Record {r_idx}: " + " | ".join(fields))

            chunk_text = "\n".join(lines)
            results.append({
                "chunk_index": (i // batch_size) + 1,
                "text": chunk_text,
                "records_count": len(batch),
                "metadata": {
                    "db_type": db_type,
                    "batch_start": i + 1,
                    "batch_end": i + len(batch)
                }
            })
        return results

    def substitute_query_parameters(
        self,
        query: str,
        db_type: str,
        parameters_def: List[Dict[str, Any]],
        arguments: Dict[str, Any]
    ) -> str:
        """
        Interpolates arguments into query using placeholders :param_name or {param_name}.
        Enforces required parameters and fills default values.
        Safely escapes values to prevent SQL injection.
        """
        import re
        import json

        interpolated = (query or "").strip()
        raw_query = interpolated
        arguments = arguments or {}

        # Check required params and defaults
        for p in (parameters_def or []):
            p_name = p.get("name")
            if not p_name:
                continue
            is_req = p.get("required", False)
            val = arguments.get(p_name)
            has_val = val is not None and str(val).strip() != ""
            has_def = p.get("default") is not None and str(p.get("default", "")).strip() != ""
            if is_req and not has_val and not has_def:
                raise ValueError(f"Missing required parameter '{p_name}'")

        # Sort parameters by name length descending to avoid prefix clashes
        sorted_params = sorted(
            [p for p in (parameters_def or []) if p.get("name")],
            key=lambda x: len(x.get("name", "")),
            reverse=True
        )

        if db_type.lower() == "mongodb":
            return _process_mongo_query(raw_query, parameters_def, arguments)

        auto_where_conditions = []

        for p in sorted_params:
            p_name = p.get("name")
            p_type = (p.get("type") or "string").lower()
            val = arguments.get(p_name)
            if (val is None or str(val).strip() == "") and p.get("default") is not None and str(p.get("default")).strip() != "":
                val = p.get("default")

            val_to_use = val
            # SQL databases
            has_placeholder = False
            for token in [f":{p_name}", f"{{{p_name}}}", f":${p_name}", f"{{${p_name}}}"]:
                if token in raw_query:
                    has_placeholder = True
                    break

            is_empty = val_to_use is None or str(val_to_use).strip() == ""

            if not has_placeholder and not is_empty:
                if p_type in ["int", "integer", "float", "number", "bool", "boolean"]:
                    if p_type in ["bool", "boolean"]:
                        b_str = "1" if str(val_to_use).lower() in ["true", "1", "yes"] else "0"
                        auto_where_conditions.append(f"{p_name} = {b_str}")
                    else:
                        try:
                            num_str = str(val_to_use)
                        except Exception:
                            num_str = "0"
                        auto_where_conditions.append(f"{p_name} = {num_str}")
                else:
                    escaped = str(val_to_use).replace("'", "''").replace("\\", "\\\\")
                    auto_where_conditions.append(f"UPPER({p_name}) LIKE UPPER('%{escaped}%')")
                continue

            if is_empty:
                # Remove the entire condition involving this parameter by replacing it with 1=1
                # This supports queries where missing parameters shouldn't filter the results
                interpolated = _neutralize_param_condition(interpolated, p_name)

                # Fallback for bare placeholders
                for bare_pattern in [f"':{p_name}'", f"'{{{p_name}}}'", f":{p_name}", f"{{{p_name}}}"]:
                    interpolated = interpolated.replace(bare_pattern, "NULL")
                continue

            if p_type in ["int", "integer"]:
                try:
                    num_str = str(int(val_to_use))
                except Exception:
                    num_str = "0"
                for pattern in [f"':{p_name}'", f"'{{{p_name}}}'", f":{p_name}", f"{{{p_name}}}"]:
                    interpolated = interpolated.replace(pattern, num_str)

            elif p_type in ["float", "number"]:
                try:
                    num_str = str(float(val_to_use))
                except Exception:
                    num_str = "0.0"
                for pattern in [f"':{p_name}'", f"'{{{p_name}}}'", f":{p_name}", f"{{{p_name}}}"]:
                    interpolated = interpolated.replace(pattern, num_str)

            elif p_type in ["bool", "boolean"]:
                b_str = "1" if str(val_to_use).lower() in ["true", "1", "yes"] else "0"
                for pattern in [f"':{p_name}'", f"'{{{p_name}}}'", f":{p_name}", f"{{{p_name}}}"]:
                    interpolated = interpolated.replace(pattern, b_str)

            else:
                raw_str = str(val_to_use)
                escaped = raw_str.replace("'", "''").replace("\\", "\\\\")

                # Case-insensitive support: UPPER(column) <op> UPPER(placeholder)
                ph = re.escape(p_name)
                ci_pattern = re.compile(
                    r'(?<![\w.(])((?:[a-zA-Z_][\w]*\.)?[a-zA-Z_][\w]*|"[^"]+")\s*(=|<>|!=|NOT\s+LIKE|LIKE|ILIKE)\s*'
                    r"((?:'?%?)(?::" + ph + r"|\{" + ph + r"\})(?:%?'?))",
                    re.IGNORECASE
                )
                interpolated = ci_pattern.sub(
                    lambda m: f"UPPER({m.group(1)}) {m.group(2)} UPPER({m.group(3)})",
                    interpolated
                )

                # If user explicitly wrote ':param' or '{param}'
                interpolated = interpolated.replace(f"':{p_name}'", f"'{escaped}'")
                interpolated = interpolated.replace(f"'{{{p_name}}}'", f"'{escaped}'")

                # Handle occurrences where placeholder might be inside wildcards %:param% or bare :param
                def repl_placeholder(m):
                    prefix = m.group(1) or ""
                    suffix = m.group(2) or ""
                    if prefix in ["'", "%"] or suffix in ["'", "%"]:
                        return f"{prefix}{escaped}{suffix}"
                    else:
                        return f"{prefix}'{escaped}'{suffix}"

                pattern_colon = re.compile(r"([^a-zA-Z0-9_]|^):" + re.escape(p_name) + r"([^a-zA-Z0-9_]|$)")
                interpolated = pattern_colon.sub(repl_placeholder, interpolated)

                pattern_brace = re.compile(r"([^a-zA-Z0-9_]|^)\{" + re.escape(p_name) + r"\}([^a-zA-Z0-9_]|$)")
                interpolated = pattern_brace.sub(repl_placeholder, interpolated)

        if auto_where_conditions:
            parts = re.split(r'(?i)(\s+(?:ORDER\s+BY|GROUP\s+BY|LIMIT\b|OFFSET\b))', interpolated, maxsplit=1)
            base_query = parts[0]
            
            if re.search(r'(?i)\bWHERE\b', base_query):
                base_query += " AND " + " AND ".join(auto_where_conditions)
            else:
                base_query += " WHERE " + " AND ".join(auto_where_conditions)
                
            interpolated = base_query + "".join(parts[1:])

        return interpolated

    def execute_tool_call_sync(self, config: Dict[str, Any], arguments: Dict[str, Any]) -> Dict[str, Any]:
        """
        Synchronously executes an on-demand database tool call with parameter mapping.
        Returns structured execution dictionary with success, row_count, data, text summary, and latency.
        """
        import time
        import json
        start_time = time.time()
        db_type = config.get("db_type") or config.get("database_type") or "mysql"
        raw_query = config.get("query", "")
        parameters_def = config.get("parameters", [])
        limit = int(config.get("limit", 50))

        try:
            adapter = self.get_adapter(db_type)
            interpolated_query = self.substitute_query_parameters(raw_query, db_type, parameters_def, arguments)

            try:
                query_res = adapter.execute_query(config, interpolated_query, limit=limit, return_columns=True)
                if isinstance(query_res, tuple) and len(query_res) == 2:
                    records, cols = query_res
                else:
                    records = query_res
                    cols = list(records[0].keys()) if records and isinstance(records[0], dict) else []
            except TypeError:
                records = adapter.execute_query(config, interpolated_query, limit=limit)
                cols = list(records[0].keys()) if records and isinstance(records[0], dict) else []

            latency_ms = int((time.time() - start_time) * 1000)

            if records:
                text_repr = json.dumps(records, indent=2, default=str, ensure_ascii=False)
            elif cols:
                text_repr = f"Query executed successfully, returned 0 rows from {db_type.upper()} database. Available columns: {', '.join(cols)}."
            else:
                text_repr = f"Query executed successfully, returned 0 rows from {db_type.upper()} database."

            return {
                "success": True,
                "status_code": 200,
                "db_type": db_type,
                "database": config.get("database"),
                "query": interpolated_query,
                "arguments": arguments,
                "latency_ms": latency_ms,
                "row_count": len(records),
                "columns": cols,
                "data": records,
                "text": text_repr[:12000]
            }
        except Exception as e:
            latency_ms = int((time.time() - start_time) * 1000)
            logger.error(f"Database tool execution failed for {db_type}: {e}")
            return {
                "success": False,
                "status_code": 500,
                "db_type": db_type,
                "database": config.get("database"),
                "query": raw_query,
                "arguments": arguments,
                "latency_ms": latency_ms,
                "error": str(e),
                "row_count": 0,
                "data": [],
                "text": f"Error executing database query: {str(e)}"
            }

    async def execute_tool_call(self, config: Dict[str, Any], arguments: Dict[str, Any]) -> Dict[str, Any]:
        """
        Asynchronous wrapper for execute_tool_call_sync running in thread pool.
        """
        import asyncio
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self.execute_tool_call_sync, config, arguments)

database_ingester = DatabaseIngester()
