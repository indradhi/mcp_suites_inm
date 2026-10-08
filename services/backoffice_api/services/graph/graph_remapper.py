import logging
from typing import Dict, Any

from services.vector_store import vector_store
from services.llm_service import llm_service
from services.graph.graph_builder import graph_builder
from services.graph.neo4j_client import neo4j_client
from database import SessionLocal

logger = logging.getLogger(__name__)

class GraphRemapper:
    def remap_all(self, clear_existing: bool = True) -> Dict[str, Any]:
        """
        Fetches all text chunks from vector store, re-extracts entities using the updated
        strict LLM schema, and upserts them back to Neo4j.
        
        Args:
            clear_existing (bool): If True, deletes all nodes in Neo4j before re-mapping 
                                   to ensure a completely clean state.
        """
        logger.info("Starting comprehensive graph re-mapping...")
        
        collection = vector_store.get_collection()
        all_documents = []
        all_metadatas = []
        
        offset = 0
        limit = 100
        
        try:
            while True:
                res = collection.get(limit=limit, offset=offset)
                docs = res.get("documents", [])
                metas = res.get("metadatas", [])
                
                if not docs:
                    break
                    
                all_documents.extend(docs)
                all_metadatas.extend(metas)
                
                if len(docs) < limit:
                    break
                    
                offset += limit
        except Exception as e:
            logger.error(f"Failed to fetch data from vector store: {e}")
            # Fallback if limit/offset is not perfectly supported
            try:
                res = collection.get()
                all_documents = res.get("documents", [])
                all_metadatas = res.get("metadatas", [])
            except Exception as e2:
                return {"status": "error", "message": f"Vector fetch failed: {e2}"}

        total_chunks = len(all_documents)
        logger.info(f"Found {total_chunks} chunks to remap.")

        if clear_existing:
            try:
                neo4j_client.execute_write("MATCH (n) DETACH DELETE n")
                logger.info("Cleared existing Neo4j graph for fresh re-mapping.")
            except Exception as e:
                logger.error(f"Failed to clear Neo4j: {e}")

        total_entities = 0
        total_rels = 0
        
        # We need a DB session for llm_service
        db = SessionLocal()
        
        try:
            for i, (doc, meta) in enumerate(zip(all_documents, all_metadatas)):
                if not doc:
                    continue
                    
                # The meta might be None in some DBs
                meta = meta or {}
                source_id = meta.get("source_id", 0)
                source_name = meta.get("source_name", "Remapper")
                
                logger.info(f"Remapping chunk {i+1}/{total_chunks} (Source: {source_name})")
                
                # Re-extract
                extracted = llm_service.extract_entities_and_relations(doc, db=db)
                entities = extracted.get("entities", [])
                relationships = extracted.get("relationships", [])
                
                # Re-insert
                if entities:
                    inserted_ents = graph_builder.upsert_entities(entities, source_id, source_name)
                    total_entities += inserted_ents
                if relationships:
                    inserted_rels = graph_builder.upsert_relationships(relationships, source_id)
                    total_rels += inserted_rels
        finally:
            db.close()
                
        logger.info(f"Graph remapping completed. Inserted {total_entities} entities and {total_rels} relationships.")
        return {
            "status": "success",
            "chunks_processed": total_chunks,
            "entities_created": total_entities,
            "relationships_created": total_rels
        }

graph_remapper = GraphRemapper()
