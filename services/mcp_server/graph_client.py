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

    async def get_connected_context_network(self, entity_name: str, max_depth: int = 2) -> Dict[str, Any]:
        """
        Retrieves the bounded entity network for context isolation.
        Finds the root entity and its 1-hop and 2-hop connected network in Neo4j.
        Returns all allowed entity names, identifiers, properties, and relationships.
        """
        driver = self.get_driver()
        clean_name = entity_name.strip()
        words = [w for w in clean_name.lower().split() if len(w) >= 3]

        query = """
        MATCH (root:Entity)
        WHERE toLower(root.name) = toLower($name)
           OR (size($name) >= 4 AND toLower(root.name) CONTAINS toLower($name))
           OR any(w IN $words WHERE toLower(root.name) CONTAINS w)
        OPTIONAL MATCH (root)-[r1]-(n1:Entity)
        OPTIONAL MATCH (n1)-[r2]-(n2:Entity)
        WHERE n2 <> root
        WITH root,
             collect(DISTINCT {
                 name: n1.name,
                 type: coalesce(n1.type, 'ENTITY'),
                 relation: type(r1),
                 properties: properties(n1)
             })[0..40] AS hop1_nodes,
             collect(DISTINCT {
                 name: n2.name,
                 type: coalesce(n2.type, 'ENTITY'),
                 relation: type(r2),
                 properties: properties(n2)
             })[0..40] AS hop2_nodes
        RETURN root.name AS root_name,
               root.type AS root_type,
               properties(root) AS root_properties,
               hop1_nodes,
               hop2_nodes
        LIMIT 5
        """
        try:
            async with driver.session() as session:
                result = await session.run(query, {"name": clean_name, "words": words})
                records = await result.data()
                if not records:
                    return {
                        "is_mapped": False,
                        "root_name": clean_name,
                        "allowed_names": [clean_name],
                        "allowed_identifiers": [],
                        "hop1_nodes": [],
                        "hop2_nodes": [],
                        "total_network_size": 1
                    }

                # Combine across matching root entities
                allowed_names = set()
                allowed_identifiers = set()
                hop1_all = []
                hop2_all = []
                primary_root = records[0]["root_name"]
                primary_type = records[0]["root_type"]

                for rec in records:
                    r_name = rec["root_name"]
                    allowed_names.add(r_name)
                    r_props = rec.get("root_properties") or {}
                    for k, v in r_props.items():
                        if isinstance(v, (str, int)) and len(str(v)) >= 4:
                            allowed_identifiers.add(str(v))

                    for h1 in rec.get("hop1_nodes", []):
                        h1_name = h1.get("name")
                        if h1_name:
                            allowed_names.add(h1_name)
                            if not any(x.get("name") == h1_name for x in hop1_all):
                                hop1_all.append(h1)
                            for k, v in (h1.get("properties") or {}).items():
                                if isinstance(v, (str, int)) and len(str(v)) >= 4:
                                    allowed_identifiers.add(str(v))

                    for h2 in rec.get("hop2_nodes", []):
                        h2_name = h2.get("name")
                        if h2_name:
                            allowed_names.add(h2_name)
                            if not any(x.get("name") == h2_name for x in hop2_all):
                                hop2_all.append(h2)
                            for k, v in (h2.get("properties") or {}).items():
                                if isinstance(v, (str, int)) and len(str(v)) >= 4:
                                    allowed_identifiers.add(str(v))

                return {
                    "is_mapped": True,
                    "root_name": primary_root,
                    "root_type": primary_type,
                    "allowed_names": list(allowed_names),
                    "allowed_identifiers": list(allowed_identifiers),
                    "hop1_nodes": hop1_all,
                    "hop2_nodes": hop2_all,
                    "total_network_size": len(allowed_names)
                }
        except Exception as e:
            logger.error(f"Error getting connected context network for {entity_name}: {e}")
            return {
                "is_mapped": False,
                "root_name": clean_name,
                "allowed_names": [clean_name],
                "allowed_identifiers": [],
                "hop1_nodes": [],
                "hop2_nodes": [],
                "total_network_size": 1
            }
