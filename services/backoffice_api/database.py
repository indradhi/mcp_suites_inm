from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base
from config import settings

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=3600,
    pool_size=10,
    max_overflow=20
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def run_migrations():
    """Idempotent schema migrations — add new columns safely."""
    migrations = [
        "ALTER TABLE knowledge_sources ADD COLUMN cache_ttl_minutes INTEGER",
        "ALTER TABLE api_keys ADD COLUMN allowed_tools TEXT NULL",
        "ALTER TABLE api_keys ADD COLUMN allowed_kbs TEXT NULL",
        "ALTER TABLE orchestration_flows MODIFY COLUMN prompt_pattern TEXT",
        """CREATE TABLE IF NOT EXISTS chat_sessions (
            id VARCHAR(128) PRIMARY KEY,
            user_id INT NOT NULL,
            title VARCHAR(255) NOT NULL DEFAULT 'Obrolan Baru',
            model VARCHAR(128) NULL,
            messages JSON NOT NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            INDEX idx_chat_sessions_user_id (user_id),
            CONSTRAINT fk_chat_session_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"""
    ]
    with engine.connect() as conn:
        for stmt in migrations:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception:
                # Column already exists or other benign error — safe to ignore
                conn.rollback()
