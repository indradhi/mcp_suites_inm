from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime
from database import Base

try:
    from sqlalchemy.dialects.mysql import LONGTEXT
    TextType = LONGTEXT
except Exception:
    TextType = Text


class ChatMediaCache(Base):
    """
    Persistent registry of media and images extracted from chat data, tools, and biometrics.
    Allows on-demand regeneration of temporary files if they are cleaned up or evicted from disk.
    """
    __tablename__ = "chat_media_cache"

    id = Column(String(64), primary_key=True, index=True)
    filename = Column(String(128), nullable=False, unique=True, index=True)
    mime_type = Column(String(64), default="image/jpeg", nullable=False)
    ref_nik = Column(String(64), nullable=True, index=True)
    ref_name = Column(String(255), nullable=True)
    source_name = Column(String(128), nullable=True)
    image_base64 = Column(TextType, nullable=True)
    file_size_bytes = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_accessed_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "filename": self.filename,
            "mime_type": self.mime_type,
            "ref_nik": self.ref_nik,
            "ref_name": self.ref_name,
            "source_name": self.source_name,
            "file_size_bytes": self.file_size_bytes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_accessed_at": self.last_accessed_at.isoformat() if self.last_accessed_at else None,
        }
