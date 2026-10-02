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
    vector_store.reload()
    
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
            import requests

            raw_host = (payload.QDRANT_HOST or "").strip()
            if not raw_host:
                raise ValueError("Qdrant Host / IP Address is required")

            port = payload.QDRANT_PORT or 6333
            collection = (payload.QDRANT_COLLECTION or "").strip()
            api_key = (payload.QDRANT_API_KEY or "").strip()
            use_https = bool(payload.QDRANT_HTTPS)

            # Build URL correctly
            if raw_host.startswith("http://") or raw_host.startswith("https://"):
                base_url = raw_host.rstrip("/")
                host_without_proto = base_url.split("://", 1)[1]
                if ":" not in host_without_proto and port:
                    base_url = f"{base_url}:{port}"
            else:
                scheme = "https" if use_https else "http"
                base_url = f"{scheme}://{raw_host}:{port}"

            headers = {}
            if api_key:
                headers["api-key"] = api_key

            # 1. Connect to Qdrant server root
            try:
                root_resp = requests.get(f"{base_url}/", headers=headers, timeout=6)
            except requests.exceptions.RequestException as req_err:
                raise Exception(f"Cannot reach Qdrant server at {base_url}: {req_err}")

            if root_resp.status_code in (401, 403):
                raise Exception(f"Qdrant Authentication Failed (HTTP {root_resp.status_code}): Invalid or unauthorized API Key")
            elif root_resp.status_code != 200:
                raise Exception(f"Qdrant server returned HTTP {root_resp.status_code}: {root_resp.text[:200]}")

            version_str = ""
            try:
                version_str = root_resp.json().get("version", "")
            except Exception:
                pass

            # 2. Check collection if specified
            if collection:
                col_resp = requests.get(f"{base_url}/collections/{collection}", headers=headers, timeout=6)
                if col_resp.status_code == 200:
                    col_data = col_resp.json().get("result", {})
                    status_col = col_data.get("status", "ok")
                    points_count = col_data.get("points_count", 0)
                    v_params = col_data.get("config", {}).get("params", {}).get("vectors", {})
                    v_dim = v_params.get("size", "unknown") if isinstance(v_params, dict) else "unknown"

                    ver_info = f" (v{version_str})" if version_str else ""
                    results["vector_db"]["success"] = True
                    results["vector_db"]["message"] = (
                        f"Connected successfully to Qdrant{ver_info}, collection '{collection}' "
                        f"(Status: {status_col}, Points: {points_count}, Vector Dim: {v_dim})"
                    )
                elif col_resp.status_code == 404:
                    results["vector_db"]["success"] = True
                    results["vector_db"]["message"] = (
                        f"Connected successfully to Qdrant (v{version_str}). "
                        f"Collection '{collection}' does not exist yet and will be created automatically on first ingestion."
                    )
                elif col_resp.status_code in (401, 403):
                    results["vector_db"]["success"] = False
                    results["vector_db"]["message"] = (
                        f"Connected to Qdrant server, but API Key is not authorized for collection '{collection}' "
                        f"(HTTP {col_resp.status_code})."
                    )
                else:
                    results["vector_db"]["success"] = False
                    results["vector_db"]["message"] = (
                        f"Connected to Qdrant, but checking collection '{collection}' failed with HTTP {col_resp.status_code}: "
                        f"{col_resp.text[:200]}"
                    )
            else:
                ver_info = f" (v{version_str})" if version_str else ""
                results["vector_db"]["success"] = True
                results["vector_db"]["message"] = f"Connected successfully to Qdrant server{ver_info}."
    except Exception as e:
        results["vector_db"]["message"] = str(e)
        
    return {
        "status": "success",
        "results": results
    }
