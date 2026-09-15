#!/bin/sh
# ─────────────────────────────────────────────────────────────────
#  MCP Knowledge Server — Backup Script
#  Runs inside backup-service container (alpine)
# ─────────────────────────────────────────────────────────────────

set -e

TIMESTAMP=$(date +%Y-%m-%d_%H-%M)
BACKUP_DIR="/backups/${TIMESTAMP}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"

echo "========================================="
echo "  Backup started: ${TIMESTAMP}"
echo "========================================="

mkdir -p "${BACKUP_DIR}"

# ── 1. MySQL dump ──────────────────────────────────────────────────
echo "[1/5] Dumping MySQL..."
mysqldump \
  -h "${MYSQL_HOST}" \
  -u "${MYSQL_USER}" \
  -p"${MYSQL_PASSWORD}" \
  --single-transaction \
  --no-tablespaces \
  --routines \
  --triggers \
  "${MYSQL_DATABASE}" | gzip > "${BACKUP_DIR}/mysql_dump.sql.gz"
echo "      ✔ mysql_dump.sql.gz"

# ── 2. Neo4j backup (hot copy of data dir) ────────────────────────
echo "[2/5] Backing up Neo4j..."
tar -czf "${BACKUP_DIR}/neo4j_backup.tar.gz" -C /data/neo4j .
echo "      ✔ neo4j_backup.tar.gz"

# ── 3. ChromaDB snapshot ──────────────────────────────────────────
echo "[3/5] Backing up ChromaDB..."
tar -czf "${BACKUP_DIR}/chromadb_snapshot.tar.gz" -C /data/chromadb .
echo "      ✔ chromadb_snapshot.tar.gz"

# ── 4. Redis RDB dump ─────────────────────────────────────────────
echo "[4/5] Backing up Redis..."
if [ -f /data/redis/dump.rdb ]; then
  cp /data/redis/dump.rdb "${BACKUP_DIR}/redis_dump.rdb"
  echo "      ✔ redis_dump.rdb"
else
  echo "      ⚠ No Redis dump.rdb found, skipping"
fi

# ── 5. Update symlink & prune old backups ─────────────────────────
echo "[5/5] Updating symlink and pruning old backups..."
ln -sfn "${BACKUP_DIR}" /backups/latest

find /backups -maxdepth 1 -type d -name "????-??-??_??-??" | sort | \
  head -n -"${RETENTION_DAYS}" | xargs -r rm -rf

# ── Optional: sync to rclone remote ───────────────────────────────
# Uncomment and configure RCLONE_REMOTE in .env to enable offsite backup
# if [ -n "${RCLONE_REMOTE}" ]; then
#   echo "Syncing to rclone remote: ${RCLONE_REMOTE}"
#   rclone sync /backups "${RCLONE_REMOTE}" --transfers 4
# fi

echo ""
echo "✅ Backup complete: ${BACKUP_DIR}"
echo "   Retention: last ${RETENTION_DAYS} snapshots kept"
echo "========================================="
