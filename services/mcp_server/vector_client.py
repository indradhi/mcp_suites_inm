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
import httpx

logger = logging.getLogger(__name__)


class FastFeatureEmbeddingFunction(EmbeddingFunction[Documents]):
    """
    High-performance, zero-dependency offline feature-hashing embedding function.
    Projects sub-tokens, char n-grams, and word bigrams into a normalized 384-dim vector.
    """
    def __init__(self, dim: int = 384):
        self.dim = dim

    def _tokenize(self, text: str) -> List[str]:
        raw_words = re.findall(r'\w+', text.lower())
        tokens = list(raw_words)
        for i in range(len(raw_words) - 1):
            tokens.append(f"{raw_words[i]}_{raw_words[i+1]}")
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

    def __call__(self, input: Documents) -> Embeddings:
        return [self._embed_text(doc) for doc in input]


class VectorClient:
    def __init__(self):
        self.host = os.getenv("CHROMADB_HOST") or os.getenv("CHROMA_HOST", "chromadb")
        self.port = int(os.getenv("CHROMADB_PORT") or os.getenv("CHROMA_PORT", "8000"))
        self.collection_name = os.getenv("CHROMADB_COLLECTION") or os.getenv("CHROMA_COLLECTION", "knowledge_base")
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
                logger.error(f"Failed to connect to ChromaDB: {e}")
                raise
        return self._client

    def get_collection(self):
        if self._collection is None:
            client = self.get_client()
            try:
                self._collection = client.get_or_create_collection(
                    name=self.collection_name,
                    embedding_function=self.embedding_fn,
                    metadata={"hnsw:space": "cosine"}
                )
            except Exception as e:
                logger.error(f"Failed to get/create ChromaDB collection {self.collection_name}: {e}")
                raise
        return self._collection

    async def search_knowledge(
        self,
        query_text: str,
        n_results: int = 5,
        filter_metadata: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Queries ChromaDB for similar knowledge chunks given query_text.
        """
        try:
            collection = self.get_collection()
            # If an embedding service is available or ChromaDB default embedding function is used:
            results = collection.query(
                query_texts=[query_text],
                n_results=n_results,
                where=filter_metadata if filter_metadata else None
            )

            hits = []
            if results and "documents" in results and results["documents"]:
                docs = results["documents"][0]
                metas = results["metadatas"][0] if "metadatas" in results and results["metadatas"] else [{}] * len(docs)
                dists = results["distances"][0] if "distances" in results and results["distances"] else [0.0] * len(docs)
                ids = results["ids"][0] if "ids" in results and results["ids"] else [""] * len(docs)

                for doc_id, doc, meta, dist in zip(ids, docs, metas, dists):
                    score = 1.0 - dist if dist is not None else 1.0
                    content_str = doc[:3000] + ("... [truncated]" if len(doc) > 3000 else "")
                    hits.append({
                        "id": doc_id,
                        "content": content_str,
                        "score": round(score, 4),
                        "source": meta.get("source_name", "unknown") if meta else "unknown",
                        "source_type": meta.get("source_type", "unknown") if meta else "unknown",
                        "metadata": meta
                    })
            return hits
        except Exception as e:
            logger.error(f"Error querying vector knowledge base: {e}")
            return []
