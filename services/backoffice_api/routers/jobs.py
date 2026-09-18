from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models.ingest_job import IngestJob
from models.knowledge_source import KnowledgeSource
from security import get_current_user

router = APIRouter(prefix="/jobs", tags=["Ingest Jobs"])

@router.get("")
def list_jobs(limit: int = 50, db: Session = Depends(get_db), user = Depends(get_current_user)):
    jobs = db.query(IngestJob).order_by(IngestJob.created_at.desc()).limit(limit).all()
    results = []
    for j in jobs:
        source_name = j.source.name if j.source else "Deleted Source"
        results.append({
            "id": j.id,
            "source_id": j.source_id,
            "source_name": source_name,
            "status": j.status,
            "task_id": j.task_id,
            "total_records": j.total_records,
            "processed_records": j.processed_records,
            "chunks_created": j.chunks_created,
            "entities_extracted": j.entities_extracted,
            "relations_created": j.relations_created,
            "error_message": j.error_message,
            "started_at": (j.started_at.isoformat() + "Z") if j.started_at else None,
            "completed_at": (j.completed_at.isoformat() + "Z") if j.completed_at else None,
            "created_at": (j.created_at.isoformat() + "Z") if j.created_at else None
        })
    return results

@router.get("/{job_id}")
def get_job(job_id: int, db: Session = Depends(get_db), user = Depends(get_current_user)):
    job = db.query(IngestJob).filter(IngestJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return {
        "id": job.id,
        "source_id": job.source_id,
        "source_name": job.source.name if job.source else "Deleted Source",
        "status": job.status,
        "task_id": job.task_id,
        "total_records": job.total_records,
        "processed_records": job.processed_records,
        "chunks_created": job.chunks_created,
        "entities_extracted": job.entities_extracted,
        "relations_created": job.relations_created,
        "error_message": job.error_message,
        "started_at": (job.started_at.isoformat() + "Z") if job.started_at else None,
        "completed_at": (job.completed_at.isoformat() + "Z") if job.completed_at else None,
        "created_at": (job.created_at.isoformat() + "Z") if job.created_at else None
    }

@router.get("/{job_id}/details")
def get_job_details(job_id: int, db: Session = Depends(get_db), user = Depends(get_current_user)):
    """
    Mengambil detail komprehensif dari Ingest Job:
    1. Entities: Entitas Knowledge Graph hasil ekstraksi LLM yang tersimpan di Neo4j
    2. Relations: Hubungan/relasi antar entitas yang tersimpan di Neo4j
    3. Chunks: Potongan data teks / vektor yang tersimpan di ChromaDB
    """
    job = db.query(IngestJob).filter(IngestJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    source_id = job.source_id
    source_name = job.source.name if job.source else "Deleted Source"
    source_type = job.source.source_type if job.source else "unknown"

    # 1. Fetch Entities from Neo4j
    entities = []
    try:
        from services.graph.neo4j_client import neo4j_client
        ent_cypher = """
        MATCH (e:Entity)
        WHERE e.source_id = $source_id
        OPTIONAL MATCH (e)-[r]-(neighbor:Entity)
        RETURN e.name AS name, e.type AS type, e.description AS description, count(r) AS degree
        ORDER BY degree DESC, e.name ASC
        LIMIT 250
        """
        records = neo4j_client.execute_read(ent_cypher, {"source_id": int(source_id)})
        for r in records:
            entities.append({
                "name": r.get("name"),
                "type": r.get("type") or "CONCEPT",
                "description": r.get("description") or "",
                "degree": r.get("degree", 0)
            })
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Error reading entities from Neo4j for job {job_id}: {e}")

    # 2. Fetch Relationships from Neo4j
    relations = []
    try:
        from services.graph.neo4j_client import neo4j_client
        rel_cypher = """
        MATCH (a:Entity)-[r]->(b:Entity)
        WHERE r.source_id = $source_id OR a.source_id = $source_id OR b.source_id = $source_id
        RETURN a.name AS source, a.type AS source_type, type(r) AS relation, b.name AS target, b.type AS target_type, r.weight AS weight
        ORDER BY a.name ASC
        LIMIT 250
        """
        rel_records = neo4j_client.execute_read(rel_cypher, {"source_id": int(source_id)})
        for r in rel_records:
            relations.append({
                "source": r.get("source"),
                "source_type": r.get("source_type") or "CONCEPT",
                "relation": r.get("relation") or "RELATED_TO",
                "target": r.get("target"),
                "target_type": r.get("target_type") or "CONCEPT",
                "weight": r.get("weight", 1.0)
            })
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Error reading relationships from Neo4j for job {job_id}: {e}")

    # 3. Fetch Chunks from ChromaDB
    chunks = []
    total_chunks_in_store = 0
    try:
        from services.vector_store import vector_store
        coll = vector_store.get_collection()
        where_clause = {"source_id": int(source_id)}
        count_res = coll.get(where=where_clause, include=[])
        total_chunks_in_store = len(count_res.get("ids", [])) if count_res else 0

        # Retrieve sample/paginated chunks for this source
        paged_res = coll.get(
            where=where_clause,
            limit=100,
            include=["documents", "metadatas"]
        )
        if paged_res and paged_res.get("ids"):
            for cid, doc, meta in zip(paged_res["ids"], paged_res.get("documents", []), paged_res.get("metadatas", [])):
                meta = meta or {}
                chunks.append({
                    "id": cid,
                    "document": doc,
                    "metadata": meta,
                    "is_bank_data": bool(meta.get("is_bank_data")),
                    "queried_at": meta.get("queried_at") or meta.get("created_at"),
                    "query_params": meta.get("query_params") or meta.get("parameters"),
                    "char_count": len(doc) if doc else 0
                })
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Error reading chunks from ChromaDB for job {job_id}: {e}")

    return {
        "job": {
            "id": job.id,
            "source_id": job.source_id,
            "source_name": source_name,
            "source_type": source_type,
            "status": job.status,
            "task_id": job.task_id,
            "total_records": job.total_records,
            "processed_records": job.processed_records,
            "chunks_created": job.chunks_created or total_chunks_in_store,
            "entities_extracted": job.entities_extracted or len(entities),
            "relations_created": job.relations_created or len(relations),
            "error_message": job.error_message,
            "started_at": (job.started_at.isoformat() + "Z") if job.started_at else None,
            "completed_at": (job.completed_at.isoformat() + "Z") if job.completed_at else None,
            "created_at": (job.created_at.isoformat() + "Z") if job.created_at else None
        },
        "entities": entities,
        "relations": relations,
        "chunks": chunks,
        "stats": {
            "entities_count": len(entities),
            "relations_count": len(relations),
            "chunks_count": len(chunks),
            "total_chunks_in_store": total_chunks_in_store
        }
    }

@router.post("/{job_id}/cancel")
def cancel_job(job_id: int, db: Session = Depends(get_db), user = Depends(get_current_user)):
    from datetime import datetime
    job = db.query(IngestJob).filter(IngestJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    job.status = "failed"
    job.error_message = f"Cancelled by user {user.username}"
    job.completed_at = datetime.utcnow()
    if job.source and job.source.sync_status == "running":
        job.source.sync_status = "failed"
    db.commit()
    return {"message": f"Job {job_id} cancelled successfully"}
