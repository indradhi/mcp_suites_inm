import time
import json
import logging
import requests
from typing import Dict, Any, List, Optional
import chromadb
from chromadb.config import Settings as ChromaSettings

from config import settings
from database import SessionLocal
from services.database_settings_service import database_settings_service
from services.vector_store import QdrantCollectionAdapter, FastFeatureEmbeddingFunction

logger = logging.getLogger(__name__)


class VectorDBSyncService:
    """
    Service for inspecting, migrating, and synchronizing vector chunks between ChromaDB and Qdrant.
    Supports unidirectional migration (Chroma -> Qdrant or Qdrant -> Chroma) and bidirectional sync.
    """

    def get_settings(self) -> dict:
        db = SessionLocal()
        try:
            return database_settings_service.get_settings(db)
        finally:
            db.close()

    def get_chroma_info(self, db_config: dict):
        host = db_config.get("CHROMADB_HOST") or settings.CHROMADB_HOST or "chromadb"
        port = db_config.get("CHROMADB_PORT") or settings.CHROMADB_PORT or 8000
        col_name = db_config.get("CHROMADB_COLLECTION") or settings.CHROMADB_COLLECTION or "knowledge_base"
        client = chromadb.HttpClient(
            host=host,
            port=port,
            settings=ChromaSettings(allow_reset=False, anonymized_telemetry=False)
        )
        try:
            coll = client.get_collection(name=col_name)
        except Exception:
            coll = client.get_or_create_collection(name=col_name, metadata={"hnsw:space": "cosine"})
        return client, coll, host, port, col_name

    def get_qdrant_info(self, db_config: dict):
        raw_host = (db_config.get("QDRANT_HOST") or settings.QDRANT_HOST or "localhost").strip()
        port = db_config.get("QDRANT_PORT") or settings.QDRANT_PORT or 6333
        col_name = (db_config.get("QDRANT_COLLECTION") or settings.QDRANT_COLLECTION or "mcp_ai").strip()
        api_key = (db_config.get("QDRANT_API_KEY") or settings.QDRANT_API_KEY or "").strip()
        use_https = bool(db_config.get("QDRANT_HTTPS", settings.QDRANT_HTTPS))

        if raw_host.startswith("http://") or raw_host.startswith("https://"):
            base_url = raw_host.rstrip("/")
            host_without_proto = base_url.split("://", 1)[1]
            if ":" not in host_without_proto and port:
                base_url = f"{base_url}:{port}"
        else:
            scheme = "https" if use_https else "http"
            base_url = f"{scheme}://{raw_host}:{port}"

        adapter = QdrantCollectionAdapter(
            base_url=base_url,
            collection_name=col_name,
            api_key=api_key,
            default_dim=1024
        )
        return adapter, base_url, col_name, adapter.vector_dim

    def get_stats(self) -> Dict[str, Any]:
        db_config = self.get_settings()
        stats = {
            "status": "success",
            "active_provider": db_config.get("VECTOR_DB_PROVIDER", "chromadb"),
            "dual_write": bool(db_config.get("VECTOR_DB_DUAL_WRITE", False)),
            "chromadb": {
                "connected": False,
                "host": "",
                "port": 8000,
                "collection": "",
                "count": 0,
                "dim": 384,
                "error": None
            },
            "qdrant": {
                "connected": False,
                "host": "",
                "port": 6333,
                "collection": "",
                "count": 0,
                "dim": 1024,
                "error": None
            },
            "diff": 0,
            "in_sync": False
        }

        # Check ChromaDB
        try:
            _, coll, h, p, col_name = self.get_chroma_info(db_config)
            count = coll.count()
            stats["chromadb"]["connected"] = True
            stats["chromadb"]["host"] = h
            stats["chromadb"]["port"] = p
            stats["chromadb"]["collection"] = col_name
            stats["chromadb"]["count"] = count
        except Exception as e:
            stats["chromadb"]["error"] = str(e)

        # Check Qdrant
        try:
            adapter, b_url, col_name, dim = self.get_qdrant_info(db_config)
            q_count = adapter.count()
            stats["qdrant"]["connected"] = True
            stats["qdrant"]["host"] = b_url
            stats["qdrant"]["collection"] = col_name
            stats["qdrant"]["count"] = q_count
            stats["qdrant"]["dim"] = dim
        except Exception as e:
            stats["qdrant"]["error"] = str(e)

        if stats["chromadb"]["connected"] and stats["qdrant"]["connected"]:
            c_cnt = stats["chromadb"]["count"]
            q_cnt = stats["qdrant"]["count"]
            stats["diff"] = abs(c_cnt - q_cnt)
            stats["in_sync"] = (c_cnt == q_cnt)

        return stats

    def sync(
        self,
        direction: str = "chromadb_to_qdrant",
        clean_target: bool = False,
        batch_size: int = 100
    ) -> Dict[str, Any]:
        start_time = time.time()
        db_config = self.get_settings()

        _, chroma_coll, c_host, c_port, c_name = self.get_chroma_info(db_config)
        qdrant_adapter, q_url, q_name, q_dim = self.get_qdrant_info(db_config)

        res = {
            "status": "success",
            "direction": direction,
            "clean_target": clean_target,
            "source_count": 0,
            "target_count_before": 0,
            "target_count_after": 0,
            "synced_count": 0,
            "duration_seconds": 0.0,
            "message": ""
        }

        if direction in ("chromadb_to_qdrant", "chroma_to_qdrant"):
            # 1. Fetch from ChromaDB
            c_data = chroma_coll.get(include=["documents", "metadatas"])
            c_ids = c_data.get("ids", [])
            c_docs = c_data.get("documents", [])
            c_metas = c_data.get("metadatas", [])
            res["source_count"] = len(c_ids)
            res["target_count_before"] = qdrant_adapter.count()

            if clean_target:
                try:
                    requests.delete(f"{qdrant_adapter.base_url}/collections/{qdrant_adapter.collection_name}", headers=qdrant_adapter.headers, timeout=10)
                    qdrant_adapter._inspect_or_create_collection()
                except Exception as del_err:
                    logger.warning(f"Error resetting Qdrant collection: {del_err}")

            if c_ids:
                emb_fn = FastFeatureEmbeddingFunction(dim=q_dim)
                for i in range(0, len(c_ids), batch_size):
                    b_ids = c_ids[i:i+batch_size]
                    b_docs = c_docs[i:i+batch_size]
                    b_metas = c_metas[i:i+batch_size]
                    b_embs = [emb_fn._embed_text(d) for d in b_docs]
                    qdrant_adapter.upsert(ids=b_ids, documents=b_docs, metadatas=b_metas, embeddings=b_embs)
                    res["synced_count"] += len(b_ids)

            res["target_count_after"] = qdrant_adapter.count()
            res["message"] = f"Successfully synced {res['synced_count']} chunks from ChromaDB ('{c_name}') to Qdrant ('{q_name}')."

        elif direction in ("qdrant_to_chromadb", "qdrant_to_chroma"):
            res["target_count_before"] = chroma_coll.count()
            q_points = []
            offset = None
            while True:
                scroll_body = {"limit": 100, "with_payload": True, "with_vector": False}
                if offset is not None:
                    scroll_body["offset"] = offset
                r = requests.post(
                    f"{qdrant_adapter.base_url}/collections/{qdrant_adapter.collection_name}/points/scroll",
                    headers=qdrant_adapter.headers,
                    json=scroll_body,
                    timeout=15
                )
                if r.status_code != 200:
                    break
                data = r.json().get("result", {})
                pts = data.get("points", [])
                if not pts:
                    break
                q_points.extend(pts)
                offset = data.get("next_page_offset")
                if not offset:
                    break

            res["source_count"] = len(q_points)

            if clean_target:
                try:
                    all_ids = chroma_coll.get(include=[])["ids"]
                    if all_ids:
                        chroma_coll.delete(ids=all_ids)
                except Exception as del_err:
                    logger.warning(f"Error resetting ChromaDB collection: {del_err}")

            if q_points:
                emb_fn = FastFeatureEmbeddingFunction(dim=384)
                q_ids = []
                q_docs = []
                q_metas = []
                for p in q_points:
                    payload = p.get("payload") or {}
                    cid = payload.get("_original_id") or str(p.get("id"))
                    doc = payload.get("document", "")
                    meta = {k: v for k, v in payload.items() if k not in ("document", "_original_id")}
                    sanitized_meta = {}
                    for k, v in meta.items():
                        if isinstance(v, (str, int, float, bool)):
                            sanitized_meta[k] = v
                        elif v is not None:
                            sanitized_meta[k] = json.dumps(v)
                    q_ids.append(cid)
                    q_docs.append(doc)
                    q_metas.append(sanitized_meta)

                for i in range(0, len(q_ids), batch_size):
                    b_ids = q_ids[i:i+batch_size]
                    b_docs = q_docs[i:i+batch_size]
                    b_metas = q_metas[i:i+batch_size]
                    b_embs = [emb_fn._embed_text(d) for d in b_docs]
                    chroma_coll.upsert(ids=b_ids, documents=b_docs, metadatas=b_metas, embeddings=b_embs)
                    res["synced_count"] += len(b_ids)

            res["target_count_after"] = chroma_coll.count()
            res["message"] = f"Successfully synced {res['synced_count']} chunks from Qdrant ('{q_name}') to ChromaDB ('{c_name}')."

        elif direction == "bidirectional":
            c_data = chroma_coll.get(include=["documents", "metadatas"])
            c_ids = c_data.get("ids", [])
            c_dict = {cid: (doc, meta) for cid, doc, meta in zip(c_ids, c_data.get("documents", []), c_data.get("metadatas", []))}

            q_points = []
            offset = None
            while True:
                scroll_body = {"limit": 100, "with_payload": True, "with_vector": False}
                if offset is not None:
                    scroll_body["offset"] = offset
                r = requests.post(
                    f"{qdrant_adapter.base_url}/collections/{qdrant_adapter.collection_name}/points/scroll",
                    headers=qdrant_adapter.headers,
                    json=scroll_body,
                    timeout=15
                )
                if r.status_code != 200:
                    break
                data = r.json().get("result", {})
                pts = data.get("points", [])
                if not pts:
                    break
                q_points.extend(pts)
                offset = data.get("next_page_offset")
                if not offset:
                    break

            q_dict = {}
            for p in q_points:
                payload = p.get("payload") or {}
                cid = payload.get("_original_id") or str(p.get("id"))
                doc = payload.get("document", "")
                meta = {k: v for k, v in payload.items() if k not in ("document", "_original_id")}
                q_dict[cid] = (doc, meta)

            res["source_count"] = len(c_ids) + len(q_points)
            res["target_count_before"] = len(q_dict)

            # Chroma -> Qdrant (missing in Qdrant)
            missing_in_q = [cid for cid in c_ids if cid not in q_dict]
            if missing_in_q:
                emb_fn_q = FastFeatureEmbeddingFunction(dim=q_dim)
                to_q_ids = missing_in_q
                to_q_docs = [c_dict[cid][0] for cid in to_q_ids]
                to_q_metas = [c_dict[cid][1] for cid in to_q_ids]
                to_q_embs = [emb_fn_q._embed_text(d) for d in to_q_docs]
                qdrant_adapter.upsert(ids=to_q_ids, documents=to_q_docs, metadatas=to_q_metas, embeddings=to_q_embs)
                res["synced_count"] += len(to_q_ids)

            # Qdrant -> Chroma (missing in Chroma)
            missing_in_c = [cid for cid in q_dict if cid not in c_dict]
            if missing_in_c:
                emb_fn_c = FastFeatureEmbeddingFunction(dim=384)
                to_c_ids = missing_in_c
                to_c_docs = [q_dict[cid][0] for cid in to_c_ids]
                to_c_metas = []
                for cid in to_c_ids:
                    raw_m = q_dict[cid][1]
                    s_m = {}
                    for k, v in raw_m.items():
                        if isinstance(v, (str, int, float, bool)):
                            s_m[k] = v
                        elif v is not None:
                            s_m[k] = json.dumps(v)
                    to_c_metas.append(s_m)
                to_c_embs = [emb_fn_c._embed_text(d) for d in to_c_docs]
                chroma_coll.upsert(ids=to_c_ids, documents=to_c_docs, metadatas=to_c_metas, embeddings=to_c_embs)
                res["synced_count"] += len(to_c_ids)

            res["target_count_after"] = qdrant_adapter.count()
            res["message"] = (
                f"Bidirectional sync complete: {len(missing_in_q)} chunks pushed to Qdrant, "
                f"{len(missing_in_c)} chunks pulled to ChromaDB. Total synchronized: {res['synced_count']}."
            )

        res["duration_seconds"] = round(time.time() - start_time, 2)
        return res


vector_sync_service = VectorDBSyncService()
