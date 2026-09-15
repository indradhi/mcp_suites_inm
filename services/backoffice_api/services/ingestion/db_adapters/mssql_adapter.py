import pymssql
import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

class MSSQLAdapter:
    @staticmethod
    def test_connection(config: Dict[str, Any]) -> bool:
        try:
            conn = pymssql.connect(
                server=config.get("host", "localhost"),
                port=int(config.get("port", 1433)),
                user=config.get("username", "sa"),
                password=config.get("password", ""),
                database=config.get("database", "master"),
                login_timeout=5
            )
            conn.close()
            return True
        except Exception as e:
            logger.error(f"SQL Server connection test failed: {e}")
            raise

    @staticmethod
    def execute_query(config: Dict[str, Any], query: str, limit: int = 1000) -> List[Dict[str, Any]]:
        conn = pymssql.connect(
            server=config.get("host", "localhost"),
            port=int(config.get("port", 1433)),
            user=config.get("username", "sa"),
            password=config.get("password", ""),
            database=config.get("database", "master"),
            as_dict=True
        )
        clean_query = query.strip().rstrip(";")
        if limit and limit > 0:
            if "TOP" not in clean_query.upper() and "OFFSET" not in clean_query.upper():
                final_query = f"SELECT TOP {limit} * FROM ({clean_query}) AS _subq"
            else:
                final_query = clean_query
        else:
            final_query = clean_query

        try:
            with conn.cursor() as cursor:
                cursor.execute(final_query)
                if limit and limit > 0:
                    records = cursor.fetchmany(limit)
                else:
                    records = cursor.fetchall()
                return records
        finally:
            conn.close()

    @staticmethod
    def inspect_tables(config: Dict[str, Any]) -> List[str]:
        conn = pymssql.connect(
            server=config.get("host", "localhost"),
            port=int(config.get("port", 1433)),
            user=config.get("username", "sa"),
            password=config.get("password", ""),
            database=config.get("database", "master")
        )
        try:
            with conn.cursor() as cursor:
                cursor.execute("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'")
                tables = [row[0] for row in cursor.fetchall()]
                return tables
        finally:
            conn.close()
