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
