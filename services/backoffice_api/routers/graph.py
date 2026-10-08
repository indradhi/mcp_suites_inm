import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, HTTPException
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

@router.post("/remap")
async def remap_graph(
    clear_existing: bool = Query(True, description="Clear existing neo4j nodes before mapping"),
    user = Depends(get_current_user)
):
    try:
        result = graph_remapper.remap_all(clear_existing=clear_existing)
        return result
    except Exception as e:
        logger.error(f"Graph remapping failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

