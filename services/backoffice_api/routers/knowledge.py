import os
import re
import math
import shutil
import logging
import json
import copy
from datetime import datetime
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from models.knowledge_source import KnowledgeSource, KnowledgeDocument
from models.ingest_job import IngestJob
from security import get_current_user, require_role
from config import settings
from services.vector_store import vector_store
from services.ingestion.database_ingester import database_ingester
from services.ingestion.api_ingester import api_ingester
from services.ingestion.mcp_ingester import mcp_ingester
from services.personality_service import personality_service
from tasks.ingest_tasks import run_ingest_source_task

router = APIRouter(prefix="/knowledge", tags=["Knowledge Sources"])

class SourceCreate(BaseModel):
    name: str
    source_type: str # database, api, website, websearch, google_drive, mcp
    description: Optional[str] = None
    config: Dict[str, Any]
    schedule_cron: Optional[str] = None
    is_active: Optional[bool] = None
    cache_ttl_minutes: Optional[int] = None  # None = caching disabled; N = TTL in minutes

class TestConnectionRequest(BaseModel):
    source_type: str
    config: Dict[str, Any]

@router.get("/sources")
def list_sources(db: Session = Depends(get_db), user = Depends(get_current_user)):
    sources = db.query(KnowledgeSource).order_by(KnowledgeSource.created_at.desc()).all()
    results = []
    
    coll = None
    try:
        coll = vector_store.get_collection()
    except Exception:
        pass

    for s in sources:
        doc_count = 0
        # Check actual vector chunks in ChromaDB first
        if coll:
            try:
                chroma_res = coll.get(where={"source_id": s.id}, include=[])
                if chroma_res and "ids" in chroma_res:
                    doc_count = len(chroma_res["ids"])
            except Exception:
                pass

        if doc_count == 0:
            doc_count = db.query(KnowledgeDocument).filter(KnowledgeDocument.source_id == s.id).count()
            if doc_count == 0:
                latest_job = db.query(IngestJob).filter(IngestJob.source_id == s.id, IngestJob.status == "completed").order_by(IngestJob.id.desc()).first()
                if latest_job and latest_job.chunks_created:
                    doc_count = latest_job.chunks_created

        conf = s.config or {}
        validity_tier = conf.get("validity_tier") or ("authoritative" if s.source_type in ["database", "api"] and (conf.get("is_tool") or conf.get("parameters")) else "secondary")
        default_score = 95 if validity_tier == "authoritative" else (85 if validity_tier == "verified" else (65 if validity_tier == "secondary" else 45))
        validity_score = conf.get("validity_score") if conf.get("validity_score") is not None else default_score
        validity_notes = conf.get("validity_notes") or ""

        results.append({
            "id": s.id,
            "name": s.name,
            "source_type": s.source_type,
            "description": s.description,
            "config": s.config,
            "is_active": s.is_active,
            "cache_ttl_minutes": s.cache_ttl_minutes,
            "sync_status": s.sync_status,
            "last_synced_at": (s.last_synced_at.isoformat() + "Z") if s.last_synced_at else None,
            "document_count": doc_count,
            "validity_tier": validity_tier,
            "validity_score": validity_score,
            "validity_notes": validity_notes,
            "created_at": (s.created_at.isoformat() + "Z") if s.created_at else None
        })
    return results

@router.post("/test-connection")
async def test_source_connection(
    payload: TestConnectionRequest,
    db: Session = Depends(get_db),
    user = Depends(get_current_user)
):
    stype = payload.source_type.lower()
    config = payload.config

    try:
        if stype == "database":
            db_type = config.get("db_type", "mysql")
            has_query = bool(config.get("query") and str(config.get("query")).strip())
            is_tool_mode = bool(config.get("is_tool") or (config.get("query") and config.get("parameters")))

            if is_tool_mode or has_query:
                test_args = config.get("test_arguments", {})
                test_config = config.copy()
                if not is_tool_mode:
                    # In Standard Mode preview, limit to small batch (5 records) for instant response
                    raw_limit = test_config.get("limit")
                    try:
                        parsed_limit = int(raw_limit) if raw_limit is not None else 5
                        test_config["limit"] = min(parsed_limit, 5) if parsed_limit > 0 else 5
                    except Exception:
                        test_config["limit"] = 5

                res = await database_ingester.execute_tool_call(test_config, test_args)
                if isinstance(res, dict) and res.get("data"):
                    try:
                        from services.media_cache_service import media_cache_service
                        converted_data, _ = media_cache_service.convert_data_images(
                            res["data"],
                            source_name=config.get("name") or "test_connection",
                            prefer_full_url=True,
                            db=db
                        )
                        res["data"] = converted_data
                    except Exception as conv_err:
                        logging.getLogger(__name__).warning(f"Error converting test connection images: {conv_err}")

                if res.get("success"):
                    row_cnt = res.get("row_count", 0)
                    col_cnt = len(res.get("columns", []))
                    msg = f"Koneksi berhasil dan query berhasil dieksekusi ({row_cnt} baris sampel, {col_cnt} kolom terdeteksi)"
                else:
                    msg = f"Koneksi atau query database gagal: {res.get('error')}"
                return {
                    "success": res.get("success", False),
                    "message": msg,
                    "result": res
                }
            else:
                success = database_ingester.test_connection(db_type, config)
                return {"success": success, "message": f"Successfully connected to {db_type.upper()} database"}

        elif stype == "api":
            test_type = config.get("test_type")
            if test_type == "token":
                auth_conf = config.get("auth", {})
                res = await api_ingester.test_fetch_token(auth_conf)
                return res

            endpoint = config.get("endpoint")
            has_endpoint = bool(endpoint and str(endpoint).strip())
            if config.get("is_tool") or has_endpoint:
                test_args = config.get("test_arguments", {})
                res = await api_ingester.execute_tool_call(config, test_args)
                if isinstance(res, dict) and res.get("data"):
                    try:
                        from services.media_cache_service import media_cache_service
                        converted_data, _ = media_cache_service.convert_data_images(
                            res["data"],
                            source_name=config.get("name") or "test_connection",
                            prefer_full_url=True,
                            db=db
                        )
                        res["data"] = converted_data
                    except Exception as conv_err:
                        logging.getLogger(__name__).warning(f"Error converting test connection images: {conv_err}")

                if res.get("success"):
                    msg = "Endpoint API berhasil diakses dan dieksekusi (sampel data diperoleh)"
                else:
                    msg = f"Panggilan API gagal: {res.get('error')}"
                return {
                    "success": res.get("success", False),
                    "message": msg,
                    "result": res
                }
            else:
                auth_conf = config.get("auth", {})
                token = await api_ingester.get_bearer_token(auth_conf)
                return {"success": True, "message": "API auth verified successfully", "token_acquired": bool(token)}

        elif stype in ["website", "websearch"]:
            return {"success": True, "message": "Web endpoint verified"}

        elif stype == "google_drive":
            return {"success": True, "message": "Google Drive account configuration verified"}

        elif stype in ["mcp", "mcp_server"]:
            res = await mcp_ingester.test_connection(config)
            return res

        else:
            raise HTTPException(status_code=400, detail=f"Unknown source type: {stype}")
    except Exception as e:
        return {"success": False, "message": str(e)}

@router.post("/inspect-database-columns")
async def inspect_database_columns(payload: TestConnectionRequest, user = Depends(get_current_user)):
    """
    Performs a fast schema probe on a database connection to discover available columns
    and sample record. Used for auto-generating parameters, field definitions, and WHERE queries.
    """
    config = payload.config or {}
    db_type = config.get("db_type", "mysql").lower()

    try:
        probe_config = config.copy()
        probe_config["limit"] = 1
        query_str = str(probe_config.get("query") or "").strip()
        table_name = None

        if db_type == "mongodb":
            collection = probe_config.get("collection")
            if not collection:
                raise ValueError("Collection MongoDB harus diisi untuk menginspeksi field.")
            table_name = collection
            probe_config["query"] = "{}"
        else:
            import re
            m = re.search(r'\bFROM\s+([`"\'\[]?[\w.]+[`"\'\]]?)', query_str, re.IGNORECASE)
            if m:
                table_name = m.group(1).strip('`"\'[]')
                if ":" in query_str or "{" in query_str:
                    probe_config["query"] = f"SELECT * FROM {m.group(1)}"
            elif not query_str:
                adapter = database_ingester.get_adapter(db_type)
                if hasattr(adapter, "inspect_tables"):
                    tables = adapter.inspect_tables(probe_config)
                    if tables:
                        table_name = tables[0]
                        probe_config["query"] = f"SELECT * FROM {table_name}"
                if not probe_config.get("query"):
                    raise ValueError("Query atau nama tabel harus diisi untuk menginspeksi kolom.")

        res = await database_ingester.execute_tool_call(probe_config, {})
        if not res.get("success"):
            return {
                "success": False,
                "message": res.get("error") or "Gagal menginspeksi kolom database",
                "columns": [],
                "sample": None,
                "table_name": table_name
            }

        columns = res.get("columns", [])
        data = res.get("data", [])
        sample = data[0] if data and isinstance(data[0], dict) else {}

        if not columns and sample:
            columns = list(sample.keys())

        return {
            "success": True,
            "message": f"Berhasil mendeteksi {len(columns)} kolom dari database.",
            "columns": columns,
            "sample": sample,
            "table_name": table_name,
            "db_type": db_type,
            "row_count": len(data)
        }
    except Exception as e:
        return {
            "success": False,
            "message": str(e),
            "columns": [],
            "sample": None
        }

@router.get("/api-tools")
@router.get("/tools")
def list_api_tools(db: Session = Depends(get_db)):
    """
    Returns active knowledge sources (API, Database, and MCP) configured as AI tools.
    """
    sources = db.query(KnowledgeSource).filter(
        KnowledgeSource.source_type.in_(["api", "database", "mcp", "mcp_server"]),
        KnowledgeSource.is_active == True
    ).all()

    tools = []
    for s in sources:
        conf = s.config or {}
        if s.source_type in ["mcp", "mcp_server"]:
            mcp_tools = conf.get("tools") or []
            prefix = f"mcp_{s.name.replace(' ', '_').lower()}_"
            for t in mcp_tools:
                if t.get("enabled", True):
                    raw_name = t.get("name", "tool")
                    clean_name = "".join(c if c.isalnum() or c == "_" else "_" for c in f"{prefix}{raw_name}").lower()
                    tools.append({
                        "source_id": s.id,
                        "source_type": "mcp",
                        "name": clean_name,
                        "raw_tool_name": raw_name,
                        "title": f"{s.name}: {t.get('title') or raw_name}",
                        "description": t.get("description") or f"MCP tool '{raw_name}' from {s.name}",
                        "parameters": t.get("parameters", []),
                        "input_schema": t.get("input_schema", {}),
                        "config": conf
                    })
        elif conf.get("is_tool") or conf.get("parameters"):
            prefix = "db_" if s.source_type == "database" else "api_"
            tool_name = conf.get("tool_name") or f"{prefix}{s.name.replace(' ', '_').lower()}"
            clean_tool_name = "".join(c if c.isalnum() or c == "_" else "_" for c in tool_name).lower()
            
            tool_entry = {
                "source_id": s.id,
                "source_type": s.source_type,
                "name": clean_tool_name,
                "title": s.name,
                "description": conf.get("tool_description") or s.description or f"{'Database' if s.source_type == 'database' else 'API'} Tool for {s.name}",
                "parameters": conf.get("parameters", []),
                "field_definitions": conf.get("field_definitions", []),
                "config": conf
            }
            if s.source_type == "api":
                tool_entry["endpoint"] = conf.get("endpoint")
                tool_entry["method"] = conf.get("method", "GET")
            else:
                tool_entry["db_type"] = conf.get("db_type") or conf.get("database_type")
                tool_entry["query"] = conf.get("query")
                tool_entry["database"] = conf.get("database")

            tools.append(tool_entry)
    return {"tools": tools}

@router.post("/mcp-tools/discover")
async def discover_mcp_tools(payload: TestConnectionRequest, user = Depends(get_current_user)):
    try:
        tools = await mcp_ingester.fetch_tools(payload.config)
        return {"success": True, "tools": tools, "count": len(tools)}
    except Exception as e:
        return {"success": False, "error": str(e), "tools": []}

@router.post("/mcp-tools/refresh-all")
async def refresh_all_mcp_tools(db: Session = Depends(get_db)):
    """
    Iterates through every connected MCP server in the database and calls tools/list.
    Updates the 'tools' configuration array for each server.
    """
    sources = db.query(KnowledgeSource).filter(
        KnowledgeSource.source_type.in_(["mcp", "mcp_server"]),
        KnowledgeSource.is_active == True
    ).all()
    
    results = []
    total_tools = 0
    for s in sources:
        try:
            config = s.config or {}
            tools = await mcp_ingester.fetch_tools(config)
            config["tools"] = tools
            # Also reset sync state flag
            config["sync_resources"] = False
            s.config = config
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(s, "config")
            results.append({"id": s.id, "name": s.name, "status": "success", "tools_count": len(tools)})
            total_tools += len(tools)
        except Exception as e:
            results.append({"id": s.id, "name": s.name, "status": "error", "error": str(e)})

    db.commit()
    return {"success": True, "refreshed_servers": len(sources), "total_tools_discovered": total_tools, "details": results}

@router.get("/sources/{source_id}/mcp-tools")
async def get_source_mcp_tools(source_id: int, db: Session = Depends(get_db)):
    source = db.query(KnowledgeSource).filter(KnowledgeSource.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    if source.source_type not in ["mcp", "mcp_server"]:
        raise HTTPException(status_code=400, detail="Source is not an MCP type")
    try:
        tools = await mcp_ingester.fetch_tools(source.config)
        return {"success": True, "tools": tools, "count": len(tools)}
    except Exception as e:
        return {"success": False, "error": str(e), "tools": []}

class ExecuteToolRequest(BaseModel):
    tool_name: Optional[str] = None
    arguments: Dict[str, Any] = {}

@router.post("/api-tools/{source_id}/execute")
@router.post("/tools/{source_id}/execute")
async def execute_api_tool(
    source_id: int,
    payload: ExecuteToolRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    source = db.query(KnowledgeSource).filter(KnowledgeSource.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    if source.source_type not in ["api", "database", "mcp", "mcp_server"]:
        raise HTTPException(status_code=400, detail="Source is not an API, Database, or MCP type")

    try:
        if source.source_type in ["mcp", "mcp_server"]:
            tname = payload.tool_name or payload.arguments.pop("_tool_name", None)
            if not tname:
                tlist = (source.config or {}).get("tools", [])
                if len(tlist) == 1:
                    tname = tlist[0].get("name")
                elif "tool_name" in (source.config or {}):
                    tname = source.config["tool_name"]
            result = await mcp_ingester.execute_tool_call(source.config, tname or "", payload.arguments)
        elif source.source_type == "api":
            result = await api_ingester.execute_tool_call(source.config, payload.arguments)
        else:
            result = await database_ingester.execute_tool_call(source.config, payload.arguments)

        # Automatically cache query-by-parameter result into ChromaDB Bank Data
        try:
            records = result.get("data")
            if records:
                from services.ingestion.bank_data_saver import save_tool_records_to_bank_data
                save_tool_records_to_bank_data(source, payload.arguments, records, db)
        except Exception as cache_err:
            logging.getLogger(__name__).warning(f"Notice saving tool bank data: {cache_err}")

        # Convert any base64 images into direct cached media URLs so clients receive clean image links instead of raw base64
        if isinstance(result, dict) and result.get("data"):
            try:
                from services.media_cache_service import media_cache_service
                converted_data, _ = media_cache_service.convert_data_images(
                    result["data"],
                    source_name=source.name,
                    prefer_full_url=True,
                    db=db
                )
                result["data"] = converted_data
            except Exception as conv_err:
                logging.getLogger(__name__).warning(f"Error converting tool images: {conv_err}")

                # Convert any Base64 images into lightweight cached media files so callers don't receive raw base64
        try:
            from services.media_cache_service import media_cache_service
            base_url = media_cache_service.get_default_base_url(request)
            raw_data = result.get("data")
            if raw_data:
                sanitized_data, converted_media = media_cache_service.convert_data_images(
                    raw_data,
                    base_url=base_url,
                    source_name=source.name,
                    db=db
                )
                result["data"] = sanitized_data
                if converted_media:
                    result["media_files"] = [m.get("url") for m in converted_media]
        except Exception as media_err:
            logging.getLogger(__name__).warning(f"Notice converting tool images: {media_err}")

        # Attach data priority metadata and field definitions for caller (MCP client or LLM)
        if isinstance(result, dict) and result.get("success"):
            result["data_priority"] = "PRIORITAS_UTAMA_MUTLAK (Data diambil langsung secara real-time dari database/source data resmi)"
            result["fetch_mode"] = "LIVE_DIRECT_DATABASE_QUERY" if source.source_type == "database" else ("LIVE_REMOTE_MCP_CALL" if source.source_type in ["mcp", "mcp_server"] else "LIVE_DIRECT_API_QUERY")
            field_defs = (source.config or {}).get("field_definitions")
            if field_defs:
                result["field_definitions"] = field_defs

        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/sources", status_code=status.HTTP_201_CREATED)
def create_knowledge_source(
    payload: SourceCreate,
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin", "editor"]))
):
    is_tool_mode = bool(
        (payload.config or {}).get("is_tool") or 
        (payload.source_type.lower() in ["database", "api"] and (payload.config or {}).get("parameters") and len((payload.config or {}).get("parameters", [])) > 0) or
        (payload.source_type.lower() in ["mcp", "mcp_server"] and not (payload.config or {}).get("sync_resources"))
    )

    source = KnowledgeSource(
        name=payload.name,
        source_type=payload.source_type.lower(),
        description=payload.description,
        config=payload.config,
        schedule_cron=payload.schedule_cron,
        is_active=payload.is_active if payload.is_active is not None else True,
        cache_ttl_minutes=payload.cache_ttl_minutes,
        sync_status="active (tool)" if is_tool_mode else "idle",
        created_by=user.id
    )
    db.add(source)
    db.commit()
    db.refresh(source)

    if not is_tool_mode:
        run_ingest_source_task.delay(source.id)

    return {"id": source.id, "name": source.name, "message": "Source created successfully"}

@router.post("/sources/upload-file")
async def upload_file_source(
    file: UploadFile = File(...),
    name: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    validity_tier: Optional[str] = Form("secondary"),
    validity_score: Optional[int] = Form(65),
    validity_notes: Optional[str] = Form(""),
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin", "editor"]))
):
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    clean_filename = file.filename.replace(" ", "_")
    save_path = os.path.join(settings.UPLOAD_DIR, clean_filename)

    with open(save_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    file_ext = clean_filename.split(".")[-1].lower() if "." in clean_filename else "txt"
    file_size = os.path.getsize(save_path)

    source_name = name or clean_filename
    source = KnowledgeSource(
        name=source_name,
        source_type="file",
        description=description or f"Uploaded file {clean_filename}",
        config={
            "file_path": save_path,
            "filename": clean_filename,
            "file_type": file_ext,
            "file_size": file_size,
            "validity_tier": validity_tier or "secondary",
            "validity_score": validity_score if validity_score is not None else 65,
            "validity_notes": validity_notes or ""
        },
        is_active=True,
        created_by=user.id
    )
    db.add(source)
    db.commit()
    db.refresh(source)

    # Add document entry
    doc = KnowledgeDocument(
        source_id=source.id,
        title=clean_filename,
        file_path=save_path,
        file_type=file_ext,
        file_size=file_size,
        status="pending"
    )
    db.add(doc)
    db.commit()

    # Trigger asynchronous processing
    run_ingest_source_task.delay(source.id)

    return {
        "source_id": source.id,
        "name": source.name,
        "filename": clean_filename,
        "message": "File uploaded and ingestion queued"
    }

@router.post("/sources/{source_id}/sync")
def trigger_sync(
    source_id: int,
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin", "editor"]))
):
    source = db.query(KnowledgeSource).filter(KnowledgeSource.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    if not source.is_active:
        raise HTTPException(
            status_code=400,
            detail=f"Knowledge Source '{source.name}' sedang dinonaktifkan. Silakan aktifkan terlebih dahulu untuk melakukan sinkronisasi."
        )

    conf = source.config or {}
    if conf.get("is_tool") or (source.source_type in ["database", "api"] and conf.get("parameters")):
        source.sync_status = "active (tool)"
        db.commit()
        return {
            "message": f"Sumber '{source.name}' beroperasi sebagai AI Tool On-Demand (Real-time Live Query). Tidak memerlukan sinkronisasi vektor karena di-query langsung ke database saat AI membutuhkan data.",
            "is_tool": True,
            "sync_status": "active (tool)"
        }

    run_ingest_source_task.delay(source.id)
    return {"message": f"Sync queued for source '{source.name}'"}

@router.patch("/sources/{source_id}/toggle-active")
def toggle_source_active(
    source_id: int,
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin", "editor"]))
):
    source = db.query(KnowledgeSource).filter(KnowledgeSource.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    source.is_active = not bool(source.is_active)
    db.commit()
    db.refresh(source)

    status_str = "diaktifkan" if source.is_active else "dinonaktifkan"
    return {
        "success": True,
        "id": source.id,
        "name": source.name,
        "is_active": source.is_active,
        "message": f"Knowledge Source '{source.name}' berhasil {status_str}"
    }

@router.put("/sources/{source_id}")
def update_source(
    source_id: int,
    payload: SourceCreate,
    re_sync: bool = Query(False),
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin", "editor"]))
):
    source = db.query(KnowledgeSource).filter(KnowledgeSource.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    source.name = payload.name
    source.description = payload.description
    source.config = payload.config
    source.schedule_cron = payload.schedule_cron
    source.cache_ttl_minutes = payload.cache_ttl_minutes
    if payload.source_type:
        source.source_type = payload.source_type.lower()
    if payload.is_active is not None:
        source.is_active = payload.is_active
    db.commit()

    is_tool_mode = bool(
        (payload.config or {}).get("is_tool") or 
        (source.source_type in ["database", "api"] and (payload.config or {}).get("parameters") and len((payload.config or {}).get("parameters", [])) > 0) or
        (source.source_type in ["mcp", "mcp_server"] and not (payload.config or {}).get("sync_resources"))
    )

    if is_tool_mode:
        source.sync_status = "active (tool)"
    db.commit()

    if re_sync and not is_tool_mode and source.is_active:
        run_ingest_source_task.delay(source.id)

    return {"message": "Source updated successfully", "sync_scheduled": re_sync and not is_tool_mode and source.is_active}

@router.delete("/sources/{source_id}")
def delete_source(
    source_id: int,
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin", "editor"]))
):
    source = db.query(KnowledgeSource).filter(KnowledgeSource.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    # Delete vectors from ChromaDB
    try:
        vector_store.delete_by_source(source.id)
    except Exception:
        pass

    db.delete(source)
    db.commit()
    return {"message": "Knowledge source and associated vectors deleted"}

@router.post("/sources/{source_id}/duplicate", status_code=status.HTTP_201_CREATED)
def duplicate_knowledge_source(
    source_id: int,
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin", "editor"]))
):
    """
    Duplicates an existing knowledge source connection and its configuration.
    Assigns a unique name and ensures unique tool identifiers for AI tools.
    """
    original = db.query(KnowledgeSource).filter(KnowledgeSource.id == source_id).first()
    if not original:
        raise HTTPException(status_code=404, detail="Source not found")

    # 1. Determine unique candidate name
    candidate_name = f"{original.name} (Copy)"
    counter = 2
    while db.query(KnowledgeSource).filter(KnowledgeSource.name == candidate_name).first():
        candidate_name = f"{original.name} (Copy {counter})"
        counter += 1

    # 2. Deep copy configuration dictionary
    new_config = copy.deepcopy(original.config or {})

    # 3. Ensure unique tool_name if configured as an AI tool
    if new_config.get("tool_name"):
        orig_tool_name = str(new_config["tool_name"]).strip()
        candidate_tool = f"{orig_tool_name}_copy"
        
        # Collect existing tool names from all sources
        all_sources = db.query(KnowledgeSource).all()
        existing_tool_names = set()
        for s in all_sources:
            if s.config and isinstance(s.config, dict):
                tname = s.config.get("tool_name")
                if tname:
                    existing_tool_names.add(str(tname).strip())

        tool_counter = 2
        while candidate_tool in existing_tool_names:
            candidate_tool = f"{orig_tool_name}_copy_{tool_counter}"
            tool_counter += 1

        new_config["tool_name"] = candidate_tool

    # 4. Determine sync status (active for tool, idle for standard sources)
    is_tool_mode = bool(new_config.get("is_tool"))
    sync_status = "active (tool)" if is_tool_mode else "idle"

    # 5. Create new source instance
    new_source = KnowledgeSource(
        name=candidate_name,
        source_type=original.source_type,
        description=original.description or f"Copy of {original.name}",
        config=new_config,
        schedule_cron=original.schedule_cron,
        is_active=True,
        sync_status=sync_status,
        created_by=user.id
    )
    db.add(new_source)
    db.commit()
    db.refresh(new_source)

    # 6. If it's a file source, clone document references
    if original.source_type == "file":
        original_docs = db.query(KnowledgeDocument).filter(KnowledgeDocument.source_id == original.id).all()
        for doc in original_docs:
            new_doc = KnowledgeDocument(
                source_id=new_source.id,
                title=f"{doc.title} (Copy)",
                file_path=doc.file_path,
                file_type=doc.file_type,
                file_size=doc.file_size,
                status="pending"
            )
            db.add(new_doc)
        db.commit()

    return {
        "id": new_source.id,
        "name": new_source.name,
        "source_type": new_source.source_type,
        "description": new_source.description,
        "config": new_source.config,
        "is_active": new_source.is_active,
        "sync_status": new_source.sync_status,
        "last_synced_at": None,
        "document_count": 0,
        "created_at": (new_source.created_at.isoformat() + "Z") if new_source.created_at else None,
        "message": f"Koneksi '{original.name}' berhasil diduplikat sebagai '{new_source.name}'"
    }


# ── Bank Data & Vector Chunks Endpoints ──────────────────────────────

@router.get("/sources/{source_id}/bank-data")
def get_source_bank_data(
    source_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user = Depends(get_current_user)
):
    """
    Mengambil daftar data bank / chunk vektor yang tersimpan dalam ChromaDB untuk sumber pengetahuan tertentu.
    Mendukung paginasi, pencarian teks (case-insensitive), dan ekstraksi metadata parameter.
    """
    source = db.query(KnowledgeSource).filter(KnowledgeSource.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Knowledge source tidak ditemukan")

    try:
        coll = vector_store.get_collection()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal menghubungkan ke ChromaDB: {str(e)}")

    where_clause = {"source_id": int(source_id)}
    items = []
    total_items = 0

    clean_search = (search or "").strip()

    if clean_search:
        # Search using case-insensitive variants
        variants = list(dict.fromkeys([
            clean_search,
            clean_search.upper(),
            clean_search.lower(),
            clean_search.title()
        ]))
        matched_ids = set()
        matched_records = []

        for var in variants:
            try:
                res = coll.get(
                    where=where_clause,
                    where_document={"$contains": var},
                    include=["documents", "metadatas"]
                )
                if res and res.get("ids"):
                    for cid, doc, meta in zip(res["ids"], res.get("documents", []), res.get("metadatas", [])):
                        if cid not in matched_ids:
                            matched_ids.add(cid)
                            matched_records.append((cid, doc, meta or {}))
            except Exception as search_err:
                logging.getLogger(__name__).warning(f"ChromaDB search variant error: {search_err}")

        total_items = len(matched_records)
        offset = (page - 1) * page_size
        paged_records = matched_records[offset:offset + page_size]

        for cid, doc, meta in paged_records:
            items.append({
                "id": cid,
                "document": doc,
                "metadata": meta,
                "is_bank_data": bool(meta.get("is_bank_data")),
                "queried_at": meta.get("queried_at") or meta.get("created_at"),
                "query_params": meta.get("query_params") or meta.get("parameters"),
                "source_type": meta.get("source_type") or source.source_type,
                "source_name": meta.get("source_name") or source.name,
                "char_count": len(doc) if doc else 0
            })
    else:
        # Get total count quickly without loading full document payloads
        try:
            count_res = coll.get(where=where_clause, include=[])
            total_items = len(count_res.get("ids", [])) if count_res else 0
        except Exception:
            total_items = 0

        offset = (page - 1) * page_size
        try:
            paged_res = coll.get(
                where=where_clause,
                limit=page_size,
                offset=offset,
                include=["documents", "metadatas"]
            )
            if paged_res and paged_res.get("ids"):
                for cid, doc, meta in zip(paged_res["ids"], paged_res.get("documents", []), paged_res.get("metadatas", [])):
                    meta = meta or {}
                    items.append({
                        "id": cid,
                        "document": doc,
                        "metadata": meta,
                        "is_bank_data": bool(meta.get("is_bank_data")),
                        "queried_at": meta.get("queried_at") or meta.get("created_at"),
                        "query_params": meta.get("query_params") or meta.get("parameters"),
                        "source_type": meta.get("source_type") or source.source_type,
                        "source_name": meta.get("source_name") or source.name,
                        "char_count": len(doc) if doc else 0
                    })
        except Exception as page_err:
            logging.getLogger(__name__).error(f"Error fetching paged chunks: {page_err}")

    total_pages = math.ceil(total_items / page_size) if total_items > 0 else 1

    return {
        "success": True,
        "source_id": source.id,
        "source_name": source.name,
        "source_type": source.source_type,
        "total_items": total_items,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
        "items": items
    }


@router.delete("/sources/{source_id}/bank-data/{chunk_id}")
def delete_source_bank_data_chunk(
    source_id: int,
    chunk_id: str,
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin", "editor"]))
):
    """
    Menghapus satu rekaman chunk data bank dari ChromaDB.
    """
    source = db.query(KnowledgeSource).filter(KnowledgeSource.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Knowledge source tidak ditemukan")

    try:
        coll = vector_store.get_collection()
        coll.delete(ids=[chunk_id], where={"source_id": int(source_id)})
        return {
            "success": True,
            "message": f"Data bank '{chunk_id}' berhasil dihapus.",
            "chunk_id": chunk_id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal menghapus chunk: {str(e)}")


# ── Export & Import Knowledge Catalog Endpoints ─────────────────────

class ImportCatalogRequest(BaseModel):
    collision_strategy: Optional[str] = "rename"  # "rename", "overwrite", "skip"
    auto_sync: Optional[bool] = False
    sources: List[Dict[str, Any]]

def _mask_sensitive_data(obj: Any):
    if isinstance(obj, dict):
        for k, v in list(obj.items()):
            if any(s in k.lower() for s in ["password", "secret", "token", "api_key", "apikey", "pass"]):
                if isinstance(v, str) and v:
                    obj[k] = "***MASKED***"
            elif isinstance(v, (dict, list)):
                _mask_sensitive_data(v)
    elif isinstance(obj, list):
        for item in obj:
            _mask_sensitive_data(item)

def process_import_sources(
    sources_data: List[Dict[str, Any]],
    collision_strategy: str,
    auto_sync: bool,
    db: Session,
    user
) -> Dict[str, Any]:
    strategy = (collision_strategy or "rename").lower()
    created_sources = []
    updated_sources = []
    skipped_sources = []
    errors = []

    for idx, item in enumerate(sources_data):
        try:
            name = (item.get("name") or "").strip()
            if not name:
                errors.append(f"Item #{idx + 1}: Nama sumber pengetahuan wajib diisi.")
                continue

            source_type = (item.get("source_type") or "database").lower()
            valid_types = ["database", "api", "website", "websearch", "google_drive", "file"]
            if source_type not in valid_types:
                source_type = "database"

            description = item.get("description")
            config = copy.deepcopy(item.get("config") or {})
            schedule_cron = item.get("schedule_cron")
            is_active = item.get("is_active", True)
            is_tool_mode = bool(config.get("is_tool"))

            # Check if source with same name already exists
            existing = db.query(KnowledgeSource).filter(KnowledgeSource.name == name).first()

            if existing:
                if strategy == "skip":
                    skipped_sources.append(name)
                    continue
                elif strategy == "overwrite":
                    existing.source_type = source_type
                    existing.description = description or existing.description
                    existing.config = config
                    existing.schedule_cron = schedule_cron
                    existing.is_active = is_active
                    if is_tool_mode:
                        existing.sync_status = "active (tool)"
                        try:
                            vector_store.delete_by_source(existing.id)
                        except Exception:
                            pass
                    db.commit()

                    if auto_sync and existing.is_active and not is_tool_mode:
                        run_ingest_source_task.delay(existing.id)

                    updated_sources.append(existing.name)
                    continue
                else:
                    # Strategy "rename"
                    cand = f"{name} (Import)"
                    counter = 2
                    while db.query(KnowledgeSource).filter(KnowledgeSource.name == cand).first():
                        cand = f"{name} (Import {counter})"
                        counter += 1
                    name = cand

            # Ensure tool_name uniqueness if AI Tool
            if config.get("tool_name"):
                orig_tool = str(config["tool_name"]).strip()
                cand_tool = orig_tool
                all_tools = db.query(KnowledgeSource).all()
                existing_tool_names = set()
                for s in all_tools:
                    if s.config and isinstance(s.config, dict) and s.config.get("tool_name"):
                        existing_tool_names.add(str(s.config["tool_name"]).strip())

                t_counter = 2
                while cand_tool in existing_tool_names:
                    cand_tool = f"{orig_tool}_import_{t_counter}"
                    t_counter += 1
                config["tool_name"] = cand_tool

            new_source = KnowledgeSource(
                name=name,
                source_type=source_type,
                description=description,
                config=config,
                schedule_cron=schedule_cron,
                is_active=is_active,
                sync_status="active (tool)" if is_tool_mode else "idle",
                created_by=user.id
            )
            db.add(new_source)
            db.commit()
            db.refresh(new_source)

            if auto_sync and new_source.is_active and not is_tool_mode:
                run_ingest_source_task.delay(new_source.id)

            created_sources.append(new_source.name)

        except Exception as e:
            errors.append(f"Item #{idx + 1} ('{item.get('name', 'Unknown')}'): {str(e)}")

    return {
        "success": True,
        "total_processed": len(sources_data),
        "created_count": len(created_sources),
        "updated_count": len(updated_sources),
        "skipped_count": len(skipped_sources),
        "created_sources": created_sources,
        "updated_sources": updated_sources,
        "skipped_sources": skipped_sources,
        "errors": errors,
        "message": f"Import selesai: {len(created_sources)} dibuat, {len(updated_sources)} diperbarui, {len(skipped_sources)} dilewati."
    }

@router.get("/export")
def export_knowledge_catalog(
    source_ids: Optional[str] = Query(None, description="Comma-separated IDs or omit for all"),
    mask_passwords: bool = Query(False, description="Whether to mask sensitive passwords/keys"),
    db: Session = Depends(get_db),
    user = Depends(get_current_user)
):
    query = db.query(KnowledgeSource)
    if source_ids:
        try:
            ids = [int(i.strip()) for i in source_ids.split(",") if i.strip()]
            if ids:
                query = query.filter(KnowledgeSource.id.in_(ids))
        except ValueError:
            pass

    sources = query.order_by(KnowledgeSource.id.asc()).all()
    exported_sources = []

    for s in sources:
        conf = copy.deepcopy(s.config or {})
        if mask_passwords:
            _mask_sensitive_data(conf)

        exported_sources.append({
            "name": s.name,
            "source_type": s.source_type,
            "description": s.description,
            "config": conf,
            "schedule_cron": s.schedule_cron,
            "is_active": s.is_active
        })

    now_str = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"knowledge_catalog_export_{now_str}.json"

    export_payload = {
        "version": "1.0",
        "system": "MCP Knowledge Platform",
        "exported_at": datetime.utcnow().isoformat() + "Z",
        "total_sources": len(exported_sources),
        "sources": exported_sources
    }

    return JSONResponse(
        content=export_payload,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )

@router.post("/import")
def import_knowledge_catalog(
    payload: ImportCatalogRequest,
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin", "editor"]))
):
    if not payload.sources:
        raise HTTPException(status_code=400, detail="Daftar sumber pengetahuan untuk diimpor tidak boleh kosong.")
    return process_import_sources(payload.sources, payload.collision_strategy or "rename", payload.auto_sync or False, db, user)

@router.post("/import-file")
async def import_knowledge_catalog_file(
    file: UploadFile = File(...),
    collision_strategy: str = Form("rename"),
    auto_sync: bool = Form(False),
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin", "editor"]))
):
    try:
        content = await file.read()
        data = json.loads(content.decode("utf-8"))
        if isinstance(data, dict) and "sources" in data and isinstance(data["sources"], list):
            sources_list = data["sources"]
        elif isinstance(data, list):
            sources_list = data
        else:
            raise HTTPException(status_code=400, detail="Format file JSON tidak valid. Harus memiliki properti 'sources' atau array objek sumber.")

        return process_import_sources(sources_list, collision_strategy, auto_sync, db, user)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="File yang diunggah bukan format JSON yang valid.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal memproses file import: {str(e)}")



# ── AI Knowledge Orchestration & Guidelines Endpoints ────────────────

class OrchestrateSearchRequest(BaseModel):
    query: str
    search_strategy: Optional[str] = "hybrid"  # hybrid, semantic_only, graph_only, comprehensive
    source_types: Optional[List[str]] = None
    max_results: Optional[int] = 5
    image_base64: Optional[str] = None


@router.get("/orchestration-guidelines")
@router.get("/guidelines")
def get_orchestration_guidelines(
    query: Optional[str] = Query(None, description="Optional user query or topic to receive tailored routing and tool advice"),
    include_catalog: bool = Query(True, description="Whether to include full active sources catalog"),
    db: Session = Depends(get_db)
):
    """
    Returns official AI operational guidelines, source routing protocols, and active catalog index
    for processing user input and searching information across knowledge sources.
    """
    # 1. Fetch active knowledge sources
    active_sources = db.query(KnowledgeSource).filter(KnowledgeSource.is_active == True).all()

    catalog = {
        "summary": {
            "total_active_sources": len(active_sources),
            "source_types": {}
        },
        "file_documents": [],
        "database_sources": [],
        "api_sources": [],
        "web_sources": [],
        "available_ai_tools": []
    }

    type_counts = {}
    for s in active_sources:
        stype = s.source_type
        type_counts[stype] = type_counts.get(stype, 0) + 1
        conf = s.config or {}
        is_tool = bool(conf.get("is_tool") or conf.get("parameters"))

        # Extract validity hierarchy metadata
        v_tier = conf.get("validity_tier") or ("authoritative" if s.source_type in ["database", "api"] and is_tool else "secondary")
        default_v_score = 95 if v_tier == "authoritative" else (85 if v_tier == "verified" else (65 if v_tier == "secondary" else 45))
        v_score = conf.get("validity_score") if conf.get("validity_score") is not None else default_v_score
        v_notes = conf.get("validity_notes") or ""

        # Check doc counts for document-oriented sources
        doc_count = db.query(KnowledgeDocument).filter(KnowledgeDocument.source_id == s.id).count() if stype in ["file", "website"] else 0

        source_info = {
            "source_id": s.id,
            "name": s.name,
            "source_type": stype,
            "description": s.description or f"{stype.title()} Knowledge Source",
            "is_tool": is_tool,
            "sync_status": s.sync_status,
            "last_synced_at": s.last_synced_at.isoformat() if s.last_synced_at else None,
            "document_count": doc_count,
            "validity_tier": v_tier,
            "validity_score": v_score,
            "validity_notes": v_notes
        }

        if is_tool:
            prefix = "db_" if stype == "database" else "api_"
            raw_tool_name = conf.get("tool_name") or f"{prefix}{s.name.replace(' ', '_').lower()}"
            clean_tool_name = "".join(c if c.isalnum() or c == "_" else "_" for c in raw_tool_name).lower()
            tool_meta = {
                "source_id": s.id,
                "tool_name": clean_tool_name,
                "source_type": stype,
                "title": s.name,
                "description": conf.get("tool_description") or s.description or f"Tool for {s.name}",
                "parameters": conf.get("parameters", []),
                "validity_tier": v_tier,
                "validity_score": v_score,
                "validity_notes": v_notes
            }
            catalog["available_ai_tools"].append(tool_meta)
            source_info["tool_name"] = clean_tool_name

        if stype == "file":
            catalog["file_documents"].append(source_info)
        elif stype == "database":
            source_info["db_type"] = conf.get("db_type") or conf.get("database_type", "sql")
            catalog["database_sources"].append(source_info)
        elif stype == "api":
            source_info["endpoint"] = conf.get("endpoint")
            source_info["method"] = conf.get("method", "GET")
            catalog["api_sources"].append(source_info)
        elif stype in ["website", "websearch"]:
            catalog["web_sources"].append(source_info)

    catalog["summary"]["source_types"] = type_counts

    # 2. Comprehensive AI Guidelines (tailored by active MCP Personality)
    active_personality = personality_service.get_personality(db)
    guidelines = {
        "core_mission": active_personality.get("core_mission") or "You are the Enterprise AI Knowledge Orchestrator. Your mission is to analyze user queries, consult the appropriate enterprise knowledge sources, uphold strict grounding standards, and synthesize accurate, well-attributed answers.",
        "personality": {
            "name": active_personality.get("name"),
            "role": active_personality.get("role"),
            "tone_of_voice": active_personality.get("tone_of_voice"),
            "preset": active_personality.get("preset"),
            "custom_instructions": active_personality.get("custom_instructions", "")
        },
        "validity_hierarchy": {
            "tier_1_authoritative": {
                "tier": "authoritative",
                "name": "Tingkat 1 - Otoritatif Primer / Sangat Valid (Ground Truth)",
                "score_range": "90 - 100",
                "description": "Sumber data resmi negara (Dukcapil, BPN ATR, Korlantas, AHU, Bank resmi). Berstatus kebenaran mutlak."
            },
            "tier_2_verified": {
                "tier": "verified",
                "name": "Tingkat 2 - Terverifikasi / Valid Internal",
                "score_range": "75 - 89",
                "description": "Basis data internal operasional, BAP, laporan audit resmi terkonfirmasi."
            },
            "tier_3_secondary": {
                "tier": "secondary",
                "name": "Tingkat 3 - Sekunder / Dokumen Publik",
                "score_range": "55 - 74",
                "description": "Portal berita resmi, website instansi, kliping media terverifikasi."
            },
            "tier_4_unverified": {
                "tier": "unverified",
                "name": "Tingkat 4 - Pendukung / Mentah / Belum Terverifikasi",
                "score_range": "30 - 54",
                "description": "Catatan observasi, data media sosial, laporan aduan masyarakat belum terkonfirmasi."
            },
            "conflict_resolution_rule": "Jika terdapat perbedaan atau kontradiksi data antar sumber, data dari sumber ber-Tingkat Validitas lebih tinggi (Skor lebih tinggi) WAJIB dimenangkan secara mutlak."
        },
        "input_processing_protocol": [
            {
                "step": 1,
                "phase": "Query Intent Classification",
                "rules": [
                    "Classify query into one of: 'factual_document' (policies, SOPs, contracts, manuals), 'entity_relationship' (people, company affiliations, network paths), 'live_transactional' (real-time database lookups, land/asset ownership, dynamic APIs), or 'hybrid_multi_faceted'.",
                    "Identify key named entities, proper nouns, dates, identification numbers, and domain terms."
                ]
            },
            {
                "step": 2,
                "phase": "Source Routing Decision Tree",
                "rules": [
                    "Rule A (Real-time Tools First): If the user query requires looking up specific assets, certificates (e.g. BPN land search), or live database records, prioritize calling the matching specialized tool (e.g., 'cari_tanah_bpn', 'db_*').",
                    "Rule B (Network & Relations): If the query asks about connections between people, companies, or ownership hierarchies, query the Knowledge Graph via 'get_entity_network_profile' or 'analyze_data_relationship'.",
                    "Rule C (Documentary Evidence): For textual policies, guidelines, regulatory documents, and historical information, query ChromaDB via 'search_knowledge_base' or 'orchestrate_knowledge_search'.",
                    "Rule D (Multi-faceted Search): For comprehensive questions touching multiple domains, use 'orchestrate_knowledge_search' to coordinate vector, graph, and live tools in one operation."
                ]
            },
            {
                "step": 3,
                "phase": "Search Formulation & Normalization",
                "rules": [
                    "Strip conversational fluff, greeting phrases, and punctuation when formulating vector search queries.",
                    "Normalize person/entity names to clean alphanumeric strings without prefixes when passing parameters to tools.",
                    "If searching for an exact ID or code (e.g. certificate number, NIK, SKU), pass it verbatim without modification."
                ]
            },
            {
                "step": 4,
                "phase": "Grounding & Anti-Hallucination Rules",
                "rules": [
                    "STRICT GROUNDING: Base all factual assertions strictly on data returned by knowledge sources or tools.",
                    "MANDATORY CITATIONS: Clearly state the Source Name, Validity Tier, and Document ID / Tool Name for every key fact.",
                    "HANDLING ABSENCE: If a requested record, person, or document does not exist in the retrieved context, explicitly acknowledge: 'Data tidak ditemukan dalam basis pengetahuan yang terhubung.' NEVER invent or hallucinate missing data.",
                    "DATA PRECEDENCE & GROUND TRUTH: Data yang diambil secara langsung dari basis data atau API real-time (melalui pemanggilan Tools berstatus Otoritatif Tingkat 1) adalah PRIORITAS UTAMA MUTLAK yang WAJIB dimenangkan jika bertentangan dengan dokumen sekunder/tersier."
                ]
            },
            {
                "step": 5,
                "phase": "Response Formatting Standards",
                "rules": [
                    "Use clean Markdown formatting with clear headings, bullet points, and bold entity names.",
                    "Format tabular records using Markdown tables with relevant columns.",
                    "Start directly with the answer; omit internal thinking tags or meta-commentary."
                ]
            }
        ]
    }

    # 3. Dynamic Query Routing Recommendations (if query provided)
    query_recommendations = None
    matched_flow_data = None
    if query:
        q_clean = query.strip().lower()
        matched_tools = []
        matched_sources = []
        suggested_strategy = "hybrid"

        # Check tools matching
        for t in catalog["available_ai_tools"]:
            tool_name = t["tool_name"]
            tool_desc = t["description"].lower()
            tool_title = t["title"].lower()
            param_names = [p.get("name", "").lower() for p in t.get("parameters", [])]

            score = 0
            extracted_args = {}
            if any(term in q_clean for term in ["tanah", "bpn", "sertifikat", "hgb", "hak milik", "lokasi"]) and "tanah" in tool_name:
                score += 10
            if tool_name in q_clean or tool_title in q_clean:
                score += 8
            for kw in tool_desc.split():
                if len(kw) > 3 and kw in q_clean:
                    score += 2

            # Extract possible arguments for parameters like 'nama', 'query', 'id'
            if "nama" in param_names:
                name_match = re.search(r'(?:nama|atas nama|milik|an\.?)\s+([A-Za-z\s]+?)(?:$|\s+(?:di|dengan|pada|nomor))', query, re.IGNORECASE)
                if name_match:
                    extracted_args["nama"] = name_match.group(1).strip()

            if score > 0 or extracted_args:
                matched_tools.append({
                    "tool_name": tool_name,
                    "title": t["title"],
                    "relevance_score": score,
                    "suggested_arguments": extracted_args,
                    "validity_tier": t.get("validity_tier", "authoritative"),
                    "validity_score": t.get("validity_score", 95),
                    "reason": f"Tool '{tool_name}' matches query terms and intent."
                })

        # Check sources matching
        for s in active_sources:
            if s.name.lower() in q_clean or (s.description and any(w in q_clean for w in s.description.lower().split() if len(w) > 4)):
                matched_sources.append({"source_id": s.id, "name": s.name, "type": s.source_type})

        # Check matched orchestration flow from Flow Memory
        try:
            from services.flow_orchestrator import flow_orchestrator
            flow_res = flow_orchestrator.match_flow_for_prompt(query, db)
            if flow_res.get("matched"):
                matched_flow_data = flow_res
        except Exception:
            pass

        # Determine suggested strategy
        if matched_tools and not any(w in q_clean for w in ["kebijakan", "sop", "regulasi", "panduan", "aturan"]):
            suggested_strategy = "tool_execution"
        elif any(w in q_clean for w in ["hubungan", "relasi", "koneksi", "jaringan", "siapa saja", "anak perusahaan"]):
            suggested_strategy = "graph_first"
        else:
            suggested_strategy = "hybrid"

        rec_action = (
            f"Terapkan Alur Acuan: '{matched_flow_data['flow_name']}'. Ikuti tahapan: {matched_flow_data['procedural_guidance']}"
            if matched_flow_data
            else (
                f"Invoke tool '{matched_tools[0]['tool_name']}' with arguments {matched_tools[0]['suggested_arguments']}"
                if (matched_tools and matched_tools[0].get("suggested_arguments"))
                else "Run 'orchestrate_knowledge_search' to retrieve vector documents and graph context."
            )
        )

        query_recommendations = {
            "query": query,
            "suggested_strategy": suggested_strategy,
            "recommended_tools": matched_tools,
            "matched_sources": matched_sources,
            "matched_orchestration_flow": matched_flow_data,
            "recommended_action": rec_action
        }

    response_data = {
        "status": "success",
        "guidelines": guidelines,
        "query_recommendations": query_recommendations
    }
    if matched_flow_data:
        response_data["matched_orchestration_flow"] = matched_flow_data
    if include_catalog:
        response_data["catalog"] = catalog

    return response_data


@router.post("/orchestrate-search")
async def orchestrate_search(
    payload: OrchestrateSearchRequest,
    db: Session = Depends(get_db)
):
    """
    Orchestrates a unified multi-source search across Vector Store (ChromaDB),
    Knowledge Graph (Neo4j), and dynamic Database/API sources according to AI search guidelines.
    """
    query = payload.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    strategy = (payload.search_strategy or "hybrid").lower()
    max_results = payload.max_results or 5

    results = {
        "query": query,
        "strategy_applied": strategy,
        "orchestration_plan": {
            "vector_search": strategy in ["hybrid", "semantic_only", "comprehensive"],
            "graph_search": strategy in ["hybrid", "graph_only", "comprehensive"],
            "tool_matching": True
        },
        "retrieved_documents": [],
        "graph_entities": [],
        "applicable_tools": [],
        "ai_synthesis_guidelines": []
    }

    # 1. Vector Search in ChromaDB with Validity Hybrid Reranking
    if strategy in ["hybrid", "semantic_only", "comprehensive"]:
        try:
            filter_meta = None
            if payload.source_types and len(payload.source_types) == 1:
                filter_meta = {"source_type": payload.source_types[0]}
            vector_hits = vector_store.query_similarity(query=query, n_results=max_results, filter_meta=filter_meta)
            
            # Map source configs for validity tier resolution
            sources_all = {s.id: s for s in db.query(KnowledgeSource).all()}
            
            raw_docs = []
            for h in vector_hits:
                meta = h.get("metadata", {})
                source_id = meta.get("source_id")
                s_obj = sources_all.get(source_id) if source_id else None
                s_conf = (s_obj.config if s_obj else {}) or {}
                
                v_tier = s_conf.get("validity_tier") or meta.get("validity_tier") or "secondary"
                default_score = 95 if v_tier == "authoritative" else (85 if v_tier == "verified" else (65 if v_tier == "secondary" else 45))
                v_score = s_conf.get("validity_score") if s_conf.get("validity_score") is not None else (meta.get("validity_score") or default_score)
                raw_sim = round(float(h.get("score", 0.0)), 4)
                
                # Hybrid score: 70% semantic similarity + 30% source validity
                hybrid_score = round(raw_sim * 0.7 + (float(v_score) / 100.0) * 0.3, 4)
                
                raw_docs.append({
                    "id": h.get("id"),
                    "source_name": meta.get("source_name", s_obj.name if s_obj else "Knowledge Base"),
                    "source_type": meta.get("source_type", s_obj.source_type if s_obj else "document"),
                    "score": raw_sim,
                    "validity_tier": v_tier,
                    "validity_score": v_score,
                    "hybrid_score": hybrid_score,
                    "content": vector_store.extract_snippet(h.get("content", ""), query, max_chars=1800)
                })
            
            # Rerank by hybrid score
            raw_docs.sort(key=lambda d: d.get("hybrid_score", 0.0), reverse=True)
            results["retrieved_documents"] = raw_docs
        except Exception as e:
            results["retrieved_documents_error"] = str(e)

    # 2. Graph Search in Neo4j
    if strategy in ["hybrid", "graph_only", "comprehensive"]:
        try:
            from services.graph.neo4j_client import neo4j_client
            words = [w.strip().lower() for w in re.findall(r'\w+', query) if len(w) >= 3]
            if words:
                cypher = """
                MATCH (e:Entity)
                WHERE any(w in $words WHERE toLower(e.name) CONTAINS w OR toLower(coalesce(e.description, '')) CONTAINS w)
                OPTIONAL MATCH (e)-[r]-(target:Entity)
                RETURN e.name AS name,
                       e.type AS type,
                       e.description AS description,
                       type(r) AS relation,
                       target.name AS target_name,
                       target.type AS target_type
                LIMIT 15
                """
                records = neo4j_client.execute_read(cypher, {"words": words})
                entities_map = {}
                for row in records:
                    name = row.get("name")
                    if not name:
                        continue
                    if name not in entities_map:
                        entities_map[name] = {
                            "name": name,
                            "type": row.get("type", "ENTITY"),
                            "description": row.get("description", ""),
                            "connections": []
                        }
                    rel = row.get("relation")
                    tgt = row.get("target_name")
                    if rel and tgt:
                        conn = f"{rel} -> {tgt} ({row.get('target_type', 'ENTITY')})"
                        if conn not in entities_map[name]["connections"]:
                            entities_map[name]["connections"].append(conn)
                results["graph_entities"] = list(entities_map.values())
        except Exception as e:
            results["graph_entities_error"] = str(e)

    # 3. Dynamic Tool Matching with Validity Metadata
    try:
        active_tools = db.query(KnowledgeSource).filter(
            KnowledgeSource.source_type.in_(["api", "database"]),
            KnowledgeSource.is_active == True
        ).all()

        q_lower = query.lower()
        for s in active_tools:
            cfg = s.config or {}
            if cfg.get("is_tool") or cfg.get("parameters"):
                prefix = "db_" if s.source_type == "database" else "api_"
                tool_name = cfg.get("tool_name") or f"{prefix}{s.name.replace(' ', '_').lower()}"
                clean_name = "".join(c if c.isalnum() or c == "_" else "_" for c in tool_name).lower()
                desc = (cfg.get("tool_description") or s.description or "").lower()

                match_score = 0
                if "tanah" in clean_name and any(w in q_lower for w in ["tanah", "bpn", "sertifikat", "hgb"]):
                    match_score += 10
                if clean_name in q_lower or s.name.lower() in q_lower:
                    match_score += 8
                for w in desc.split():
                    if len(w) > 3 and w in q_lower:
                        match_score += 2

                extracted_args = {}
                param_names = [p.get("name", "").lower() for p in cfg.get("parameters", [])]
                if "nama" in param_names:
                    name_match = re.search(r'(?:nama|atas nama|milik|an\.?)\s+([A-Za-z\s]+?)(?:$|\s+(?:di|dengan|pada|nomor))', query, re.IGNORECASE)
                    if name_match:
                        extracted_args["nama"] = name_match.group(1).strip()

                v_tier = cfg.get("validity_tier") or "authoritative"
                default_v = 95 if v_tier == "authoritative" else 85
                v_score = cfg.get("validity_score") if cfg.get("validity_score") is not None else default_v

                if match_score > 0 or extracted_args:
                    results["applicable_tools"].append({
                        "tool_name": clean_name,
                        "source_id": s.id,
                        "source_type": s.source_type,
                        "title": s.name,
                        "parameters": cfg.get("parameters", []),
                        "suggested_arguments": extracted_args,
                        "confidence": "high" if (match_score >= 8 or extracted_args) else "medium",
                        "validity_tier": v_tier,
                        "validity_score": v_score,
                        "priority_rank": "PRIORITAS_UTAMA_MUTLAK (Data langsung dari basis data resmi)"
                    })
    except Exception as e:
        results["applicable_tools_error"] = str(e)

    # 4. Check Matched Orchestration Flow (Prompt Memory)
    matched_flow = None
    try:
        from services.flow_orchestrator import flow_orchestrator
        matched_flow_res = flow_orchestrator.match_flow_for_prompt(query, db)
        if matched_flow_res.get("matched"):
            matched_flow = matched_flow_res
            results["matched_orchestration_flow"] = matched_flow_res
    except Exception:
        pass

    # 5. Formulate Tailored AI Synthesis Guidelines
    guidance = []
    if matched_flow:
        guidance.append(f"⚡ Alur Investigasi Terpadu Terdeteksi: '{matched_flow.get('flow_name')}'. Ikuti tahapan baku: {matched_flow.get('procedural_guidance')}")

    if results["applicable_tools"]:
        top_tool = results["applicable_tools"][0]
        guidance.append(f"Alat Real-time Spesifik '{top_tool['tool_name']}' tersedia (Tingkat: {top_tool.get('validity_tier')}, Skor: {top_tool.get('validity_score')}). Panggil alat ini untuk mendapatkan data fakta primer mutlak.")
    if results["retrieved_documents"]:
        doc_count = len(results["retrieved_documents"])
        top_doc = results["retrieved_documents"][0]
        guidance.append(f"Ditemukan {doc_count} dokumen terindeks. Dokumen teratas: '{top_doc['source_name']}' (Tingkat: {top_doc.get('validity_tier')}, Skor Efektif: {top_doc.get('hybrid_score')}).")
    if results["graph_entities"]:
        ent_count = len(results["graph_entities"])
        guidance.append(f"Ditemukan {ent_count} entitas profil Knowledge Graph. Tampilkan relasi kepemilikan dan afiliasi antar entitas.")
    if not results["retrieved_documents"] and not results["graph_entities"] and not results["applicable_tools"]:
        guidance.append("Tidak ditemukan data pada repositori pengetahuan maupun graf. Sampaikan secara transparan bahwa data tidak ditemukan.")

    guidance.append("Prinsip Hierarki Validitas: Data Otoritatif Tingkat 1 (skor 90-100) WAJIB dimenangkan secara mutlak jika ada pertentangan dengan sumber sekunder/tersier.")
    guidance.append("Format balikan menggunakan Markdown yang rapi (judul, poin-poin, dan tabel untuk data terstruktur). Dilarang mengarang informasi.")

    # 6. Biometric Face Recognition (if image provided)
    if payload.image_base64:
        try:
            from services.face_service import face_service
            face_res = face_service.recognize_face(payload.image_base64, min_confidence=0.6)
            results["biometric_face_result"] = face_res
            if face_res.get("matched"):
                person = face_res.get("person_name") or face_res.get("identified_person")
                conf = face_res.get("confidence_percent")
                guidance.insert(0, f"Biometric Face Match Positive: {person} (Confidence: {conf}%). Incorporate verified identity into the response.")
            elif face_res.get("detection", {}).get("face_detected"):
                guidance.insert(0, "Biometric Face Detected: Person is unidentified / not enrolled in database.")
        except Exception as fe:
            results["biometric_face_error"] = str(fe)

    results["ai_synthesis_guidelines"] = guidance

    return results

