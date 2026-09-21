import logging
from typing import List, Dict, Any
from services.graph.neo4j_client import neo4j_client
from services.graph.entity_resolver import entity_resolver

logger = logging.getLogger(__name__)

class GraphBuilder:
    def upsert_entities(self, entities: List[Dict[str, Any]], source_id: int, source_name: str) -> int:
        if not entities:
            return 0

        query = """
        UNWIND $batch AS item
        MERGE (e:Entity {name: item.name})
        ON CREATE SET 
            e.type = item.type,
            e.description = item.description,
            e.source_id = $source_id,
            e.source_name = $source_name,
            e.created_at = datetime()
        ON MATCH SET
            e.type = CASE WHEN e.type = 'UNKNOWN' THEN item.type ELSE e.type END,
            e.updated_at = datetime()
        """
        clean_batch = []
        for ent in entities:
            resolved = entity_resolver.resolve_entity(ent)
            if resolved["name"]:
                clean_batch.append(resolved)

        if clean_batch:
            neo4j_client.execute_write(
                query,
                {
                    "batch": clean_batch,
                    "source_id": source_id,
                    "source_name": source_name
                }
            )
        return len(clean_batch)

    def upsert_relationships(self, relationships: List[Dict[str, Any]], source_id: int) -> int:
        if not relationships:
            return 0

        created = 0
        for rel in relationships:
            src = entity_resolver.normalize_name(rel.get("source", ""))
            dst = entity_resolver.normalize_name(rel.get("target", ""))
            rel_type = rel.get("relation", "RELATED_TO").upper().replace(" ", "_").replace("-", "_")

            # Sanitize rel_type for Cypher
            rel_type = "".join(c for c in rel_type if c.isalnum() or c == "_")
            if not rel_type:
                rel_type = "RELATED_TO"

            if not src or not dst or src.lower() == dst.lower():
                continue

            query = f"""
            MERGE (a:Entity {{name: $src}})
            ON CREATE SET 
                a.type = 'UNKNOWN',
                a.source_id = $source_id,
                a.created_at = datetime()
            MERGE (b:Entity {{name: $dst}})
            ON CREATE SET 
                b.type = 'UNKNOWN',
                b.source_id = $source_id,
                b.created_at = datetime()
            MERGE (a)-[r:{rel_type}]->(b)
            ON CREATE SET 
                r.source_id = $source_id,
                r.created_at = datetime(),
                r.weight = 1.0
            ON MATCH SET 
                r.weight = coalesce(r.weight, 1.0) + 0.5,
                r.updated_at = datetime()
            """
            try:
                neo4j_client.execute_write(query, {"src": src, "dst": dst, "source_id": source_id})
                created += 1
            except Exception as e:
                logger.warning(f"Failed to create relationship {src} -[{rel_type}]-> {dst}: {e}")

        return created

    def get_entity_count_by_source(self, source_id: int) -> int:
        """Returns the number of unique entities in Neo4j linked to a specific source_id."""
        query = "MATCH (e:Entity {source_id: $source_id}) RETURN count(e) AS cnt"
        try:
            records = neo4j_client.execute_read(query, {"source_id": int(source_id)})
            if records and len(records) > 0:
                return records[0].get("cnt", 0)
        except Exception as e:
            logger.warning(f"Failed to get entity count for source {source_id}: {e}")
        return 0

graph_builder = GraphBuilder()
