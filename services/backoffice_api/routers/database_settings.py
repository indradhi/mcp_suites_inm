import logging
from typing import Dict, Any
from pydantic import BaseModel
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from services.database_settings_service import database_settings_service
from services.graph.neo4j_client import neo4j_client
from services.vector_store import vector_store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/settings/database", tags=["Database Settings"])

class DatabaseSettingsPayload(BaseModel):
    VECTOR_DB_PROVIDER: str = None
    CHROMADB_HOST: str = None
    CHROMADB_PORT: int = None
    CHROMADB_COLLECTION: str = None
    QDRANT_HOST: str = None
    QDRANT_PORT: int = None
    QDRANT_COLLECTION: str = None
    QDRANT_API_KEY: str = None
    QDRANT_HTTPS: bool = None
    NEO4J_URI: str = None
    NEO4J_USER: str = None
    NEO4J_PASSWORD: str = None

@router.get("")
def get_database_settings(db: Session = Depends(get_db)):
    settings = database_settings_service.get_settings(db)
    return {
        "status": "success",
        "settings": settings
    }

@router.put("")
def update_database_settings(payload: DatabaseSettingsPayload, db: Session = Depends(get_db)):
    # Filter out None values
    payload_dict = {k: v for k, v in payload.model_dump().items() if v is not None}
    
    # Save to database
    updated_settings = database_settings_service.save_settings(db, payload_dict)
    
    # Reset active connections so they reload from the new settings
    neo4j_client.close()
    
    # Reset vector store client
    vector_store._client = None
    vector_store._collection = None
    
    return {
        "status": "success",
        "message": "Database settings updated successfully. Active connections will be re-established.",
        "settings": updated_settings
    }

@router.post("/test")
def test_database_connection(payload: DatabaseSettingsPayload):
    results = {
        "neo4j": {"success": False, "message": ""},
        "vector_db": {"success": False, "message": ""}
    }

    # Test Neo4j
    try:
        from neo4j import GraphDatabase
        uri = payload.NEO4J_URI or ""
        user = payload.NEO4J_USER or ""
        password = payload.NEO4J_PASSWORD or ""
        
        driver = GraphDatabase.driver(uri, auth=(user, password), max_connection_lifetime=5)
        driver.verify_connectivity()
        driver.close()
        results["neo4j"]["success"] = True
        results["neo4j"]["message"] = "Connected successfully"
    except Exception as e:
        results["neo4j"]["message"] = str(e)

    # Test Vector DB
    try:
        if payload.VECTOR_DB_PROVIDER in ["chroma", "chromadb"] or not payload.VECTOR_DB_PROVIDER:
            import chromadb

            from chromadb.config import Settings
            client = chromadb.HttpClient(
                host=payload.CHROMADB_HOST or "localhost",
                port=payload.CHROMADB_PORT or 8000,
                settings=Settings(allow_reset=False, anonymized_telemetry=False)
            )
            client.heartbeat()
            results["vector_db"]["success"] = True
            results["vector_db"]["message"] = "Connected successfully"
        elif payload.VECTOR_DB_PROVIDER == "qdrant":
            # Qdrant test logic can go here. Since qdrant-client might not be installed, we return a warning or mock it.
            results["vector_db"]["success"] = False
            results["vector_db"]["message"] = "Qdrant provider selected but test is not yet fully implemented in vector_store."
    except Exception as e:
        results["vector_db"]["message"] = str(e)
        
    return {
        "status": "success",
        "results": results
    }
