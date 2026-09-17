from pymongo import MongoClient
import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

class MongoDBAdapter:
    @staticmethod
    def test_connection(config: Dict[str, Any]) -> bool:
        uri = config.get("uri")
        if not uri:
            user = config.get("username")
            pwd = config.get("password")
            host = config.get("host", "localhost")
            port = config.get("port", 27017)
            auth = f"{user}:{pwd}@" if user and pwd else ""
            uri = f"mongodb://{auth}{host}:{port}"

        try:
            client = MongoClient(uri, serverSelectionTimeoutMS=5000)
            client.admin.command("ping")
            client.close()
            return True
        except Exception as e:
            logger.error(f"MongoDB connection test failed: {e}")
            raise

    @staticmethod
    def execute_query(config: Dict[str, Any], query: Any = None, limit: int = 1000, return_columns: bool = False) -> Any:
        import json
        import re
        import yaml

        uri = config.get("uri")
        if not uri:
            user = config.get("username")
            pwd = config.get("password")
            host = config.get("host", "localhost")
            port = config.get("port", 27017)
            auth = f"{user}:{pwd}@" if user and pwd else ""
            uri = f"mongodb://{auth}{host}:{port}"

        client = MongoClient(uri)
        try:
            db_name = config.get("database", "admin")
            collection_name = config.get("collection")
            filter_query: Dict[str, Any] = {}

            if isinstance(query, dict):
                if "collection" in query:
                    collection_name = query.get("collection")
                    filter_query = query.get("filter", {})
                else:
                    filter_query = query
            elif isinstance(query, str) and query.strip():
                raw = query.strip().rstrip(";").strip()

                # 1. Match db.collection.find(...) or collection.find(...)
                match_find = re.match(r'^(?:db\.)?([a-zA-Z0-9_\-]+)\.find\s*\((.*)\)\s*$', raw, re.DOTALL)
                if match_find:
                    collection_name = match_find.group(1)
                    raw = match_find.group(2).strip()

                # Preprocess MongoDB shell syntax & relaxed JSON
                # We tokenize string literals vs code outside of strings so we don't corrupt content inside quotes (like URLs, ISO timestamps)
                token_pattern = re.compile(r'("(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\')|([^"\'\n]+)')

                def process_code_chunk(chunk: str) -> str:
                    # A. Regex literals: e.g. /pattern/i or /pattern/
                    chunk = re.sub(
                        r'(^|[\s:(\[,=])/(?![/\*])([^/\n]+)/([imsux]*)',
                        lambda m: f'{m.group(1)}{{"$regex": "{m.group(2)}", "$options": "{m.group(3)}"}}',
                        chunk
                    )
                    # B. ObjectId("...") -> "..."
                    chunk = re.sub(r'ObjectId\s*\(\s*["\']([a-fA-F0-9]{24})["\']\s*\)', r'"\1"', chunk)
                    # C. ISODate("...") -> "..."
                    chunk = re.sub(r'ISODate\s*\(\s*["\']([^"\']+)["\']\s*\)', r'"\1"', chunk)

                    # D. Add space after colon `:` when followed immediately by non-whitespace!
                    # E.g. $options:'i' -> $options: 'i', $regex:"foo" -> $regex: "foo", key:val -> key: val
                    # In YAML, a colon MUST be followed by whitespace to be recognized as a key-value mapping;
                    # otherwise $options:'i' is parsed as a single scalar key with null value!
                    chunk = re.sub(r':(?!\s)', r': ', chunk)
                    return chunk

                parts = []
                for match in token_pattern.finditer(raw):
                    str_token = match.group(1)
                    code_token = match.group(2)
                    if str_token is not None:
                        parts.append(str_token)
                    elif code_token is not None:
                        parts.append(process_code_chunk(code_token))

                raw_clean = "".join(parts).strip()

                if not raw_clean or raw_clean == "{}":
                    filter_query = {}
                else:
                    parsed = None
                    try:
                        parsed = yaml.safe_load(raw_clean)
                    except Exception as e_yaml:
                        try:
                            parsed = json.loads(raw_clean)
                        except Exception as e_json:
                            raise ValueError(f"Invalid MongoDB query filter: '{raw_clean}'. Could not parse as valid JSON or YAML: {e_yaml}")

                    if isinstance(parsed, dict):
                        if "collection" in parsed and not collection_name:
                            collection_name = parsed.get("collection")
                            filter_query = parsed.get("filter", {})
                        else:
                            filter_query = parsed
                    elif not collection_name and re.match(r'^[a-zA-Z0-9_\-]+$', raw):
                        collection_name = raw
                        filter_query = {}
                    else:
                        raise ValueError(f"MongoDB query filter must evaluate to an object/dictionary, got {type(parsed).__name__}")

            if not collection_name:
                raise ValueError(
                    "MongoDB collection name is required. Either set Collection Name in config, "
                    "or specify it in query: e.g. collection_name.find({\"status\": \"active\"}) "
                    "or {\"collection\": \"my_collection\", \"filter\": {...}}"
                )

            db = client[db_name]
            col = db[collection_name]
            if limit and limit > 0:
                cursor = col.find(filter_query).limit(limit)
            else:
                cursor = col.find(filter_query)

            records = []
            for doc in cursor:
                doc["_id"] = str(doc["_id"])  # convert ObjectId to string
                records.append(doc)
            cols = list(records[0].keys()) if records and isinstance(records[0], dict) else []
            if return_columns:
                return records, cols
            return records
        finally:
            client.close()

    @staticmethod
    def inspect_tables(config: Dict[str, Any]) -> List[str]:
        uri = config.get("uri")
        if not uri:
            user = config.get("username")
            pwd = config.get("password")
            host = config.get("host", "localhost")
            port = config.get("port", 27017)
            auth = f"{user}:{pwd}@" if user and pwd else ""
            uri = f"mongodb://{auth}{host}:{port}"

        client = MongoClient(uri)
        try:
            db_name = config.get("database", "admin")
            db = client[db_name]
            return db.list_collection_names()
        finally:
            client.close()
