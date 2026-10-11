import os
import re
import time
import base64
import hashlib
import logging
from datetime import datetime
from typing import Optional, Dict, Any, Tuple

logger = logging.getLogger(__name__)


class MediaCacheService:
    """
    Service for managing temporary image files converted from Base64 data.
    
    Key Features:
    1. Converts heavy Base64 strings into lightweight temporary image files on disk.
    2. Emits compact HTTP URLs (/api/chat/media/{filename}) instead of Base64 strings,
       saving thousands of LLM context tokens and preventing context rot across turns.
    3. Persists media metadata and raw payload in ChatMediaCache so files can be
       REGENERATED on-demand if deleted by disk cleanup.
    4. Automatically purges temporary files older than a specified TTL to free up disk space.
    """

    def __init__(self, temp_dir: Optional[str] = None, ttl_hours: int = 48):
        if temp_dir:
            self.temp_dir = temp_dir
        else:
            # Prefer mounted docker upload folder if present
            if os.path.exists("/app/uploads"):
                self.temp_dir = "/app/uploads/chat_temp/media"
            else:
                base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                self.temp_dir = os.path.join(base_dir, "uploads", "chat_temp", "media")

        self.ttl_hours = ttl_hours
        self._last_cleanup = 0.0
        try:
            os.makedirs(self.temp_dir, exist_ok=True)
        except Exception as e:
            logger.warning(f"Failed to create temp media directory '{self.temp_dir}': {e}")

    @staticmethod
    def detect_image_format(raw_bytes: bytes, b64_hint: str = "") -> Tuple[str, str]:
        """
        Detects image format and returns (extension, mime_type).
        """
        if raw_bytes.startswith(b"\xff\xd8\xff"):
            return "jpg", "image/jpeg"
        elif raw_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
            return "png", "image/png"
        elif raw_bytes.startswith(b"RIFF") and len(raw_bytes) >= 12 and raw_bytes[8:12] == b"WEBP":
            return "webp", "image/webp"
        elif raw_bytes.startswith((b"GIF87a", b"GIF89a")):
            return "gif", "image/gif"
        elif raw_bytes.startswith(b"BM"):
            return "bmp", "image/bmp"

        # Check hint if magic bytes were indeterminate
        if b64_hint.startswith("/9j/"):
            return "jpg", "image/jpeg"
        elif b64_hint.startswith("iVBORw0KGgo"):
            return "png", "image/png"
        elif b64_hint.startswith("UklGR"):
            return "webp", "image/webp"
        elif b64_hint.startswith("R0lGOD"):
            return "gif", "image/gif"

        return "jpg", "image/jpeg"

    @staticmethod
    def clean_base64_string(b64_str: str) -> Tuple[str, Optional[str]]:
        """
        Strips header, whitespace, and padding artifacts from a Base64 string.
        Returns (clean_base64, detected_mime_from_header).
        """
        if not b64_str:
            return "", None

        s = b64_str.strip()
        detected_mime = None
        if s.startswith("data:image/"):
            parts = s.split(";base64,")
            if len(parts) >= 2:
                header = parts[0]
                s = parts[1]
                m = re.search(r'data:(image/[a-zA-Z0-9+.-]+)', header)
                if m:
                    detected_mime = m.group(1).lower()

        # Remove whitespace, markdown artifacts, or truncation markers
        s = re.sub(r'[\s"\'`]', '', s)
        s = re.sub(r'(?:\.\.\.|\[truncated[^\]]*\]|\)+)$', '', s)

        # Pad properly
        rem = len(s) % 4
        if rem > 0:
            s += "=" * (4 - rem)

        return s, detected_mime

    def save_base64_as_file(
        self,
        b64_data: str,
        ref_nik: Optional[str] = None,
        ref_name: Optional[str] = None,
        source_name: Optional[str] = None,
        db: Optional[Any] = None
    ) -> Dict[str, Any]:
        """
        Decodes base64 data, saves it as an image file in the temporary media folder,
        and records it in ChatMediaCache for on-demand regeneration if evicted.
        
        Returns dict with filename, url, mime_type, file_path, size_bytes.
        """
        clean_b64, header_mime = self.clean_base64_string(b64_data)
        if not clean_b64 or len(clean_b64) < 40:
            return {
                "media_id": "",
                "filename": "",
                "url": "",
                "mime_type": "image/jpeg",
                "file_path": "",
                "size_bytes": 0
            }

        try:
            raw_bytes = base64.b64decode(clean_b64)
        except Exception as e:
            logger.warning(f"Error decoding base64 image: {e}")
            return {
                "media_id": "",
                "filename": "",
                "url": "",
                "mime_type": "image/jpeg",
                "file_path": "",
                "size_bytes": 0
            }

        ext, detected_mime = self.detect_image_format(raw_bytes, b64_hint=clean_b64)
        mime_type = header_mime or detected_mime

        # Calculate stable content hash
        hash_digest = hashlib.sha256(raw_bytes).hexdigest()
        hash_id = hash_digest[:16]

        if ref_nik:
            safe_nik = re.sub(r'[^0-9a-zA-Z_-]', '', str(ref_nik))
            filename = f"img_{safe_nik}_{hash_id}.{ext}"
        else:
            filename = f"img_{hash_id}.{ext}"

        file_path = os.path.join(self.temp_dir, filename)

        # Write to temporary file if not exists
        try:
            os.makedirs(self.temp_dir, exist_ok=True)
            if not os.path.exists(file_path) or os.path.getsize(file_path) == 0:
                with open(file_path, "wb") as f:
                    f.write(raw_bytes)
            else:
                # Touch to update last access time
                try:
                    os.utime(file_path, None)
                except Exception:
                    pass
        except Exception as fe:
            logger.warning(f"Could not write media file '{file_path}': {fe}")

        # Persist to database cache for persistent regeneration
        if db is not None:
            try:
                from models.chat_media_cache import ChatMediaCache
                existing = db.query(ChatMediaCache).filter(
                    (ChatMediaCache.filename == filename) | (ChatMediaCache.id == hash_id)
                ).first()

                if existing:
                    existing.last_accessed_at = datetime.utcnow()
                    if not existing.image_base64 and clean_b64:
                        existing.image_base64 = clean_b64
                    db.commit()
                else:
                    new_rec = ChatMediaCache(
                        id=hash_id,
                        filename=filename,
                        mime_type=mime_type,
                        ref_nik=str(ref_nik).strip() if ref_nik else None,
                        ref_name=str(ref_name).strip() if ref_name else None,
                        source_name=str(source_name).strip() if source_name else None,
                        image_base64=clean_b64,
                        file_size_bytes=len(raw_bytes),
                        created_at=datetime.utcnow(),
                        last_accessed_at=datetime.utcnow()
                    )
                    db.add(new_rec)
                    db.commit()
            except Exception as dbe:
                logger.warning(f"Could not persist ChatMediaCache entry: {dbe}")
                try:
                    db.rollback()
                except Exception:
                    pass

        # Trigger opportunistic cleanup if it hasn't run in the last hour
        now = time.time()
        if now - self._last_cleanup > 3600:
            self._last_cleanup = now
            self.cleanup_expired_files(self.ttl_hours)

        return {
            "media_id": hash_id,
            "filename": filename,
            "url": f"/api/chat/media/{filename}",
            "mime_type": mime_type,
            "file_path": file_path,
            "size_bytes": len(raw_bytes)
        }

    def get_or_regenerate_file(self, filename_or_id: str, db: Optional[Any] = None) -> Optional[Tuple[str, str]]:
        """
        Retrieves the image file path and mime type for serving.
        If the physical file on disk was evicted/deleted by cleanup, this method
        looks up ChatMediaCache and REGENERATES the file on-the-fly.
        
        Returns: (file_path, mime_type) or None if not found.
        """
        if not filename_or_id:
            return None

        # Clean filename against path traversal
        clean_name = os.path.basename(filename_or_id.replace("\\", "/"))
        if clean_name.startswith("/api/chat/media/"):
            clean_name = clean_name.replace("/api/chat/media/", "")

        file_path = os.path.join(self.temp_dir, clean_name)

        # 1. Physical file exists on disk
        if os.path.exists(file_path) and os.path.getsize(file_path) > 0:
            try:
                os.utime(file_path, None)
            except Exception:
                pass
            ext = clean_name.rsplit(".", 1)[-1].lower() if "." in clean_name else "jpg"
            mime_map = {
                "jpg": "image/jpeg",
                "jpeg": "image/jpeg",
                "png": "image/png",
                "webp": "image/webp",
                "gif": "image/gif",
                "bmp": "image/bmp"
            }
            return file_path, mime_map.get(ext, "image/jpeg")

        # 2. File missing from disk -> Regenerate on-demand from database ChatMediaCache
        close_db_on_finish = False
        if db is None:
            try:
                from database import SessionLocal
                db = SessionLocal()
                close_db_on_finish = True
            except Exception as e:
                logger.warning(f"Could not open DB session to regenerate media: {e}")
                return None

        try:
            from models.chat_media_cache import ChatMediaCache
            # Search by filename or hash ID
            rec = db.query(ChatMediaCache).filter(
                (ChatMediaCache.filename == clean_name) |
                (ChatMediaCache.id == clean_name.split(".")[0].split("_")[-1])
            ).first()

            if rec and rec.image_base64:
                try:
                    raw_bytes = base64.b64decode(rec.image_base64)
                    os.makedirs(self.temp_dir, exist_ok=True)
                    with open(file_path, "wb") as f:
                        f.write(raw_bytes)
                    
                    rec.last_accessed_at = datetime.utcnow()
                    db.commit()
                    logger.info(f"Regenerated temporary media file '{clean_name}' on-demand from cache database.")
                    return file_path, rec.mime_type or "image/jpeg"
                except Exception as rge:
                    logger.warning(f"Failed to regenerate media file '{clean_name}': {rge}")
        except Exception as qe:
            logger.warning(f"Error querying ChatMediaCache for '{clean_name}': {qe}")
        finally:
            if close_db_on_finish and db is not None:
                db.close()

        return None

    def cleanup_expired_files(self, max_age_hours: Optional[int] = None) -> int:
        """
        Deletes temporary media files that have not been accessed/modified within max_age_hours.
        Note: Metadata and Base64 in ChatMediaCache are retained so files can still be
        regenerated seamlessly if an old conversation is reopened.
        """
        max_age = max_age_hours or self.ttl_hours
        max_age_seconds = max_age * 3600
        now = time.time()
        deleted_count = 0

        if not os.path.exists(self.temp_dir):
            return 0

        try:
            for fname in os.listdir(self.temp_dir):
                fpath = os.path.join(self.temp_dir, fname)
                if not os.path.isfile(fpath):
                    continue
                try:
                    mtime = os.path.getmtime(fpath)
                    if (now - mtime) > max_age_seconds:
                        os.remove(fpath)
                        deleted_count += 1
                except Exception as fe:
                    logger.debug(f"Could not delete temp file '{fpath}': {fe}")
            
            if deleted_count > 0:
                logger.info(f"MediaCache cleanup: Removed {deleted_count} temporary media files older than {max_age} hours.")
        except Exception as e:
            logger.warning(f"Error during media cleanup: {e}")

        return deleted_count

    def sanitize_text_and_convert_images(
        self,
        text: str,
        default_nik: Optional[str] = None,
        default_name: Optional[str] = None,
        db: Optional[Any] = None
    ) -> str:
        """
        Scans response text or conversation history for raw Base64 image tags or data URIs,
        converts them into cached image files, and replaces them with compact HTTP URLs.
        
        Saves massive token space and prevents context rot!
        """
        if not text or not isinstance(text, str):
            return text

        # 1. Replace Markdown images containing Base64: ![alt](data:image/...;base64,...) or ![alt](/9j/...)
        md_pattern = re.compile(
            r'!\[([^\]]*)\]\((data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]+|/9j/[A-Za-z0-9+/=]{60,}|iVBORw0KGgo[A-Za-z0-9+/=]{60,})\)',
            flags=re.IGNORECASE
        )

        def _sub_md_img(m):
            label = m.group(1).strip()
            raw_b64 = m.group(2).strip()
            info = self.save_base64_as_file(raw_b64, ref_nik=default_nik, ref_name=default_name, db=db)
            if info.get("url"):
                return f"![{label or 'Foto'}]({info['url']})"
            return m.group(0)

        cleaned_text = md_pattern.sub(_sub_md_img, text)

        # 2. Replace HTML <img> tags containing Base64
        html_pattern = re.compile(
            r'<img\s+([^>]*?)src=["\'](data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]+|/9j/[A-Za-z0-9+/=]{60,})["\']([^>]*)>',
            flags=re.IGNORECASE
        )

        def _sub_html_img(m):
            attrs_pre = m.group(1)
            raw_b64 = m.group(2).strip()
            attrs_post = m.group(3)
            info = self.save_base64_as_file(raw_b64, ref_nik=default_nik, ref_name=default_name, db=db)
            if info.get("url"):
                return f'<img {attrs_pre}src="{info["url"]}"{attrs_post}>'
            return m.group(0)

        cleaned_text = html_pattern.sub(_sub_html_img, cleaned_text)

        # 3. Replace loose standalone data:image URIs or long raw base64 lines dumped by LLM
        standalone_data_uri = re.compile(r'data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]{80,}', flags=re.IGNORECASE)
        def _sub_data_uri(m):
            raw_b64 = m.group(0).strip()
            info = self.save_base64_as_file(raw_b64, ref_nik=default_nik, ref_name=default_name, db=db)
            return info.get("url") or raw_b64

        cleaned_text = standalone_data_uri.sub(_sub_data_uri, cleaned_text)

        return cleaned_text


media_cache_service = MediaCacheService()
