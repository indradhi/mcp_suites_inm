import psycopg2
from psycopg2.extras import RealDictCursor
import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

class PostgresAdapter:
    @staticmethod
    def test_connection(config: Dict[str, Any]) -> bool:
        try:
            conn = psycopg2.connect(
                host=config.get("host", "localhost"),
                port=int(config.get("port", 5432)),
                user=config.get("username", "postgres"),
                password=config.get("password", ""),
                dbname=config.get("database", "postgres"),
                connect_timeout=5
            )
            conn.close()
            return True
        except Exception as e:
            logger.error(f"PostgreSQL connection test failed: {e}")
            raise

    @staticmethod
    def execute_query(config: Dict[str, Any], query: str, limit: int = 1000, return_columns: bool = False) -> Any:
        conn = psycopg2.connect(
            host=config.get("host", "localhost"),
            port=int(config.get("port", 5432)),
            user=config.get("username", "postgres"),
            password=config.get("password", ""),
            dbname=config.get("database", "postgres")
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
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(final_query)
                columns = [col[0] for col in cursor.description] if cursor.description else []
                if limit and limit > 0:
                    records = cursor.fetchmany(limit)
                else:
                    records = cursor.fetchall()
                results = [dict(r) for r in records]
                if return_columns:
                    return results, columns
                return results
        finally:
            conn.close()

    @staticmethod
    def inspect_tables(config: Dict[str, Any]) -> List[str]:
        conn = psycopg2.connect(
            host=config.get("host", "localhost"),
            port=int(config.get("port", 5432)),
            user=config.get("username", "postgres"),
            password=config.get("password", ""),
            dbname=config.get("database", "postgres")
        )
        try:
            with conn.cursor() as cursor:
                cursor.execute("""
                    SELECT table_name FROM information_schema.tables 
                    WHERE table_schema = 'public'
                """)
                tables = [row[0] for row in cursor.fetchall()]
                return tables
        finally:
            conn.close()
