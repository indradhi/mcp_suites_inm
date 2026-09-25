import json
from sqlalchemy.orm import Session
from models.system_setting import SystemSetting
from config import settings

class DatabaseSettingsService:
    SETTING_KEY = "database_configuration"

    def get_settings(self, db: Session) -> dict:
        setting = db.query(SystemSetting).filter(SystemSetting.key == self.SETTING_KEY).first()
        
        # Default config from env/config.py
        default_config = {
            "VECTOR_DB_PROVIDER": settings.VECTOR_DB_PROVIDER,
            "CHROMADB_HOST": settings.CHROMADB_HOST,
            "CHROMADB_PORT": settings.CHROMADB_PORT,
            "CHROMADB_COLLECTION": settings.CHROMADB_COLLECTION,
            "QDRANT_HOST": settings.QDRANT_HOST,
            "QDRANT_PORT": settings.QDRANT_PORT,
            "QDRANT_COLLECTION": settings.QDRANT_COLLECTION,
            "QDRANT_API_KEY": settings.QDRANT_API_KEY,
            "QDRANT_HTTPS": settings.QDRANT_HTTPS,
            "NEO4J_URI": settings.NEO4J_URI,
            "NEO4J_USER": settings.NEO4J_USER,
            "NEO4J_PASSWORD": settings.NEO4J_PASSWORD,
        }

        if setting and setting.value:
            # Override defaults with saved values
            for k, v in setting.value.items():
                default_config[k] = v

        return default_config

    def save_settings(self, db: Session, payload: dict) -> dict:
        setting = db.query(SystemSetting).filter(SystemSetting.key == self.SETTING_KEY).first()
        if not setting:
            setting = SystemSetting(key=self.SETTING_KEY, value=payload, description="Configuration for external graph and vector databases")
            db.add(setting)
        else:
            # Merge with existing
            current = dict(setting.value) if setting.value else {}
            current.update(payload)
            setting.value = current

        db.commit()
        db.refresh(setting)
        return setting.value

database_settings_service = DatabaseSettingsService()
