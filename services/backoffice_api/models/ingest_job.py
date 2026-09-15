from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from database import Base

class IngestJob(Base):
    __tablename__ = "ingest_jobs"

    id = Column(Integer, primary_key=True, index=True)
    source_id = Column(Integer, ForeignKey("knowledge_sources.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(50), default="pending", index=True) # pending, processing, completed, failed
    task_id = Column(String(100), nullable=True, index=True)
    total_records = Column(Integer, default=0)
    processed_records = Column(Integer, default=0)
    chunks_created = Column(Integer, default=0)
    entities_extracted = Column(Integer, default=0)
    relations_created = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    job_metadata = Column(JSON, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    source = relationship("KnowledgeSource", back_populates="jobs")
