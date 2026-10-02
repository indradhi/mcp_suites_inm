import os
import re
import json
import math
import uuid
import hashlib
import logging
from typing import List, Dict, Any, Optional
import numpy as np
import requests
import chromadb
from chromadb.config import Settings
from chromadb.api.types import Documents, EmbeddingFunction, Embeddings
from config import settings

logger = logging.getLogger(__name__)


class FastFeatureEmbeddingFunction(EmbeddingFunction[Documents]):
    """
    High-performance, zero-dependency offline feature-hashing embedding function.
    Projects sub-tokens, char n-grams, and word bigrams into a normalized vector (default 384-dim, or collection-specific).
    Enables robust semantic and keyword matching via cosine similarity without external APIs or onnxruntime.
    """
    def __init__(self, dim: int = 384):
        self.dim = dim

    def _tokenize(self, text: str) -> List[str]:
        raw_words = re.findall(r'\w+', text.lower())
        tokens = list(raw_words)
        # Word bigrams for phrase matching
        for i in range(len(raw_words) - 1):
            tokens.append(f"{raw_words[i]}_{raw_words[i+1]}")
        # Char 3-grams and 4-grams for sub-word / fuzzy matching
        for w in raw_words:
            if len(w) >= 3:
                for j in range(len(w) - 2):
                    tokens.append(w[j:j+3])
            if len(w) >= 4:
                for j in range(len(w) - 3):
                    tokens.append(w[j:j+4])
        return tokens

    def _embed_text(self, text: str) -> List[float]:
        vec = np.zeros(self.dim, dtype=np.float32)
        tokens = self._tokenize(text)
        if not tokens:
            return vec.tolist()

        counts: Dict[str, int] = {}
        for t in tokens:
            counts[t] = counts.get(t, 0) + 1

        for t, count in counts.items():
            h = int(hashlib.md5(t.encode("utf-8")).hexdigest(), 16)
            idx = h % self.dim
            sign = 1.0 if ((h >> 31) & 1) else -1.0
            weight = (1.0 + math.log(count)) * sign
            vec[idx] += weight

        norm = float(np.linalg.norm(vec))
        if norm > 1e-9:
            vec = vec / norm
        return vec.tolist()

    def name(self) -> str:
        return "FastFeatureEmbeddingFunction"

    def __call__(self, input: Documents) -> Embeddings:
        return [self._embed_text(doc) for doc in input]


class QdrantCollectionAdapter:
    """
    Zero-dependency REST adapter providing ChromaDB collection-like interface over Qdrant.
    Supports point count, get by IDs or scroll filter, batch upsert, delete by filter/IDs, and similarity search.
    """
    def __init__(self, base_url: str, collection_name: str, api_key: str = "", default_dim: int = 1024):
        self.base_url = base_url.rstrip("/")
        self.collection_name = collection_name
        self.api_key = api_key
        self.headers = {"Content-Type": "application/json"}
        if self.api_key:
            self.headers["api-key"] = self.api_key
        self.default_dim = default_dim
        self.vector_dim = self._inspect_or_create_collection()

    def _inspect_or_create_collection(self) -> int:
        try:
            r = requests.get(f"{self.base_url}/collections/{self.collection_name}", headers=self.headers, timeout=6)
            if r.status_code == 200:
                data = r.json().get("result", {})
                v_params = data.get("config", {}).get("params", {}).get("vectors", {})
                if isinstance(v_params, dict) and "size" in v_params:
                    return int(v_params["size"])
                return self.default_dim
            elif r.status_code == 404:
                create_payload = {
                    "vectors": {
                        "size": self.default_dim,
                        "distance": "Cosine"
                    }
                }
                cr = requests.put(f"{self.base_url}/collections/{self.collection_name}", headers=self.headers, json=create_payload, timeout=6)
                if cr.status_code in (200, 201):
                    logger.info(f"Created Qdrant collection '{self.collection_name}' with vector size {self.default_dim}")
                    return self.default_dim
                else:
                    logger.warning(f"Failed creating Qdrant collection '{self.collection_name}': {cr.text}")
        except Exception as e:
            logger.warning(f"Could not inspect or create Qdrant collection '{self.collection_name}': {e}")
        return self.default_dim

    def count(self) -> int:
        try:
            r = requests.post(f"{self.base_url}/collections/{self.collection_name}/points/count", headers=self.headers, json={"exact": True}, timeout=6)
            if r.status_code == 200:
                return r.json().get("result", {}).get("count", 0)
        except Exception as e:
            logger.error(f"Error getting count from Qdrant: {e}")
        return 0

    def _convert_id_to_uuid(self, orig_id: Any) -> str:
        s_id = str(orig_id)
        try:
            uuid.UUID(s_id)
            return s_id
        except Exception:
            return str(uuid.uuid5(uuid.NAMESPACE_DNS, s_id))

    def _build_filter(self, where: Optional[Dict[str, Any]] = None, contains_text: Optional[str] = None) -> Optional[Dict[str, Any]]:
        must_conditions = []
        if contains_text:
            must_conditions.append({
                "key": "document",
                "match": {"text": contains_text}
            })
        if where:
            for k, v in where.items():
                if k == "$and" and isinstance(v, list):
                    for cond in v:
                        for sub_k, sub_v in cond.items():
                            must_conditions.append({"key": sub_k, "match": {"value": sub_v}})
                elif isinstance(v, dict):
                    if "$eq" in v:
                        must_conditions.append({"key": k, "match": {"value": v["$eq"]}})
                    elif "$in" in v:
                        must_conditions.append({"key": k, "match": {"any": v["$in"]}})
                else:
                    must_conditions.append({"key": k, "match": {"value": v}})

        if not must_conditions:
            return None
        return {"must": must_conditions}

    def get(
        self,
        ids: Optional[List[str]] = None,
        where: Optional[Dict[str, Any]] = None,
        where_document: Optional[Dict[str, Any]] = None,
        limit: int = 100,
        offset: Optional[Any] = None,
        include: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        output = {"ids": [], "documents": [], "metadatas": []}

        # 1. Fetch by explicit IDs
        if ids:
            uuids = [self._convert_id_to_uuid(i) for i in ids]
            try:
                r = requests.post(
                    f"{self.base_url}/collections/{self.collection_name}/points",
                    headers=self.headers,
                    json={"ids": uuids, "with_payload": True, "with_vector": False},
                    timeout=10
                )
                if r.status_code == 200:
                    points = r.json().get("result", [])
                    for p in points:
                        payload = p.get("payload") or {}
                        orig_id = payload.get("_original_id") or str(p["id"])
                        doc = payload.get("document", "")
                        meta = {k: v for k, v in payload.items() if k not in ("document", "_original_id")}
                        output["ids"].append(orig_id)
                        output["documents"].append(doc)
                        output["metadatas"].append(meta)
            except Exception as e:
                logger.error(f"Error in Qdrant get by IDs: {e}")
            return output

        # 2. Scroll by filter / text
        contains_text = None
        if where_document and isinstance(where_document, dict):
            contains_text = where_document.get("$contains")

        q_filter = self._build_filter(where=where, contains_text=contains_text)
        only_ids = include is not None and len(include) == 0

        num_offset = 0
        if isinstance(offset, int) and offset > 0:
            num_offset = offset
            fetch_limit = num_offset + (limit or 100)
        else:
            fetch_limit = limit or 100

        scroll_body = {
            "limit": fetch_limit,
            "with_payload": not only_ids,
            "with_vector": False
        }
        if q_filter:
            scroll_body["filter"] = q_filter

        try:
            r = requests.post(
                f"{self.base_url}/collections/{self.collection_name}/points/scroll",
                headers=self.headers,
                json=scroll_body,
                timeout=10
            )
            if r.status_code == 200:
                res_data = r.json().get("result", {})
                points = res_data.get("points", [])
                if num_offset > 0:
                    points = points[num_offset:num_offset + limit]

                for p in points:
                    payload = p.get("payload") or {}
                    orig_id = payload.get("_original_id") or str(p["id"])
                    doc = payload.get("document", "")
                    meta = {k: v for k, v in payload.items() if k not in ("document", "_original_id")}
                    output["ids"].append(orig_id)
                    output["documents"].append(doc)
                    output["metadatas"].append(meta)
        except Exception as e:
            logger.error(f"Error in Qdrant scroll get: {e}")

        return output

    def upsert(
        self,
        ids: List[str],
        documents: List[str],
        metadatas: List[Dict[str, Any]],
        embeddings: List[List[float]]
    ):
        batch_size = 200
        for i in range(0, len(ids), batch_size):
            b_ids = ids[i:i+batch_size]
            b_docs = documents[i:i+batch_size]
            b_metas = metadatas[i:i+batch_size]
            b_embs = embeddings[i:i+batch_size]

            points = []
            for cid, doc, meta, emb in zip(b_ids, b_docs, b_metas, b_embs):
                pid = self._convert_id_to_uuid(cid)
                payload = dict(meta) if meta else {}
                payload["document"] = doc
                payload["_original_id"] = str(cid)
                points.append({
                    "id": pid,
                    "vector": emb,
                    "payload": payload
                })

            r = requests.put(
                f"{self.base_url}/collections/{self.collection_name}/points?wait=true",
                headers=self.headers,
                json={"points": points},
                timeout=15
            )
            if r.status_code not in (200, 201):
                logger.error(f"Failed upserting batch to Qdrant: {r.status_code} {r.text[:300]}")
                raise Exception(f"Qdrant upsert failed ({r.status_code}): {r.text[:200]}")

    def delete(
        self,
        where: Optional[Dict[str, Any]] = None,
        ids: Optional[List[str]] = None
    ):
        if ids:
            uuids = [self._convert_id_to_uuid(i) for i in ids]
            requests.post(
                f"{self.base_url}/collections/{self.collection_name}/points/delete?wait=true",
                headers=self.headers,
                json={"points": uuids},
                timeout=10
            )
        elif where:
            q_filter = self._build_filter(where=where)
            if q_filter:
                requests.post(
                    f"{self.base_url}/collections/{self.collection_name}/points/delete?wait=true",
                    headers=self.headers,
                    json={"filter": q_filter},
                    timeout=10
                )

    def query(
        self,
        query_embeddings: List[List[float]],
        n_results: int = 5,
        where: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        output = {
            "ids": [[]],
            "documents": [[]],
            "metadatas": [[]],
            "distances": [[]]
        }
        if not query_embeddings:
            return output

        emb = query_embeddings[0]
        search_body = {
            "vector": emb,
            "limit": n_results,
            "with_payload": True,
            "with_vector": False
        }
        q_filter = self._build_filter(where=where)
        if q_filter:
            search_body["filter"] = q_filter

        try:
            r = requests.post(
                f"{self.base_url}/collections/{self.collection_name}/points/search",
                headers=self.headers,
                json=search_body,
                timeout=10
            )
            if r.status_code == 200:
                hits = r.json().get("result", [])
                for h in hits:
                    payload = h.get("payload") or {}
                    orig_id = payload.get("_original_id") or str(h.get("id"))
                    doc = payload.get("document", "")
                    meta = {k: v for k, v in payload.items() if k not in ("document", "_original_id")}
                    score = float(h.get("score", 1.0))
                    dist = max(0.0, 1.0 - score)

                    output["ids"][0].append(orig_id)
                    output["documents"][0].append(doc)
                    output["metadatas"][0].append(meta)
                    output["distances"][0].append(dist)
        except Exception as e:
            logger.error(f"Error in Qdrant vector search: {e}")

        return output


from database import SessionLocal
from services.database_settings_service import database_settings_service

class VectorStoreService:
    def __init__(self):
        self.embedding_fn = FastFeatureEmbeddingFunction(dim=384)
        self._client = None
        self._collection = None
        self._secondary_collection = None
        self._secondary_embedding_fn = None
        self.provider = "chromadb"
        self.collection_name = "knowledge_base"
        self.dual_write = False

    def reload(self):
        """Forces vector store to reload client and collection configuration from database settings."""
        self._client = None
        self._collection = None
        self._secondary_collection = None
        self._secondary_embedding_fn = None

    def get_client(self):
        if self._client is None:
            try:
                db = SessionLocal()
                try:
                    db_config = database_settings_service.get_settings(db)
                finally:
                    db.close()

                provider = (db_config.get("VECTOR_DB_PROVIDER") or settings.VECTOR_DB_PROVIDER or "chromadb").lower()
                self.provider = "qdrant" if "qdrant" in provider else "chromadb"
                self.dual_write = bool(db_config.get("VECTOR_DB_DUAL_WRITE", settings.VECTOR_DB_DUAL_WRITE))

                if self.provider == "qdrant":
                    raw_host = (db_config.get("QDRANT_HOST") or settings.QDRANT_HOST or "localhost").strip()
                    port = db_config.get("QDRANT_PORT") or settings.QDRANT_PORT or 6333
                    self.collection_name = (db_config.get("QDRANT_COLLECTION") or settings.QDRANT_COLLECTION or "mcp_ai").strip()
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
                        collection_name=self.collection_name,
                        api_key=api_key,
                        default_dim=1024
                    )
                    self._collection = adapter
                    self._client = adapter
                    if adapter.vector_dim != self.embedding_fn.dim:
                        self.embedding_fn = FastFeatureEmbeddingFunction(dim=adapter.vector_dim)
                    logger.info(f"Initialized Qdrant vector store: {base_url} collection='{self.collection_name}' (dim={adapter.vector_dim})")
                    return self._client
                else:
                    self.host = db_config.get("CHROMADB_HOST") or settings.CHROMADB_HOST
                    self.port = db_config.get("CHROMADB_PORT") or settings.CHROMADB_PORT
                    self.collection_name = db_config.get("CHROMADB_COLLECTION") or settings.CHROMADB_COLLECTION

                    self._client = chromadb.HttpClient(
                        host=self.host,
                        port=self.port,
                        settings=Settings(allow_reset=False, anonymized_telemetry=False)
                    )
                    self.embedding_fn = FastFeatureEmbeddingFunction(dim=384)
                    logger.info(f"Initialized ChromaDB vector store: {self.host}:{self.port} collection='{self.collection_name}'")
            except Exception as e:
                logger.error(f"Failed connecting to Vector Store ({getattr(self, 'provider', 'unknown')}): {e}")
                raise
        return self._client

    def get_collection(self):
        if self._collection is None:
            client = self.get_client()
            if getattr(self, "provider", "") == "qdrant":
                return self._collection
            try:
                self._collection = client.get_collection(name=self.collection_name)
            except Exception:
                try:
                    self._collection = client.create_collection(
                        name=self.collection_name,
                        metadata={"hnsw:space": "cosine"}
                    )
                except Exception:
                    self._collection = client.get_or_create_collection(
                        name=self.collection_name,
                        metadata={"hnsw:space": "cosine"}
                    )
        return self._collection

    def get_secondary_collection(self):
        """Initializes and returns secondary vector database collection for live dual-write replication."""
        if not getattr(self, "dual_write", False):
            return None
        if self._secondary_collection is not None:
            return self._secondary_collection

        try:
            db = SessionLocal()
            try:
                db_config = database_settings_service.get_settings(db)
            finally:
                db.close()

            if self.provider == "qdrant":
                # Primary is Qdrant, secondary is ChromaDB
                c_host = db_config.get("CHROMADB_HOST") or settings.CHROMADB_HOST or "chromadb"
                c_port = db_config.get("CHROMADB_PORT") or settings.CHROMADB_PORT or 8000
                c_name = db_config.get("CHROMADB_COLLECTION") or settings.CHROMADB_COLLECTION or "knowledge_base"
                client = chromadb.HttpClient(
                    host=c_host,
                    port=c_port,
                    settings=Settings(allow_reset=False, anonymized_telemetry=False)
                )
                try:
                    self._secondary_collection = client.get_collection(name=c_name)
                except Exception:
                    self._secondary_collection = client.get_or_create_collection(name=c_name, metadata={"hnsw:space": "cosine"})
                self._secondary_embedding_fn = FastFeatureEmbeddingFunction(dim=384)
                logger.info(f"Initialized secondary ChromaDB for dual-write: {c_host}:{c_port} collection='{c_name}'")
            else:
                # Primary is ChromaDB, secondary is Qdrant
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
                self._secondary_collection = adapter
                self._secondary_embedding_fn = FastFeatureEmbeddingFunction(dim=adapter.vector_dim)
                logger.info(f"Initialized secondary Qdrant for dual-write: {base_url} collection='{col_name}' (dim={adapter.vector_dim})")
            return self._secondary_collection
        except Exception as e:
            logger.warning(f"Could not initialize secondary vector store for dual-write: {e}")
            return None

    def add_chunks(
        self,
        texts: List[str],
        metadatas: List[Dict[str, Any]],
        ids: List[str]
    ):
        """
        Adds text chunks with metadata and unique IDs to the primary vector database.
        If dual-write is enabled, also replicates chunks to the secondary vector database.
        """
        if not texts:
            return
        collection = self.get_collection()
        batch_size = 500
        for i in range(0, len(texts), batch_size):
            batch_texts = texts[i:i+batch_size]
            batch_metas = metadatas[i:i+batch_size]
            batch_ids = ids[i:i+batch_size]
            batch_embeddings = [self.embedding_fn._embed_text(t) for t in batch_texts]
            collection.upsert(
                documents=batch_texts,
                embeddings=batch_embeddings,
                metadatas=batch_metas,
                ids=batch_ids
            )

            # Replicate to secondary if dual-write is enabled
            if getattr(self, "dual_write", False):
                try:
                    sec_coll = self.get_secondary_collection()
                    if sec_coll and self._secondary_embedding_fn:
                        sec_embs = [self._secondary_embedding_fn._embed_text(t) for t in batch_texts]
                        # Sanitize metadata if secondary is ChromaDB (which requires primitive values)
                        if self.provider == "qdrant":
                            sanitized_metas = []
                            for m in batch_metas:
                                sm = {}
                                for k, v in (m or {}).items():
                                    if isinstance(v, (str, int, float, bool)):
                                        sm[k] = v
                                    elif v is not None:
                                        sm[k] = json.dumps(v)
                                sanitized_metas.append(sm)
                            sec_meta_to_write = sanitized_metas
                        else:
                            sec_meta_to_write = batch_metas

                        sec_coll.upsert(
                            documents=batch_texts,
                            embeddings=sec_embs,
                            metadatas=sec_meta_to_write,
                            ids=batch_ids
                        )
                except Exception as dw_err:
                    logger.warning(f"Dual-write replication error in add_chunks: {dw_err}")

    def delete_by_source(self, source_id: int):
        """
        Deletes all chunks associated with a specific knowledge source from primary vector store.
        If dual-write is enabled, also deletes from secondary vector store.
        """
        collection = self.get_collection()
        collection.delete(where={"source_id": source_id})
        if getattr(self, "dual_write", False):
            try:
                sec_coll = self.get_secondary_collection()
                if sec_coll:
                    sec_coll.delete(where={"source_id": source_id})
            except Exception as dw_err:
                logger.warning(f"Dual-write delete error in delete_by_source: {dw_err}")

    def query_similarity(
        self,
        query: str,
        n_results: int = 5,
        filter_meta: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        collection = self.get_collection()
        output = []
        seen_ids = set()

        # 1. Hybrid Search: Keyword & Entity Exact Match
        # In tabular/database knowledge bases (e.g. Dukcapil, civil registry),
        # specific citizen names, NIKs, or entity IDs can become diluted when concatenated into multi-record chunks.
        # Pre-searching ChromaDB with prioritized entity substring matching ensures chunks containing the target entity are retrieved first.
        try:
            stopwords = {
                "siapa", "siapakah", "apa", "apakah", "dimana", "kapan", "bagaimana",
                "mengapa", "kenapa", "dari", "pada", "yang", "untuk", "dengan", "adalah",
                "yaitu", "profil", "profile", "data", "cari", "temukan", "lihat", "tolong",
                "cek", "info", "informasi", "tentang", "orang", "nama", "nik", "nohp",
                "alamat", "nomor", "semua", "bisa", "mohon", "atau", "dan", "serta",
                "ke", "di", "ini", "itu", "terkait", "mengenai", "milik", "punya", "atas",
                "dokumen", "berkas", "hasil", "pencarian", "daftar", "seperti"
            }

            kw_candidates = []

            # A0. Extract explicit numeric identifiers (NIK, NO_KK, Certificate Numbers, etc.)
            id_matches = re.findall(r'\b\d{6,20}\b', query)
            for im in id_matches:
                if im not in kw_candidates:
                    kw_candidates.append(im)

            # A. Extract person names preceded by indicators ('nama', 'bernama', 'atas nama', 'orang')
            name_patterns = [
                r"(?:atas\s+nama|dengan\s+nama|bernama|nama|subjek|orang)\s+([a-zA-Z\s]{4,})",
            ]
            for pat in name_patterns:
                m = re.search(pat, query, re.IGNORECASE)
                if m:
                    extracted = m.group(1).strip()
                    e_words = [w for w in extracted.split() if w.lower() not in stopwords and len(w) >= 2]
                    if len(e_words) >= 2:
                        kw_candidates.append(" ".join(e_words).upper())
                        for i in range(len(e_words) - 1):
                            kw_candidates.append(f"{e_words[i]} {e_words[i+1]}".upper())
                    for w in e_words:
                        if len(w) >= 3:
                            kw_candidates.append(w.upper())

            # B. General non-stopword tokens
            clean_q = re.sub(r"[^\w\s]", " ", query)
            words = [w.strip() for w in clean_q.split() if len(w.strip()) >= 3]
            sig_words = [w for w in words if w.lower() not in stopwords]

            if len(sig_words) >= 2:
                full_sig = " ".join(sig_words).upper()
                if full_sig not in kw_candidates:
                    kw_candidates.append(full_sig)

            for w in sig_words:
                w_up = w.upper()
                if w_up not in kw_candidates:
                    kw_candidates.append(w_up)
                if w.isdigit() and w not in kw_candidates:
                    kw_candidates.append(w)

            # Deduplicate preserving high priority order
            ordered_kws = []
            seen_kw = set()
            for kw in kw_candidates:
                if kw not in seen_kw:
                    seen_kw.add(kw)
                    ordered_kws.append(kw)

            exact_matched_chunks = []
            has_strong_hit = False

            for kw in ordered_kws:
                # If we already have strong entity/ID hits, don't pollute with short generic single words
                if has_strong_hit and (" " not in kw and len(kw) < 6 and not kw.isdigit()):
                    continue

                is_id_code = kw.isdigit() and len(kw) >= 6
                is_multiword = " " in kw
                limit = max(15, n_results * 2) if (is_multiword or is_id_code) else 3

                kw_kwargs = {
                    "where_document": {"$contains": kw},
                    "limit": limit
                }
                if filter_meta:
                    kw_kwargs["where"] = filter_meta

                try:
                    kw_res = collection.get(**kw_kwargs)
                    if kw_res and "documents" in kw_res and kw_res["documents"]:
                        for cid, doc, meta in zip(kw_res["ids"], kw_res["documents"], kw_res.get("metadatas", [])):
                            if cid not in seen_ids:
                                seen_ids.add(cid)
                                # Scoring hierarchy:
                                # 1.0 : Full person name, exact NIK, or exact NO_KK match
                                # 0.95: Multi-word entity phrase match
                                # 0.90: Single word attribute match (NAMA: X, NIK: X)
                                # 0.80: Single word substring match
                                is_id_match = is_id_code and (
                                    f"NO_KK: {kw}" in doc or f"NIK: {kw}" in doc or f": {kw}" in doc or kw in doc
                                )
                                is_full_name_match = (
                                    f"NAMA_LGKP: {kw}" in doc or 
                                    f"NAMA: {kw}" in doc or
                                    (is_multiword and kw in doc and ("NAMA_LGKP:" in doc or "NAMA:" in doc))
                                )
                                is_attr_match = f"NIK: {kw}" in doc or f"NO_KK: {kw}" in doc or f": {kw}" in doc
                                
                                if is_id_match or is_full_name_match:
                                    score = 1.0
                                    has_strong_hit = True
                                elif is_multiword:
                                    score = 0.95
                                    has_strong_hit = True
                                elif is_attr_match:
                                    score = 0.90
                                else:
                                    score = 0.80

                                # Avoid duplicate bank snapshots of the exact same person crowding out other family members
                                nik_match = re.search(r'\bNIK[\s:=]+([0-9]{10,20})', doc)
                                nik_val = nik_match.group(1) if nik_match else None
                                if nik_val and cid.startswith("bank_") and any(ec.get("nik") == nik_val and ec.get("id", "").startswith("bank_") for ec in exact_matched_chunks):
                                    continue

                                exact_matched_chunks.append({
                                    "id": cid,
                                    "content": doc,
                                    "score": score,
                                    "nik": nik_val,
                                    "metadata": meta
                                })
                except Exception as kw_err:
                    logger.debug(f"Keyword lookup for '{kw}' skipped or failed: {kw_err}")

                if len(exact_matched_chunks) >= n_results and has_strong_hit:
                    break

            exact_matched_chunks.sort(key=lambda x: x["score"], reverse=True)
            output.extend(exact_matched_chunks[:n_results])
        except Exception as e:
            logger.warning(f"Hybrid keyword lookup warning in vector store: {e}")

        # 2. Vector Semantic Similarity Search
        try:
            query_emb = [self.embedding_fn._embed_text(query)]
            res = collection.query(
                query_embeddings=query_emb,
                n_results=n_results + len(seen_ids),
                where=filter_meta
            )
            if res and "documents" in res and res["documents"]:
                docs = res["documents"][0]
                metas = res["metadatas"][0] if res["metadatas"] else [{}] * len(docs)
                dists = res["distances"][0] if res["distances"] else [0.0] * len(docs)
                ids = res["ids"][0] if res["ids"] else [""] * len(docs)
                for cid, doc, meta, dist in zip(ids, docs, metas, dists):
                    if cid in seen_ids:
                        continue
                    seen_ids.add(cid)
                    score = 1.0 - dist if dist is not None else 1.0
                    output.append({
                        "id": cid,
                        "content": doc,
                        "score": round(score, 4),
                        "metadata": meta
                    })
                    if len(output) >= n_results:
                        break
        except Exception as e:
            logger.warning(f"Vector semantic query error: {e}")

        return output[:n_results]

    def extract_snippet(self, text: str, query: str, max_chars: int = 1800) -> str:
        """
        Extracts a clean snippet centered around target entity/keywords from query.
        Prevents displaying irrelevant top-of-chunk lines when the matching record
        is located deeper inside a multi-record or tabular chunk.
        """
        if not text:
            return ""

        stopwords = {
            "siapa", "siapakah", "apa", "apakah", "dimana", "kapan", "bagaimana",
            "mengapa", "kenapa", "dari", "pada", "yang", "untuk", "dengan", "adalah",
            "yaitu", "profil", "profile", "data", "cari", "temukan", "lihat", "tolong",
            "cek", "info", "informasi", "tentang", "orang", "nama", "nik", "nohp",
            "alamat", "nomor", "semua", "bisa", "mohon", "atau", "dan", "serta"
        }
        clean_q = re.sub(r"[^\w\s]", " ", query)
        all_tokens = [w.strip() for w in clean_q.split() if len(w.strip()) >= 3]
        sig_tokens = [w for w in all_tokens if w.lower() not in stopwords]

        targets = []
        name_m = re.search(r"(?:atas\s+nama|dengan\s+nama|bernama|nama|subjek|orang)\s+([a-zA-Z\s]{4,})", query, re.IGNORECASE)
        if name_m:
            extracted = " ".join([w for w in name_m.group(1).split() if w.lower() not in stopwords])
            if len(extracted) >= 3:
                targets.append(extracted.upper())

        sig_sorted = sorted(sig_tokens, key=lambda x: len(x), reverse=True)
        for st in sig_sorted:
            if st.upper() not in targets:
                targets.append(st.upper())
        for at in all_tokens:
            if at.upper() not in targets:
                targets.append(at.upper())

        kw_pos = -1
        for t in targets:
            p = text.upper().find(t)
            if p != -1:
                kw_pos = p
                break

        if kw_pos != -1 and (len(text) > max_chars or kw_pos > 250):
            start_pos = max(0, kw_pos - 100)
            rec_break = text.rfind("\n", max(0, start_pos - 200), start_pos + 1)
            if rec_break != -1:
                start_pos = rec_break + 1
            end_pos = min(len(text), start_pos + max_chars)

            # Protect base64 photo boundaries if present
            photo_marker = text.rfind("FOTO:", start_pos, end_pos)
            if photo_marker != -1:
                next_sep = text.find(" | ", photo_marker)
                if next_sep != -1 and next_sep > end_pos:
                    end_pos = next_sep

            snippet = ("... " if start_pos > 0 else "") + text[start_pos:end_pos]
            if end_pos < len(text):
                snippet += "... [truncated]"
            return snippet
        else:
            return text[:max_chars]

vector_store = VectorStoreService()
