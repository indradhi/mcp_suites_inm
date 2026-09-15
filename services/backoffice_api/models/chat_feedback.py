from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, JSON
from database import Base


class ChatFeedback(Base):
    """
    Stores user Like/Dislike feedback on AI chat responses.
    Used to auto-tune system prompts and track response quality.
    """
    __tablename__ = "chat_feedback"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    # Client-generated message ID from Chat.jsx (e.g. "assistant-1723456789")
    message_id = Column(String(128), nullable=False, index=True)

    # The user's question
    question = Column(Text, nullable=True)

    # The AI's response (truncated to 4000 chars for storage)
    answer = Column(Text, nullable=True)

    # "like" or "dislike"
    feedback = Column(String(16), nullable=False)

    # Optional note from user (shown for dislike)
    notes = Column(Text, nullable=True)

    # Which LLM model generated the response
    model_used = Column(String(128), nullable=True)

    # JSON list of knowledge source IDs that were queried
    source_ids = Column(JSON, nullable=True)

    # Which tools were called (list of tool names)
    tools_called = Column(JSON, nullable=True)

    # User context
    user_id = Column(Integer, nullable=True, index=True)
    username = Column(String(128), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "message_id": self.message_id,
            "question": self.question,
            "answer": self.answer,
            "feedback": self.feedback,
            "notes": self.notes,
            "model_used": self.model_used,
            "source_ids": self.source_ids,
            "tools_called": self.tools_called,
            "user_id": self.user_id,
            "username": self.username,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }
