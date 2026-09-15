import oracledb
import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

class OracleAdapter:
    @staticmethod
    def _get_connection(config: Dict[str, Any]):
        host = config.get("host", "localhost")
        port = int(config.get("port", 1521))
        user = config.get("username", "system")
        password = config.get("password", "")
        service_name = config.get("service_name") or config.get("database")
        sid = config.get("sid")

        if sid:
            dsn = oracledb.makedsn(host, port, sid=sid)
        else:
            dsn = oracledb.makedsn(host, port, service_name=service_name or "ORCL")

        return oracledb.connect(user=user, password=password, dsn=dsn)

    @classmethod
    def test_connection(cls, config: Dict[str, Any]) -> bool:
        try:
            conn = cls._get_connection(config)
            with conn.cursor() as cursor:
                cursor.execute("SELECT 1 FROM DUAL")
                cursor.fetchone()
            conn.close()
            return True
        except Exception as e:
            logger.error(f"Oracle connection test failed: {e}")
            raise

    @classmethod
    def execute_query(cls, config: Dict[str, Any], query: str, limit: int = 1000) -> List[Dict[str, Any]]:
        conn = cls._get_connection(config)
        clean_query = query.strip().rstrip(";")
        if limit and limit > 0:
            if "ROWNUM" not in clean_query.upper() and "FETCH" not in clean_query.upper():
                final_query = f"SELECT * FROM ({clean_query}) WHERE ROWNUM <= {limit}"
            else:
                final_query = clean_query
        else:
            final_query = clean_query

        try:
            with conn.cursor() as cursor:
                cursor.execute(final_query)
                columns = [col[0].lower() for col in cursor.description]
                if limit and limit > 0:
                    rows = cursor.fetchmany(limit)
                else:
                    rows = cursor.fetchall()
                records = []
                for row in rows:
                    records.append(dict(zip(columns, row)))
                return records
        finally:
            conn.close()

    @classmethod
    def inspect_tables(cls, config: Dict[str, Any]) -> List[str]:
        conn = cls._get_connection(config)
        try:
            with conn.cursor() as cursor:
                cursor.execute("SELECT table_name FROM user_tables ORDER BY table_name")
                tables = [row[0] for row in cursor.fetchall()]
                return tables
        finally:
            conn.close()
