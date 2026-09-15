import pymysql
import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

class MySQLAdapter:
    @staticmethod
    def test_connection(config: Dict[str, Any]) -> bool:
        try:
            conn = pymysql.connect(
                host=config.get("host", "localhost"),
                port=int(config.get("port", 3306)),
                user=config.get("username", "root"),
                password=config.get("password", ""),
                database=config.get("database"),
                connect_timeout=5
            )
            conn.close()
            return True
        except Exception as e:
            logger.error(f"MySQL connection test failed: {e}")
            raise

    @staticmethod
    def execute_query(config: Dict[str, Any], query: str, limit: int = 1000) -> List[Dict[str, Any]]:
        conn = pymysql.connect(
            host=config.get("host", "localhost"),
            port=int(config.get("port", 3306)),
            user=config.get("username", "root"),
            password=config.get("password", ""),
            database=config.get("database"),
            cursorclass=pymysql.cursors.DictCursor
        )
        clean_query = query.strip().rstrip(";")
        if limit and limit > 0:
            if "LIMIT" not in clean_query.upper():
                final_query = f"{clean_query} LIMIT {limit}"
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
        conn = pymysql.connect(
            host=config.get("host", "localhost"),
            port=int(config.get("port", 3306)),
            user=config.get("username", "root"),
            password=config.get("password", ""),
            database=config.get("database")
        )
        try:
            with conn.cursor() as cursor:
                cursor.execute("SHOW TABLES")
                tables = [row[0] for row in cursor.fetchall()]
                return tables
        finally:
            conn.close()
