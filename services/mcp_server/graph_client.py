import os
import logging
from typing import List, Dict, Any, Optional
from neo4j import GraphDatabase, AsyncGraphDatabase

logger = logging.getLogger(__name__)

class GraphClient:
    def __init__(self):
        self.uri = os.getenv("NEO4J_URI", "bolt://neo4j:7687")
        self.user = os.getenv("NEO4J_USER", "neo4j")
        self.password = os.getenv("NEO4J_PASSWORD", "neo4j_secret_change_me")
        self._driver = None

    def get_driver(self):
        if self._driver is None:
            try:
                self._driver = AsyncGraphDatabase.driver(
                    self.uri,
                    auth=(self.user, self.password)
                )
            except Exception as e:
                logger.error(f"Failed to create Neo4j driver: {e}")
                raise
        return self._driver

    async def close(self):
        if self._driver:
            await self._driver.close()
            self._driver = None

    async def get_entity_profile(self, entity_name: str) -> Dict[str, Any]:
        """
        Retrieves an entity's profile, including its labels, properties, and connected relationships.
        """
        driver = self.get_driver()
        query = """
        MATCH (e:Entity)
        WHERE toLower(e.name) = toLower($name)
        OPTIONAL MATCH (e)-[r]-(neighbor:Entity)
        RETURN e.name AS name,
               e.type AS type,
               e.description AS description,
               properties(e) AS properties,
               collect(DISTINCT {
                   relation: type(r),
                   target: neighbor.name,
                   target_type: neighbor.type,
                   properties: properties(r)
               })[0..30] AS connections
        LIMIT 1
        """
        try:
            async with driver.session() as session:
                result = await session.run(query, {"name": entity_name})
                record = await result.single()
                if record:
                    return {
                        "name": record["name"],
                        "type": record["type"],
                        "description": record.get("description", ""),
                        "properties": record["properties"],
                        "connections": record["connections"]
                    }
                return {}
        except Exception as e:
            logger.error(f"Error getting entity profile for {entity_name}: {e}")
            return {}

    async def find_connections(self, entity_a: str, entity_b: str, max_depth: int = 3) -> List[Dict[str, Any]]:
        """
        Finds the shortest paths and relationships connecting two entities.
        """
        driver = self.get_driver()
        query = f"""
        MATCH (a:Entity), (b:Entity)
        WHERE toLower(a.name) = toLower($name_a) AND toLower(b.name) = toLower($name_b)
        MATCH p = shortestPath((a)-[*1..{max_depth}]-(b))
        RETURN [node in nodes(p) | {{name: node.name, type: node.type}}] AS path_nodes,
               [rel in relationships(p) | {{type: type(rel), props: properties(rel)}}] AS path_rels
        LIMIT 5
        """
        try:
            async with driver.session() as session:
                result = await session.run(query, {"name_a": entity_a, "name_b": entity_b})
                records = await result.data()
                return records
        except Exception as e:
            logger.error(f"Error finding connections between {entity_a} and {entity_b}: {e}")
            return []

    async def get_network_insights(self, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Retrieves top central nodes, hubs, or community bridges to enhance LLM reasoning.
        """
        driver = self.get_driver()
        query = """
        MATCH (e:Entity)
        OPTIONAL MATCH (e)-[r]-()
        WITH e, count(r) AS degree
        ORDER BY degree DESC
        LIMIT $limit
        RETURN e.name AS name, e.type AS type, degree
        """
        try:
            async with driver.session() as session:
                result = await session.run(query, {"limit": limit})
                records = await result.data()
                return records
        except Exception as e:
            logger.error(f"Error getting network insights: {e}")
            return []
