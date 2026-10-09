import logging
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from security import get_current_user
from services.graph.analytics import graph_analytics
from services.graph.insight_generator import insight_generator
from services.graph.graph_remapper import graph_remapper

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/graph", tags=["Network Profiling & Graph"])

@router.get("/subgraph")
def get_graph_subgraph(limit: int = Query(100, le=500), user = Depends(get_current_user)):
    try:
        return graph_analytics.get_full_subgraph(limit_nodes=limit)
    except Exception as e:
        logger.error(f"Neo4j subgraph query error: {e}")
        return {
            "elements": {"nodes": [], "edges": []},
            "error": f"Neo4j connection error: {str(e)}",
            "hint": "Verify that Neo4j container is running and NEO4J_URI=bolt://neo4j:7687 is set in .env."
        }

@router.get("/metrics")
def get_graph_metrics(user = Depends(get_current_user)):
    try:
        return graph_analytics.compute_network_metrics()
    except Exception as e:
        logger.error(f"Neo4j metrics query error: {e}")
        return {
            "nodes_count": 0,
            "edges_count": 0,
            "density": 0.0,
            "components_count": 0,
            "top_influencers": [],
            "error": f"Neo4j connection error: {str(e)}"
        }

@router.get("/profile/{entity_name}")
def get_entity_profile(entity_name: str, user = Depends(get_current_user)):
    profile = insight_generator.get_entity_profiling_summary(entity_name)
    if not profile:
        raise HTTPException(status_code=404, detail="Entity not found in network")
    return profile

@router.get("/connections")
def find_connections(
    source: str = Query(..., description="Source entity name"),
    target: str = Query(..., description="Target entity name"),
    user = Depends(get_current_user)
):
    paths = graph_analytics.find_path(source, target)
    return {"source": source, "target": target, "paths": paths}

@router.get("/insights")
async def get_insights(db: Session = Depends(get_db), user = Depends(get_current_user)):
    insights = await insight_generator.generate_network_insights(db)
    return {"insights": insights}

from fastapi import BackgroundTasks

@router.post("/remap")
async def remap_graph(
    background_tasks: BackgroundTasks,
    clear_existing: bool = Query(True, description="Clear existing neo4j nodes before mapping"),
    user = Depends(get_current_user)
):
    try:
        # Menjalankan task yang berat di background agar tidak 504 Timeout
        background_tasks.add_task(graph_remapper.remap_all, clear_existing)
        return {
            "status": "success",
            "chunks_processed": "Berjalan di background",
            "entities_created": "[Sedang diproses]",
            "relationships_created": "[Sedang diproses]"
        }
    except Exception as e:
        logger.error(f"Graph remapping failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/remap/status")
async def remap_status(user = Depends(get_current_user)):
    return graph_remapper.get_status()

@router.delete("/clear")
def clear_graph_endpoint(user = Depends(get_current_user)):
    try:
        from services.graph.neo4j_client import neo4j_client
        neo4j_client.execute_write("MATCH (n) DETACH DELETE n")
        return {"status": "success", "message": "Graph cleared successfully"}
    except Exception as e:
        logger.error(f"Failed to clear graph: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class TestMappingRequest(BaseModel):
    mapping_type: str

@router.post("/test-mapping")
def test_mapping_endpoint(req: TestMappingRequest, user = Depends(get_current_user)):
    try:
        from services.vector_store import vector_store
        from services.llm_service import llm_service
        from database import SessionLocal
        
        # 1. Fetch a document based on mapping_type (simple keyword heuristic)
        collection = vector_store.get_collection()
        docs = collection.get(limit=50)
        documents = docs.get("documents", [])
        
        target_doc = None
        kw = ""
        if req.mapping_type == "Pemetaan Orang":
            kw = "bapak|ibu|nama"
        elif req.mapping_type == "Perusahaan":
            kw = "pt|cv|perusahaan|corp|tbk"
        elif req.mapping_type == "Komunikasi":
            kw = "email|telepon|pesan|surat|whatsapp|chat"
        elif req.mapping_type == "Data Bank":
            kw = "bank|rekening|transfer|mutasi|saldo"
            
        import re
        if kw:
            for d in documents:
                if re.search(kw, d, re.IGNORECASE):
                    target_doc = d
                    break
                    
        if not target_doc and documents:
            target_doc = documents[0] # fallback
        elif not target_doc:
            target_doc = f"Contoh data dummy untuk test mapping {req.mapping_type} karena vector store kosong."
            
        # 2. Extract using LLM Service
        db = SessionLocal()
        try:
            extracted = llm_service.extract_entities_and_relations(target_doc, db=db)
        finally:
            db.close()
            
        return {
            "status": "success", 
            "mapping_type": req.mapping_type,
            "source_data": target_doc,
            "entities": extracted.get("entities", []),
            "relationships": extracted.get("relationships", [])
        }
    except Exception as e:
        logger.error(f"Failed test mapping: {e}")
        raise HTTPException(status_code=500, detail=str(e))

