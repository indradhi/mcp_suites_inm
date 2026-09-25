import logging
from typing import List, Dict, Any, Optional
from neo4j import GraphDatabase
from config import settings

logger = logging.getLogger(__name__)

from database import SessionLocal
from services.database_settings_service import database_settings_service

class Neo4jClient:
    def __init__(self):
        self._driver = None

    def get_driver(self):
        if self._driver is None:
            try:
                # Fetch dynamic settings from DB
                db = SessionLocal()
                try:
                    db_config = database_settings_service.get_settings(db)
                finally:
                    db.close()

                uri = db_config.get("NEO4J_URI") or settings.NEO4J_URI
                user = db_config.get("NEO4J_USER") or settings.NEO4J_USER
                password = db_config.get("NEO4J_PASSWORD") or settings.NEO4J_PASSWORD

                self._driver = GraphDatabase.driver(
                    uri,
                    auth=(user, password),
                    max_connection_lifetime=3600
                )
                self.init_schema()
            except Exception as e:
                logger.error(f"Failed to connect to Neo4j: {e}")
                raise
        return self._driver

    def init_schema(self):
        """
        Creates constraints and indexes for high performance querying.
        """
        queries = [
            "CREATE CONSTRAINT entity_name_unique IF NOT EXISTS FOR (e:Entity) REQUIRE e.name IS UNIQUE",
            "CREATE INDEX entity_type_idx IF NOT EXISTS FOR (e:Entity) ON (e.type)"
        ]
        with self._driver.session() as session:
            for q in queries:
                try:
                    session.run(q)
                except Exception as e:
                    logger.debug(f"Index creation note: {e}")

    def execute_read(self, query: str, parameters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        driver = self.get_driver()
        with driver.session() as session:
            result = session.run(query, parameters or {})
            return [dict(record) for record in result]

    def execute_write(self, query: str, parameters: Optional[Dict[str, Any]] = None):
        driver = self.get_driver()
        with driver.session() as session:
            session.run(query, parameters or {})

    def close(self):
        if self._driver:
            self._driver.close()
            self._driver = None

neo4j_client = Neo4jClient()
