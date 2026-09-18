from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, JSON
from database import Base

class OrchestrationFlow(Base):
    __tablename__ = "orchestration_flows"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    description = Column(Text, nullable=True)
    prompt_pattern = Column(String(255), nullable=False) # e.g. "Cari aset dan profil NIK *" or regex
    intent_category = Column(String(50), default="profiling") # profiling, aset, relasi, regulasi, umum
    trigger_keywords = Column(JSON, nullable=False, default=list) # ["nik", "dukcapil", "profil", "ktp"]
    
    # Ordered step-by-step information retrieval sequence:
    # [
    #   {"step_order": 1, "title": "...", "action_type": "tool_call"|"graph_traversal"|"vector_search"|"synthesis_rule", "target": "...", "priority": "MANDATORY"|"REQUIRED"|"OPTIONAL", "description": "...", "parameters_mapping": {...}}
    # ]
    steps = Column(JSON, nullable=False, default=list)
    
    validity_priority_rule = Column(String(100), default="PRIORITIZE_HIGHEST_VALIDITY") # PRIORITIZE_HIGHEST_VALIDITY, STRICT_TIER_1_ONLY
    is_active = Column(Boolean, default=True)
    execution_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "prompt_pattern": self.prompt_pattern,
            "intent_category": self.intent_category,
            "trigger_keywords": self.trigger_keywords or [],
            "steps": self.steps or [],
            "validity_priority_rule": self.validity_priority_rule,
            "is_active": self.is_active,
            "execution_count": self.execution_count,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }
