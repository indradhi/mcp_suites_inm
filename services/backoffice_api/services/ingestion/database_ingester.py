import logging
from typing import List, Dict, Any
from services.ingestion.db_adapters.mysql_adapter import MySQLAdapter
from services.ingestion.db_adapters.postgres_adapter import PostgresAdapter
from services.ingestion.db_adapters.mssql_adapter import MSSQLAdapter
from services.ingestion.db_adapters.mongodb_adapter import MongoDBAdapter
from services.ingestion.db_adapters.oracle_adapter import OracleAdapter

logger = logging.getLogger(__name__)

ADAPTERS = {
    "mysql": MySQLAdapter,
    "postgres": PostgresAdapter,
    "postgresql": PostgresAdapter,
    "mssql": MSSQLAdapter,
    "sqlserver": MSSQLAdapter,
    "mongodb": MongoDBAdapter,
    "oracle": OracleAdapter,
}

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

        is_mongo = db_type.lower() == "mongodb"

        for p in sorted_params:
            p_name = p.get("name")
            p_type = (p.get("type") or "string").lower()
            val = arguments.get(p_name)
            if (val is None or str(val).strip() == "") and p.get("default") is not None and str(p.get("default")).strip() != "":
                val = p.get("default")

            val_to_use = val

            if is_mongo:
                MONGO_OPERATORS = {
                    '$match', '$project', '$group', '$sort', '$limit', '$skip',
                    '$unwind', '$lookup', '$in', '$nin', '$gt', '$gte', '$lt',
                    '$lte', '$ne', '$eq', '$all', '$size', '$exists', '$type',
                    '$mod', '$regex', '$options', '$text', '$where', '$elemMatch',
                    '$and', '$or', '$not', '$nor', '$set', '$unset', '$push', '$pull', '$inc'
                }

                if val_to_use is None or str(val_to_use).strip() == "":
                    rep_val = "null"
                    is_quoted = False
                elif p_type in ["int", "integer"]:
                    try:
                        rep_val = str(int(val_to_use))
                    except Exception:
                        rep_val = "0"
                    is_quoted = False
                elif p_type in ["float", "number"]:
                    try:
                        rep_val = str(float(val_to_use))
                    except Exception:
                        rep_val = "0.0"
                    is_quoted = False
                elif p_type in ["bool", "boolean"]:
                    rep_val = "true" if str(val_to_use).lower() in ["true", "1", "yes"] else "false"
                    is_quoted = False
                else:
                    # String type: includes quotes e.g. "Budi"
                    rep_val = json.dumps(str(val_to_use))
                    is_quoted = True

                # 1. First replace explicitly quoted placeholders:
                # e.g. ":param", ":$param", "{param}", "{$param}", and "$param" (if not a reserved Mongo operator)
                quoted_patterns = [
                    r'["\']:' + re.escape(p_name) + r'["\']',
                    r'["\']:\$' + re.escape(p_name) + r'["\']',
                    r'["\']\{' + re.escape(p_name) + r'\}["\']',
                    r'["\']\{\$' + re.escape(p_name) + r'\}["\']'
                ]
                if f"${p_name}" not in MONGO_OPERATORS:
                    quoted_patterns.append(r'["\']\$' + re.escape(p_name) + r'["\']')

                for qp in quoted_patterns:
                    interpolated = re.sub(qp, rep_val, interpolated)

                # 2. Check if inside regex literal, e.g. /:param/ or /:param/i
                if is_quoted:
                    inside_val = json.dumps(str(val_to_use))[1:-1]
                    regex_tokens = [f":{p_name}", f":${p_name}", f"{{{p_name}}}", f"{{${p_name}}}"]
                    if f"${p_name}" not in MONGO_OPERATORS:
                        regex_tokens.append(f"${p_name}")
                    for tok in regex_tokens:
                        interpolated = re.sub(r'/' + re.escape(tok) + r'/([imsux]*)', lambda m: f'/{inside_val}/{m.group(1)}', interpolated)

                # 3. Replace unquoted placeholders with boundary check
                unquoted_tokens = [
                    r':' + re.escape(p_name),
                    r':\$' + re.escape(p_name),
                    r'\{' + re.escape(p_name) + r'\}',
                    r'\{\$' + re.escape(p_name) + r'\}'
                ]
                if f"${p_name}" not in MONGO_OPERATORS:
                    unquoted_tokens.append(r'\$' + re.escape(p_name))

                for tok in unquoted_tokens:
                    pat = re.compile(r'([^a-zA-Z0-9_\'"]|^)' + tok + r'([^a-zA-Z0-9_\'"]|$)')
                    def repl(m, current_rep=rep_val):
                        prefix = m.group(1) or ""
                        suffix = m.group(2) or ""
                        return f"{prefix}{current_rep}{suffix}"
                    interpolated = pat.sub(repl, interpolated)

            else:
                # SQL databases
                if val_to_use is None:
                    for pattern in [f"':{p_name}'", f"'{{{p_name}}}'", f":{p_name}", f"{{{p_name}}}"]:
                        interpolated = interpolated.replace(pattern, "NULL")
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
