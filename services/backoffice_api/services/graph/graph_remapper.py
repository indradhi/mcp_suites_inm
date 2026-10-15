import logging
from typing import Dict, Any

from services.vector_store import vector_store
from services.vector_sync_service import vector_sync_service
from services.llm_service import llm_service
from services.graph.graph_builder import graph_builder
from services.graph.neo4j_client import neo4j_client
from database import SessionLocal

logger = logging.getLogger(__name__)

class GraphRemapper:
    def __init__(self):
        self.is_running = False
        self.status = "Idle"
        self.progress = {"current": 0, "total": 0, "entities": 0, "relationships": 0}
        self.last_result = None
        self.last_error = None

    def get_status(self) -> Dict[str, Any]:
        return {
            "is_running": self.is_running,
            "status": self.status,
            "progress": self.progress,
            "last_result": self.last_result,
            "last_error": self.last_error
        }

    def remap_all(self, clear_existing: bool = True) -> Dict[str, Any]:
        if self.is_running:
            return {"status": "error", "message": "Remapping is already in progress"}
            
        self.is_running = True
        self.status = "Starting..."
        self.progress = {"current": 0, "total": 0, "entities": 0, "relationships": 0}
        self.last_error = None
        
        logger.info("Starting comprehensive graph re-mapping...")
        
        try:
            collection = vector_store.get_collection()
            all_documents = []
            all_metadatas = []
            
            offset = 0
            limit = 100
            
            try:
                self.status = "Fetching documents from vector store..."
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
                # Fallback if limit/offset is not supported
                try:
                    res = collection.get()
                    all_documents = res.get("documents", [])
                    all_metadatas = res.get("metadatas", [])
                except Exception as e2:
                    self.status = f"Error: Vector fetch failed: {e2}"
                    self.last_error = str(e2)
                    return {"status": "error", "message": f"Vector fetch failed: {e2}"}

            # Safety check & fallback: If ChromaDB has 0 chunks, try to pull from Qdrant
            if not all_documents:
                logger.warning("No chunks found in ChromaDB collection. Checking Qdrant fallback...")
                self.status = "ChromaDB kosong. Mencoba auto-sync dari Qdrant..."
                try:
                    sync_res = vector_sync_service.sync(direction="qdrant_to_chromadb")
                    if sync_res.get("status") == "success" and sync_res.get("synced_count", 0) > 0:
                        logger.info(f"Auto-synced {sync_res['synced_count']} chunks from Qdrant to ChromaDB.")
                        res = collection.get()
                        all_documents = res.get("documents", [])
                        all_metadatas = res.get("metadatas", [])
                except Exception as sync_err:
                    logger.warning(f"Auto-sync from Qdrant failed: {sync_err}")

            total_chunks = len(all_documents)
            self.progress["total"] = total_chunks
            logger.info(f"Found {total_chunks} chunks to remap.")

            # CRITICAL SAFETY RULE: Never delete Neo4j graph if there are no chunks to map!
            if total_chunks == 0:
                self.status = "Aborted: Tidak ada data chunk dokumen di Vector Database."
                msg = "Tidak ada data dokumen/chunk di Vector Database untuk di-remap. Graph yang ada tetap dipertahankan dan tidak dihapus."
                logger.warning(msg)
                self.last_result = {
                    "status": "error",
                    "message": msg,
                    "chunks_processed": 0,
                    "entities_created": 0,
                    "relationships_created": 0
                }
                return self.last_result

            if clear_existing:
                try:
                    self.status = "Clearing existing graph..."
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
                        
                    meta = meta or {}
                    source_id = meta.get("source_id", 0)
                    source_name = meta.get("source_name", "Remapper")
                    
                    self.status = f"Remapping chunk {i+1}/{total_chunks}"
                    self.progress["current"] = i + 1
                    logger.info(f"Remapping chunk {i+1}/{total_chunks} (Source: {source_name})")
                    
                    # Re-extract
                    extracted = llm_service.extract_entities_and_relations(doc, db=db)
                    entities = extracted.get("entities", [])
                    relationships = extracted.get("relationships", [])
                    
                    # Re-insert
                    if entities:
                        inserted_ents = graph_builder.upsert_entities(entities, source_id, source_name)
                        total_entities += inserted_ents
                        self.progress["entities"] = total_entities
                    if relationships:
                        inserted_rels = graph_builder.upsert_relationships(relationships, source_id)
                        total_rels += inserted_rels
                        self.progress["relationships"] = total_rels
            finally:
                db.close()
                    
            logger.info(f"Graph remapping completed. Inserted {total_entities} entities and {total_rels} relationships.")
            self.status = "Completed"
            self.last_result = {
                "status": "success",
                "chunks_processed": total_chunks,
                "entities_created": total_entities,
                "relationships_created": total_rels
            }
            return self.last_result
        except Exception as ex:
            self.status = f"Error: {ex}"
            self.last_error = str(ex)
            logger.error(f"Remapping error: {ex}")
            raise ex
        finally:
            self.is_running = False

graph_remapper = GraphRemapper()
