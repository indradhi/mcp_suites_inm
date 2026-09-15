import os
import io
import uuid
import base64
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple

import numpy as np
from PIL import Image, ImageOps
import chromadb
from chromadb.config import Settings
from config import settings

logger = logging.getLogger(__name__)

# ── InsightFace / ArcFace Integration ─────────────────────────────────────────
# InsightFace provides a 512-dimensional ArcFace embedding with ~99% recognition
# accuracy across varying angles, lighting, and compression. We load it once at
# module startup and fall back gracefully to the legacy LBP algorithm if it
# cannot be loaded (e.g. Docker rebuild not yet done).

_insight_app = None
_insight_available = False

def _load_insightface():
    """Lazy-load InsightFace ArcFace model. Downloads model on first run (~100MB)."""
    global _insight_app, _insight_available
    if _insight_available:
        return True
    if _insight_app is not None:
        return False  # Already tried and failed
    try:
        import insightface
        from insightface.app import FaceAnalysis
        model_root = os.environ.get("INSIGHTFACE_MODEL_ROOT", "/app/insightface_models")
        os.makedirs(model_root, exist_ok=True)
        app = FaceAnalysis(
            name="buffalo_sc",   # small & fast: det + arcface recognition
            root=model_root,
            providers=["CPUExecutionProvider"]
        )
        app.prepare(ctx_id=-1, det_size=(320, 320))
        _insight_app = app
        _insight_available = True
        logger.info("InsightFace ArcFace model loaded successfully (buffalo_sc).")
        return True
    except Exception as e:
        logger.warning(f"InsightFace not available, falling back to LBP algorithm: {e}")
        _insight_app = object()  # sentinel so we don't retry forever
        return False


class FaceService:
    def __init__(self):
        self.host = settings.CHROMADB_HOST
        self.port = settings.CHROMADB_PORT
        self.collection_name = "face_recognition_records"
        self._client = None
        self._collection = None
        # Try loading InsightFace at startup (non-blocking)
        try:
            _load_insightface()
        except Exception:
            pass

    def get_chroma_client(self):
        if self._client is None:
            try:
                self._client = chromadb.HttpClient(
                    host=self.host,
                    port=self.port,
                    settings=Settings(allow_reset=False, anonymized_telemetry=False)
                )
            except Exception as e:
                logger.error(f"Failed connecting to ChromaDB for face service: {e}")
                raise
        return self._client

    def get_collection(self):
        if self._collection is None:
            client = self.get_chroma_client()
            # Use cosine distance for InsightFace 512-dim embeddings
            self._collection = client.get_or_create_collection(
                name=self.collection_name,
                metadata={"hnsw:space": "cosine"}
            )
        return self._collection

    # ── Image Loading & Decoding ──────────────────────────────────────────

    def decode_image(self, image_input: str) -> Image.Image:
        """
        Loads and decodes an image from either:
        1. A Base64 string (with or without 'data:image/...;base64,' prefix)
        2. A local file path on disk
        """
        if not image_input or not isinstance(image_input, str):
            raise ValueError("Invalid image input: expected a file path or base64 string")

        clean_input = image_input.strip()

        # Check if Base64
        if clean_input.startswith("data:image/") or ";base64," in clean_input or len(clean_input) > 200:
            try:
                if ";base64," in clean_input:
                    clean_input = clean_input.split(";base64,")[1]
                elif clean_input.startswith("data:"):
                    clean_input = clean_input.split(",", 1)[1]

                # Strip whitespace/newlines
                clean_input = clean_input.replace("\n", "").replace("\r", "").replace(" ", "")
                img_bytes = base64.b64decode(clean_input)
                img = Image.open(io.BytesIO(img_bytes))
                return ImageOps.exif_transpose(img).convert("RGB")
            except Exception as e:
                if not os.path.exists(image_input):
                    raise ValueError(f"Failed to decode base64 image: {str(e)}")

        if os.path.exists(image_input):
            try:
                img = Image.open(image_input)
                return ImageOps.exif_transpose(img).convert("RGB")
            except Exception as e:
                raise ValueError(f"Failed to open image file at '{image_input}': {str(e)}")

        raise ValueError("Image input not found as file and could not be decoded as base64.")

    def image_to_base64_thumbnail(self, img: Image.Image, size: Tuple[int, int] = (120, 120)) -> str:
        """Generates a compact Base64 JPEG thumbnail string."""
        thumb = img.copy()
        thumb.thumbnail(size, Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        thumb.save(buf, format="JPEG", quality=85)
        b64_str = base64.b64encode(buf.getvalue()).decode("utf-8")
        return f"data:image/jpeg;base64,{b64_str}"

    # ── InsightFace (ArcFace) Embedding ───────────────────────────────────

    def _extract_insightface_embedding(self, pil_img: Image.Image) -> Optional[Tuple[List[float], Dict, Image.Image]]:
        """
        Uses InsightFace ArcFace to:
        1. Detect face(s) in the image
        2. Extract 512-dim normalized embedding
        Returns (embedding, detection_info, face_crop_pil) or None if no face found.
        """
        if not _insight_available or not _load_insightface():
            return None

        try:
            import cv2
            arr = np.array(pil_img)
            bgr = arr[:, :, ::-1].copy()  # PIL RGB → OpenCV BGR

            faces = _insight_app.get(bgr)
            if not faces:
                return None

            # Pick the largest (most prominent) face
            best_face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))

            embedding = best_face.normed_embedding.tolist()  # 512-dim, already normalized
            bbox = best_face.bbox.astype(int).tolist()
            det_score = float(best_face.det_score)

            # Crop face from PIL image for thumbnail
            x1, y1, x2, y2 = max(0, bbox[0]), max(0, bbox[1]), bbox[2], bbox[3]
            face_crop = pil_img.crop((x1, y1, x2, y2)).resize((128, 128), Image.Resampling.LANCZOS)

            det_info = {
                "face_detected": True,
                "bounding_box": {"x": x1, "y": y1, "width": x2 - x1, "height": y2 - y1},
                "confidence_detection": round(det_score, 3),
                "backend": "insightface_arcface"
            }
            return embedding, det_info, face_crop
        except Exception as e:
            logger.warning(f"InsightFace embedding failed: {e}")
            return None

    # ── Legacy LBP Fallback ────────────────────────────────────────────────

    def _detect_and_crop_face_lbp(self, img: Image.Image) -> Tuple[Image.Image, Dict[str, Any]]:
        """Legacy: Detects face using YCbCr skin segmentation + fallback center crop."""
        w, h = img.size
        arr = np.array(img, dtype=np.float32)

        R = arr[:, :, 0]; G = arr[:, :, 1]; B = arr[:, :, 2]
        Y  = 0.299 * R + 0.587 * G + 0.114 * B
        Cb = 128 - 0.168736 * R - 0.331264 * G + 0.5 * B
        Cr = 128 + 0.5 * R - 0.418688 * G - 0.081312 * B

        # Widened skin tone range (covers more skin tones)
        skin_mask = (Cb >= 70) & (Cb <= 145) & (Cr >= 125) & (Cr <= 190) & (Y >= 25) & (Y <= 250)

        skin_pixels = np.sum(skin_mask)
        total_pixels = w * h

        if 0.02 < (skin_pixels / total_pixels) < 0.92:
            y_indices, x_indices = np.where(skin_mask)
            if len(y_indices) > 150:
                y_min = int(np.percentile(y_indices, 5))
                y_max = int(np.percentile(y_indices, 95))
                x_min = int(np.percentile(x_indices, 5))
                x_max = int(np.percentile(x_indices, 95))
                fw = x_max - x_min; fh = y_max - y_min
                aspect = fw / max(fh, 1)
                if 0.4 <= aspect <= 2.0 and fw >= 30 and fh >= 30:
                    pad_x = int(fw * 0.18); pad_y = int(fh * 0.18)
                    cx1 = max(0, x_min - pad_x); cy1 = max(0, y_min - pad_y)
                    cx2 = min(w, x_max + pad_x); cy2 = min(h, y_max + pad_y)
                    cropped = img.crop((cx1, cy1, cx2, cy2))
                    return cropped.resize((128, 128), Image.Resampling.LANCZOS), {
                        "face_detected": True,
                        "bounding_box": {"x": cx1, "y": cy1, "width": cx2 - cx1, "height": cy2 - cy1},
                        "confidence_detection": round(float(skin_pixels / total_pixels), 3),
                        "backend": "lbp_skin"
                    }

        # Fallback: center crop
        min_dim = min(w, h)
        cx, cy = w // 2, h // 2
        cropped = img.crop((cx - min_dim // 2, cy - min_dim // 2, cx + min_dim // 2, cy + min_dim // 2))
        return cropped.resize((128, 128), Image.Resampling.LANCZOS), {
            "face_detected": False,
            "bounding_box": {"x": 0, "y": 0, "width": w, "height": h},
            "confidence_detection": 0.4,
            "backend": "lbp_center_crop"
        }

    def _extract_lbp_embedding(self, face_img_128: Image.Image) -> List[float]:
        """Legacy: 128-dim LBP + gradient embedding."""
        # Apply CLAHE-equivalent histogram equalization for lighting normalization
        gray_pil = face_img_128.convert("L")
        gray = np.array(gray_pil, dtype=np.float32)

        features = []
        for row in range(4):
            for col in range(4):
                cell = gray[row * 32:(row + 1) * 32, col * 32:(col + 1) * 32]
                # Histogram equalize each cell
                cell_eq = cell - cell.min()
                rng = cell_eq.max()
                if rng > 0:
                    cell_eq = cell_eq / rng * 255.0
                cell = cell_eq

                center = cell[1:-1, 1:-1]
                b0 = (cell[:-2, :-2] >= center).astype(np.int32)
                b1 = (cell[:-2, 1:-1] >= center).astype(np.int32)
                b2 = (cell[:-2, 2:] >= center).astype(np.int32)
                b3 = (cell[1:-1, 2:] >= center).astype(np.int32)
                b4 = (cell[2:, 2:] >= center).astype(np.int32)
                b5 = (cell[2:, 1:-1] >= center).astype(np.int32)
                b6 = (cell[2:, :-2] >= center).astype(np.int32)
                b7 = (cell[1:-1, :-2] >= center).astype(np.int32)
                lbp = b0 + b1*2 + b2*4 + b3*8 + b4*16 + b5*32 + b6*64 + b7*128
                lbp_hist, _ = np.histogram(lbp, bins=[0, 64, 128, 192, 256])
                lbp_norm = lbp_hist.astype(np.float32) / (lbp_hist.sum() + 1e-7)
                features.extend(lbp_norm.tolist())

                gx = cell[1:-1, 2:] - cell[1:-1, :-2]
                gy = cell[2:, 1:-1] - cell[:-2, 1:-1]
                mag = np.sqrt(gx**2 + gy**2)
                angle = (np.arctan2(gy, gx) + np.pi) % np.pi
                mask_h = angle < (np.pi / 2)
                bin_horiz = float(np.mean(mag[mask_h])) if np.any(mask_h) else 0.0
                mask_v = ~mask_h
                bin_vert = float(np.mean(mag[mask_v])) if np.any(mask_v) else 0.0
                features.extend([bin_horiz, bin_vert])

                mean_val = float(np.mean(cell)) / 255.0
                std_val = float(np.std(cell)) / 128.0
                features.extend([mean_val, std_val])

        vec = np.array(features, dtype=np.float32)
        vec = np.nan_to_num(vec, nan=0.0, posinf=0.0, neginf=0.0)
        norm = np.linalg.norm(vec)
        return (vec / norm if norm > 1e-9 else np.zeros_like(vec)).tolist()

    # ── Unified Embedding Extraction ──────────────────────────────────────

    def extract_embedding(self, pil_img: Image.Image) -> Tuple[List[float], Dict[str, Any], Image.Image]:
        """
        Primary embedding extraction. Uses InsightFace ArcFace if available,
        falls back to LBP. Returns (embedding, detection_info, face_crop_pil).
        """
        # Try InsightFace first
        result = self._extract_insightface_embedding(pil_img)
        if result is not None:
            return result

        # Fallback to LBP
        face_crop, det_info = self._detect_and_crop_face_lbp(pil_img)
        embedding = self._extract_lbp_embedding(face_crop)
        return embedding, det_info, face_crop

    # Kept for backwards compatibility
    def detect_and_crop_face(self, img: Image.Image) -> Tuple[Image.Image, Dict[str, Any]]:
        face_crop, det_info = self._detect_and_crop_face_lbp(img)
        return face_crop, det_info

    def extract_face_embedding(self, face_img_128: Image.Image) -> List[float]:
        return self._extract_lbp_embedding(face_img_128)

    # ── Face Recognition Operations ───────────────────────────────────────

    def recognize_face(
        self,
        image_input: str,
        min_confidence: float = 0.45,
        max_candidates: int = 3
    ) -> Dict[str, Any]:
        """
        Recognizes and identifies a face from an image (file path or Base64).
        Uses InsightFace ArcFace (512-dim) when available, otherwise LBP (128-dim).
        Threshold: 0.45 cosine similarity (InsightFace); 0.38 for LBP fallback.
        """
        try:
            img = self.decode_image(image_input)
            embedding, det_info, face_crop = self.extract_embedding(img)
            input_thumb = self.image_to_base64_thumbnail(face_crop, size=(120, 120))

            # Adjust threshold based on backend
            backend = det_info.get("backend", "lbp")
            effective_threshold = min_confidence if "arcface" in backend else max(0.38, min_confidence - 0.10)

            collection = self.get_collection()
            count = collection.count()

            if count == 0:
                return {
                    "matched": False,
                    "message": "No enrolled faces in knowledge base yet.",
                    "detection": det_info,
                    "input_face_thumbnail": input_thumb,
                    "candidates": [],
                    "backend": backend
                }

            res = collection.query(
                query_embeddings=[embedding],
                n_results=min(max_candidates, count)
            )

            candidates = []
            if res and "ids" in res and res["ids"] and len(res["ids"][0]) > 0:
                ids = res["ids"][0]
                metas = res["metadatas"][0] if "metadatas" in res else [{}] * len(ids)
                distances = res["distances"][0] if "distances" in res else [0.5] * len(ids)

                for fid, meta, dist in zip(ids, metas, distances):
                    similarity = max(0.0, min(1.0, 1.0 - float(dist)))
                    candidates.append({
                        "face_id": fid,
                        "person_name": meta.get("person_name", "Unknown"),
                        "person_id": meta.get("person_id", ""),
                        "department": meta.get("department", ""),
                        "notes": meta.get("notes", ""),
                        "similarity_score": round(similarity, 4),
                        "confidence_percent": round(similarity * 100, 1),
                        "matched_thumbnail": meta.get("thumbnail_base64", "")
                    })

            top_match = candidates[0] if candidates else None
            is_matched = bool(top_match and top_match["similarity_score"] >= effective_threshold)

            return {
                "matched": is_matched,
                "person_name": top_match["person_name"] if is_matched else None,
                "identified_person": top_match["person_name"] if is_matched else None,
                "face_id": top_match["face_id"] if is_matched else None,
                "confidence_score": top_match["similarity_score"] if top_match else 0.0,
                "confidence_percent": top_match["confidence_percent"] if top_match else 0.0,
                "person_id": top_match["person_id"] if is_matched else None,
                "department": top_match.get("department") if is_matched else None,
                "input_face_thumbnail": input_thumb,
                "matched_face_thumbnail": top_match["matched_thumbnail"] if is_matched else None,
                "detection": det_info,
                "candidates": candidates,
                "backend": backend,
                "threshold_used": effective_threshold
            }
        except Exception as e:
            logger.error(f"Error in recognize_face: {e}", exc_info=True)
            return {
                "matched": False,
                "error": str(e),
                "candidates": []
            }

    def compare_faces(
        self,
        image_a: str,
        image_b: str,
        threshold: float = 0.50
    ) -> Dict[str, Any]:
        """Directly compares two face images and computes similarity score."""
        try:
            img_a = self.decode_image(image_a)
            img_b = self.decode_image(image_b)

            emb_a, det_a, crop_a = self.extract_embedding(img_a)
            emb_b, det_b, crop_b = self.extract_embedding(img_b)

            vec_a = np.array(emb_a, dtype=np.float32)
            vec_b = np.array(emb_b, dtype=np.float32)
            similarity = float(np.dot(vec_a, vec_b))
            similarity = max(0.0, min(1.0, similarity))

            is_same_person = similarity >= threshold
            rating = "high" if similarity >= 0.75 else ("moderate" if similarity >= threshold else "low")

            return {
                "is_same_person": is_same_person,
                "similarity_score": round(similarity, 4),
                "similarity_percent": round(similarity * 100, 1),
                "confidence_rating": rating,
                "threshold_applied": threshold,
                "face_a_thumbnail": self.image_to_base64_thumbnail(crop_a, size=(100, 100)),
                "face_b_thumbnail": self.image_to_base64_thumbnail(crop_b, size=(100, 100)),
                "detection_a": det_a,
                "detection_b": det_b
            }
        except Exception as e:
            logger.error(f"Error in compare_faces: {e}", exc_info=True)
            return {"is_same_person": False, "error": str(e)}

    def enroll_face(
        self,
        image_input: str,
        person_name: str,
        person_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Enrolls a new face into the ChromaDB face recognition collection."""
        if not person_name or not person_name.strip():
            raise ValueError("person_name is required for enrollment")

        img = self.decode_image(image_input)
        embedding, det_info, face_crop = self.extract_embedding(img)
        thumbnail = self.image_to_base64_thumbnail(face_crop, size=(120, 120))

        face_id = f"face_{uuid.uuid4().hex[:12]}"
        meta = {
            "person_name": person_name.strip(),
            "person_id": (person_id or "").strip(),
            "department": (metadata or {}).get("department", ""),
            "notes": (metadata or {}).get("notes", ""),
            "thumbnail_base64": thumbnail,
            "enrolled_at": datetime.utcnow().isoformat(),
            "embedding_backend": det_info.get("backend", "unknown"),
            "embedding_dim": len(embedding)
        }

        for k, v in (metadata or {}).items():
            if k not in meta and isinstance(v, (str, int, float, bool)):
                meta[k] = v

        doc_text = f"Face identity profile for {person_name} (ID: {person_id or 'N/A'})"
        collection = self.get_collection()
        collection.upsert(
            ids=[face_id],
            embeddings=[embedding],
            documents=[doc_text],
            metadatas=[meta]
        )

        return {
            "success": True,
            "face_id": face_id,
            "person_name": person_name.strip(),
            "person_id": person_id,
            "thumbnail_base64": thumbnail,
            "detection": det_info,
            "embedding_dim": len(embedding),
            "backend_used": det_info.get("backend", "unknown"),
            "message": f"Successfully enrolled face for '{person_name}' using {det_info.get('backend', 'unknown')} backend"
        }

    def list_enrolled_faces(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Retrieves all currently enrolled face profiles."""
        collection = self.get_collection()
        count = collection.count()
        if count == 0:
            return []

        res = collection.get(limit=limit)
        faces = []
        if res and "ids" in res:
            for fid, meta in zip(res["ids"], res.get("metadatas", [])):
                faces.append({
                    "face_id": fid,
                    "person_name": meta.get("person_name", "Unknown"),
                    "person_id": meta.get("person_id", ""),
                    "department": meta.get("department", ""),
                    "notes": meta.get("notes", ""),
                    "thumbnail_base64": meta.get("thumbnail_base64", ""),
                    "enrolled_at": meta.get("enrolled_at", ""),
                    "embedding_backend": meta.get("embedding_backend", "unknown"),
                    "embedding_dim": meta.get("embedding_dim", "unknown")
                })
        return faces

    def delete_enrolled_face(self, face_id: str) -> bool:
        """Deletes an enrolled face from the collection."""
        collection = self.get_collection()
        collection.delete(ids=[face_id])
        return True


face_service = FaceService()
