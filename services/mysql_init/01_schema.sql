-- ─────────────────────────────────────────────────────────────────
--  MCP Knowledge Server — Database Schema
--  01_schema.sql
-- ─────────────────────────────────────────────────────────────────

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE DATABASE IF NOT EXISTS mcp_knowledge;
USE mcp_knowledge;

-- ── Roles ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
    id          INT          NOT NULL AUTO_INCREMENT,
    name        VARCHAR(50)  NOT NULL UNIQUE,
    description VARCHAR(255) NULL,
    permissions TEXT         NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Users ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id              INT           NOT NULL AUTO_INCREMENT,
    username        VARCHAR(100)  NOT NULL UNIQUE,
    email           VARCHAR(255)  NOT NULL UNIQUE,
    hashed_password VARCHAR(255)  NOT NULL,
    full_name       VARCHAR(150)  NULL,
    role_id         INT           NOT NULL,
    is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY (role_id) REFERENCES roles(id),
    INDEX idx_user_username (username),
    INDEX idx_user_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Refresh Tokens ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id         INT           NOT NULL AUTO_INCREMENT,
    user_id    INT           NOT NULL,
    token      VARCHAR(512)  NOT NULL UNIQUE,
    expires_at DATETIME      NOT NULL,
    revoked    BOOLEAN       NOT NULL DEFAULT FALSE,
    created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_token (token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── LLM Backends ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS llm_backends (
    id               INT           NOT NULL AUTO_INCREMENT,
    name             VARCHAR(100)  NOT NULL,
    backend_type     VARCHAR(50)   NOT NULL DEFAULT 'vllm', -- vllm, ollama, openai, custom
    api_base         VARCHAR(255)  NOT NULL,
    api_key          VARCHAR(255)  NULL,
    is_active        BOOLEAN       NOT NULL DEFAULT TRUE,
    available_models JSON          NULL,
    description      TEXT          NULL,
    created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Task Model Assignments ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS model_assignments (
    id          INT          NOT NULL AUTO_INCREMENT,
    task        VARCHAR(50)  NOT NULL UNIQUE, -- entity_extraction, relationship_detection, summarization, general_qa
    backend_id  INT          NOT NULL,
    model_name  VARCHAR(150) NOT NULL,
    parameters  JSON         NULL,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY (backend_id) REFERENCES llm_backends(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Knowledge Sources ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS knowledge_sources (
    id             INT          NOT NULL AUTO_INCREMENT,
    name           VARCHAR(150) NOT NULL,
    source_type    VARCHAR(50)  NOT NULL, -- database, api, file, website, websearch, google_drive
    description    TEXT         NULL,
    config         JSON         NOT NULL,
    schedule_cron  VARCHAR(100) NULL,
    is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
    last_synced_at DATETIME     NULL,
    sync_status    VARCHAR(50)  NOT NULL DEFAULT 'idle', -- idle, running, completed, failed
    created_by     INT          NULL,
    created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_source_type (source_type),
    INDEX idx_sync_status (sync_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Knowledge Documents ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS knowledge_documents (
    id             INT          NOT NULL AUTO_INCREMENT,
    source_id      INT          NOT NULL,
    title          VARCHAR(255) NOT NULL,
    file_path      VARCHAR(512) NULL,
    file_type      VARCHAR(50)  NULL,
    file_size      INT          NULL,
    chunk_count    INT          NOT NULL DEFAULT 0,
    entities_count INT          NOT NULL DEFAULT 0,
    vector_ids     JSON         NULL,
    status         VARCHAR(50)  NOT NULL DEFAULT 'pending',
    metadata_info  JSON         NULL,
    created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY (source_id) REFERENCES knowledge_sources(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Ingestion Jobs ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ingest_jobs (
    id                 INT          NOT NULL AUTO_INCREMENT,
    source_id          INT          NOT NULL,
    status             VARCHAR(50)  NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
    task_id            VARCHAR(100) NULL,
    total_records      INT          NOT NULL DEFAULT 0,
    processed_records  INT          NOT NULL DEFAULT 0,
    chunks_created     INT          NOT NULL DEFAULT 0,
    entities_extracted INT          NOT NULL DEFAULT 0,
    relations_created  INT          NOT NULL DEFAULT 0,
    error_message      TEXT         NULL,
    job_metadata       JSON         NULL,
    started_at         DATETIME     NULL,
    completed_at       DATETIME     NULL,
    created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY (source_id) REFERENCES knowledge_sources(id) ON DELETE CASCADE,
    INDEX idx_job_status (status),
    INDEX idx_job_task (task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
