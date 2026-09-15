from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from database import Base

class LLMBackend(Base):
    __tablename__ = "llm_backends"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    backend_type = Column(String(50), nullable=False) # vllm, ollama, openai, custom
    api_base = Column(String(255), nullable=False)
    api_key = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True)
    available_models = Column(JSON, nullable=True) # list of model identifiers fetched or specified
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    assignments = relationship("ModelAssignment", back_populates="backend", cascade="all, delete-orphan")

class ModelAssignment(Base):
    __tablename__ = "model_assignments"

    id = Column(Integer, primary_key=True, index=True)
    task = Column(String(50), unique=True, nullable=False) # entity_extraction, relationship_detection, summarization, general_qa
    backend_id = Column(Integer, ForeignKey("llm_backends.id", ondelete="CASCADE"), nullable=False)
    model_name = Column(String(150), nullable=False)
    parameters = Column(JSON, nullable=True) # temperature, max_tokens, etc.
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    backend = relationship("LLMBackend", back_populates="assignments")
