import os
import re
import math
import hashlib
import logging
from typing import List, Dict, Any, Optional
import numpy as np
import chromadb
from chromadb.config import Settings
from chromadb.api.types import Documents, EmbeddingFunction, Embeddings
from config import settings

logger = logging.getLogger(__name__)


class FastFeatureEmbeddingFunction(EmbeddingFunction[Documents]):
    """
    High-performance, zero-dependency offline feature-hashing embedding function.
    Projects sub-tokens, char n-grams, and word bigrams into a normalized 384-dim vector.
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


class VectorStoreService:
    def __init__(self):
        self.host = settings.CHROMADB_HOST
        self.port = settings.CHROMADB_PORT
        self.collection_name = settings.CHROMADB_COLLECTION
        self.embedding_fn = FastFeatureEmbeddingFunction(dim=384)
        self._client = None
        self._collection = None

    def get_client(self):
        if self._client is None:
            try:
                self._client = chromadb.HttpClient(
                    host=self.host,
                    port=self.port,
                    settings=Settings(allow_reset=False, anonymized_telemetry=False)
                )
            except Exception as e:
                logger.error(f"Failed connecting to ChromaDB: {e}")
                raise
        return self._client

    def get_collection(self):
        if self._collection is None:
            client = self.get_client()
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

    def add_chunks(
        self,
        texts: List[str],
        metadatas: List[Dict[str, Any]],
        ids: List[str]
    ):
        """
        Adds text chunks with metadata and unique IDs to ChromaDB.
        Explicitly pre-embeds documents using FastFeatureEmbeddingFunction
        to avoid embedding function conflicts and onnxruntime dependency.
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

    def delete_by_source(self, source_id: int):
        """
        Deletes all chunks associated with a specific knowledge source.
        """
        collection = self.get_collection()
        collection.delete(where={"source_id": source_id})

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
