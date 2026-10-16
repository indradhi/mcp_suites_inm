import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # App
    APP_NAME: str = "MCP Backoffice API"
    DEBUG: bool = False
    SECRET_KEY: str = os.getenv("SECRET_KEY") or os.getenv("JWT_SECRET_KEY", "mcp_super_secret_jwt_key_please_change_in_production")
    ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES") or os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
    REFRESH_TOKEN_EXPIRE_DAYS: int = int(os.getenv("JWT_REFRESH_TOKEN_EXPIRE_DAYS") or os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))

    # MySQL
    MYSQL_HOST: str = os.getenv("MYSQL_HOST", "mysql")
    MYSQL_PORT: int = int(os.getenv("MYSQL_PORT", "3306"))
    MYSQL_DATABASE: str = os.getenv("MYSQL_DATABASE", "mcp_knowledge")
    MYSQL_USER: str = os.getenv("MYSQL_USER", "mcp_user")
    MYSQL_PASSWORD: str = os.getenv("MYSQL_PASSWORD", "mcp_password")

    @property
    def DATABASE_URL(self) -> str:
        return f"mysql+pymysql://{self.MYSQL_USER}:{self.MYSQL_PASSWORD}@{self.MYSQL_HOST}:{self.MYSQL_PORT}/{self.MYSQL_DATABASE}?charset=utf8mb4"

    # Redis / Celery
    REDIS_HOST: str = os.getenv("REDIS_HOST", "redis")
    REDIS_PORT: int = int(os.getenv("REDIS_PORT", "6379"))

    @property
    def CELERY_BROKER_URL(self) -> str:
        redis_url = os.getenv("REDIS_URL")
        if redis_url:
            return redis_url
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/0"

    @property
    def CELERY_RESULT_BACKEND(self) -> str:
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/1"

    # Vector Database
    VECTOR_DB_PROVIDER: str = os.getenv("VECTOR_DB_PROVIDER", "chromadb")
    VECTOR_DB_DUAL_WRITE: bool = os.getenv("VECTOR_DB_DUAL_WRITE", "false").lower() in ("true", "1", "yes")

    # ChromaDB
    CHROMADB_HOST: str = os.getenv("CHROMADB_HOST") or os.getenv("CHROMA_HOST", "chromadb")
    CHROMADB_PORT: int = int(os.getenv("CHROMADB_PORT") or os.getenv("CHROMA_PORT", "8000"))
    CHROMADB_COLLECTION: str = os.getenv("CHROMADB_COLLECTION") or os.getenv("CHROMA_COLLECTION", "knowledge_base")

    # Qdrant
    QDRANT_HOST: str = os.getenv("QDRANT_HOST", "localhost")
    QDRANT_PORT: int = int(os.getenv("QDRANT_PORT", "6333"))
    QDRANT_COLLECTION: str = os.getenv("QDRANT_COLLECTION", "knowledge_base")
    QDRANT_API_KEY: str = os.getenv("QDRANT_API_KEY", "")
    QDRANT_HTTPS: bool = os.getenv("QDRANT_HTTPS", "false").lower() in ("true", "1", "yes")

    # Neo4j
    NEO4J_URI: str = os.getenv("NEO4J_URI", "bolt://neo4j:7687")
    NEO4J_USER: str = os.getenv("NEO4J_USER", "neo4j")
    NEO4J_PASSWORD: str = os.getenv("NEO4J_PASSWORD", "neo4j_secret_change_me")

    # Storage
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "/app/uploads")

    # Default LLM Backend (User specified)
    DEFAULT_OPENAI_API_BASE: str = os.getenv("OPENAI_API_BASE", "http://172.16.21.122:18000/v1")
    DEFAULT_OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "sk-IrR7Bwxtin0haWagUnPrBgq5PurnUz86")
    DEFAULT_OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "Qwen/Qwen3.6-35B-A3B-FP8")
    LOCAL_LLM_TIMEOUT: float = float(os.getenv("LOCAL_LLM_TIMEOUT", "600.0"))
    CLOUD_LLM_TIMEOUT: float = float(os.getenv("CLOUD_LLM_TIMEOUT", "60.0"))
    LLM_MAX_RETRIES: int = int(os.getenv("LLM_MAX_RETRIES", "3"))
    LLM_RETRY_BACKOFF: float = float(os.getenv("LLM_RETRY_BACKOFF", "1.5"))

    class Config:
        case_sensitive = True

settings = Settings()
