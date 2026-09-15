-- ─────────────────────────────────────────────────────────────────
--  MCP Knowledge Server — Seed Data
--  02_seed.sql
-- ─────────────────────────────────────────────────────────────────

USE mcp_knowledge;

-- ── Roles ─────────────────────────────────────────────────────────
INSERT IGNORE INTO roles (id, name, description) VALUES
    (1, 'admin', 'Administrator with full system privileges'),
    (2, 'editor', 'Knowledge operator able to manage sources and models'),
    (3, 'viewer', 'Read-only access to knowledge and graph');

-- ── Default Admin User (username: admin, password: admin123) ──────
-- Bcrypt hash generated for 'admin123'
INSERT INTO users (username, email, hashed_password, full_name, role_id, is_active)
VALUES 
    ('admin', 'admin@example.com', '$2b$12$SH3lQmUR/QgLfm9Vb.oRvOpICTlLmGjOpyuh75CpmtxkR2SS8d2e6', 'System Administrator', 1, TRUE)
ON DUPLICATE KEY UPDATE full_name=VALUES(full_name);

-- ── Default LLM Backend (User specified vLLM backend) ─────────────
INSERT IGNORE INTO llm_backends (id, name, backend_type, api_base, api_key, is_active, available_models, description) VALUES
    (1, 'Primary vLLM Server', 'vllm', 'http://172.16.21.122:18000/v1', 'sk-IrR7Bwxtin0haWagUnPrBgq5PurnUz86', TRUE,
     '["Qwen/Qwen3.6-35B-A3B-FP8"]', 'Remote GPU cluster running vLLM');

-- ── Default Task Model Assignments ────────────────────────────────
INSERT IGNORE INTO model_assignments (id, task, backend_id, model_name) VALUES
    (1, 'entity_extraction',     1, 'Qwen/Qwen3.6-35B-A3B-FP8'),
    (2, 'relationship_detection', 1, 'Qwen/Qwen3.6-35B-A3B-FP8'),
    (3, 'summarization',          1, 'Qwen/Qwen3.6-35B-A3B-FP8'),
    (4, 'general_qa',             1, 'Qwen/Qwen3.6-35B-A3B-FP8');
