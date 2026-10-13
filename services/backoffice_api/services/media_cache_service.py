import os
import re
import time
import base64
import hashlib
import logging
from datetime import datetime
from typing import Optional, Dict, Any, Tuple, List

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

        # In base64, a single dangling character (len % 4 == 1) cannot form a byte
        # (6 bits is less than 1 byte). Trim it off before padding so b64decode never errors.
        if len(s) % 4 == 1:
            s = s[:-1]

        # Pad properly
        rem = len(s) % 4
        if rem > 0:
            s += "=" * (4 - rem)

        return s, detected_mime

    @staticmethod
    def get_default_base_url(request: Optional[Any] = None) -> str:
        """
        Determines the public/base URL for media files so images can be loaded
        directly by external clients (OpenWebUI, Claude, external chat, API users).
        """
        # 1. Environment variable override
        pub = os.getenv("PUBLIC_MEDIA_URL") or os.getenv("PUBLIC_BASE_URL")
        if pub:
            return pub.rstrip("/")

        # 2. Extract from FastAPI / Starlette request if available
        if request is not None:
            try:
                proto = request.headers.get("x-forwarded-proto") or getattr(getattr(request, "url", None), "scheme", "http")
                host = request.headers.get("x-forwarded-host") or request.headers.get("host")
                if host:
                    return f"{proto}://{host}".rstrip("/")
                if hasattr(request, "base_url"):
                    return str(request.base_url).rstrip("/")
            except Exception:
                pass

        # 3. Fallback to BACKOFFICE_URL or local default
        backoffice_url = os.getenv("BACKOFFICE_URL")
        if backoffice_url:
            return backoffice_url.rstrip("/")

        port = os.getenv("BACKOFFICE_API_PORT", "8002")
        return f"http://localhost:{port}"

    def save_base64_as_file(
        self,
        b64_data: str,
        ref_nik: Optional[str] = None,
        ref_name: Optional[str] = None,
        source_name: Optional[str] = None,
        base_url: Optional[str] = None,
        db: Optional[Any] = None
    ) -> Dict[str, Any]:
        """
        Decodes base64 data, saves it as an image file in the temporary media folder,
        and records it in ChatMediaCache for on-demand regeneration if evicted.
        
        Returns dict with filename, url, full_url, mime_type, file_path, size_bytes.
        """
        root_base = (base_url or self.get_default_base_url()).rstrip("/")

        clean_b64, header_mime = self.clean_base64_string(b64_data)
        if not clean_b64 or len(clean_b64) < 40:
            return {
                "media_id": "",
                "filename": "",
                "url": "",
                "full_url": "",
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
                "full_url": "",
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

        rel_url = f"/api/chat/media/{filename}"
        full_url = f"{root_base}{rel_url}" if root_base else rel_url

        return {
            "media_id": hash_id,
            "filename": filename,
            "url": rel_url,
            "full_url": full_url,
            "mime_type": mime_type,
            "file_path": file_path,
            "size_bytes": len(raw_bytes)
        }

    def convert_data_images(
        self,
        data: Any,
        base_url: Optional[str] = None,
        ref_nik: Optional[str] = None,
        ref_name: Optional[str] = None,
        source_name: Optional[str] = None,
        prefer_full_url: bool = True,
        db: Optional[Any] = None
    ) -> Tuple[Any, List[Dict[str, Any]]]:
        """
        Recursively scans any data structure (dict, list, or primitive) for base64 images.
        Converts each base64 image into a cached media file on disk.
        Replaces raw base64 data with direct converted image URLs (and companion _url / _markdown fields).
        
        Returns: (sanitized_data, converted_media_records)
        """
        converted_media: List[Dict[str, Any]] = []
        image_key_names = {'foto', 'photo', 'image', 'gambar', 'picture', 'avatar', 'img', 'ktp', 'thumbnail'}

        def _is_image_key(k: str) -> bool:
            kl = str(k).lower()
            return any(ik in kl for ik in image_key_names)

        def _is_b64(val: Any) -> bool:
            if not isinstance(val, str) or len(val) < 50:
                return False
            vs = val.strip()
            if vs.startswith("data:image/"):
                return True
            clean_s = re.sub(r'[\s"\'`]', '', vs)
            return (
                clean_s.startswith(('/9j/', 'iVBORw0KGgo', 'R0lGOD', 'UklGR', 'Qk')) or
                (len(clean_s) >= 100 and bool(re.match(r'^[A-Za-z0-9+/=]+$', clean_s)))
            )

        def _walk(node: Any, parent_nik: Optional[str] = None, parent_name: Optional[str] = None) -> Any:
            if isinstance(node, dict):
                rec_nik = str(node.get("NIK") or node.get("nik") or node.get("no_ktp") or node.get("id") or parent_nik or "").strip() or None
                rec_name = str(node.get("NAMA_LGKP") or node.get("nama") or node.get("name") or node.get("full_name") or parent_name or "").strip() or None

                new_dict = {}
                for k, v in node.items():
                    if _is_image_key(k) and _is_b64(v):
                        info = self.save_base64_as_file(
                            v,
                            base_url=base_url,
                            ref_nik=rec_nik,
                            ref_name=rec_name,
                            source_name=source_name,
                            db=db
                        )
                        if info.get("filename"):
                            converted_media.append(info)
                            chosen_url = info.get("full_url") if prefer_full_url else info.get("url")
                            new_dict[k] = chosen_url
                            new_dict[f"{k}_url"] = chosen_url
                            label = f"Foto - {rec_name}" if rec_name else f"Foto {k.title()}"
                            new_dict[f"{k}_markdown"] = f"![{label}]({chosen_url})"
                        else:
                            new_dict[k] = v
                    elif isinstance(v, (dict, list)):
                        new_dict[k] = _walk(v, parent_nik=rec_nik, parent_name=rec_name)
                    elif isinstance(v, str) and len(v) > 100 and _is_b64(v):
                        info = self.save_base64_as_file(
                            v,
                            base_url=base_url,
                            ref_nik=rec_nik,
                            ref_name=rec_name,
                            source_name=source_name,
                            db=db
                        )
                        if info.get("filename"):
                            converted_media.append(info)
                            chosen_url = info.get("full_url") if prefer_full_url else info.get("url")
                            new_dict[k] = chosen_url
                            new_dict[f"{k}_url"] = chosen_url
                        else:
                            new_dict[k] = v
                    else:
                        new_dict[k] = v
                return new_dict

            elif isinstance(node, list):
                return [_walk(item, parent_nik=parent_nik, parent_name=parent_name) for item in node]

            elif isinstance(node, str) and _is_b64(node):
                info = self.save_base64_as_file(
                    node,
                    base_url=base_url,
                    ref_nik=parent_nik,
                    ref_name=parent_name,
                    source_name=source_name,
                    db=db
                )
                if info.get("filename"):
                    converted_media.append(info)
                    return info.get("full_url") if prefer_full_url else info.get("url")
                return node

            return node

        sanitized_data = _walk(data, parent_nik=ref_nik, parent_name=ref_name)
        return sanitized_data, converted_media

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
        base_url: Optional[str] = None,
        prefer_full_url: bool = False,
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
            info = self.save_base64_as_file(raw_b64, base_url=base_url, ref_nik=default_nik, ref_name=default_name, db=db)
            chosen_url = info.get("full_url") if prefer_full_url else info.get("url")
            if chosen_url:
                return f"![{label or 'Foto'}]({chosen_url})"
            # If base64 decoding failed or is invalid, do not leave broken /9j/... URL that causes 404 in UI
            return ""

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
            info = self.save_base64_as_file(raw_b64, base_url=base_url, ref_nik=default_nik, ref_name=default_name, db=db)
            chosen_url = info.get("full_url") if prefer_full_url else info.get("url")
            if chosen_url:
                return f'<img {attrs_pre}src="{chosen_url}"{attrs_post}>'
            return ""

        cleaned_text = html_pattern.sub(_sub_html_img, cleaned_text)

        # 3. Replace loose standalone data:image URIs or long raw base64 lines dumped by LLM
        standalone_data_uri = re.compile(r'data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]{80,}', flags=re.IGNORECASE)
        def _sub_data_uri(m):
            raw_b64 = m.group(0).strip()
            info = self.save_base64_as_file(raw_b64, base_url=base_url, ref_nik=default_nik, ref_name=default_name, db=db)
            chosen_url = info.get("full_url") if prefer_full_url else info.get("url")
            return chosen_url or ""

        cleaned_text = standalone_data_uri.sub(_sub_data_uri, cleaned_text)

        # 4. Replace loose raw /9j/... JPEG strings dumped into plain text outside markdown
        standalone_raw_b64 = re.compile(r'(?:^|\n|\s|\()(?P<b64>/9j/[A-Za-z0-9+/=]{80,}|iVBORw0KGgo[A-Za-z0-9+/=]{80,})(?:\)|\s|\n|$)', flags=re.MULTILINE)
        def _sub_raw_b64(m):
            b64_val = m.group('b64').strip()
            info = self.save_base64_as_file(b64_val, base_url=base_url, ref_nik=default_nik, ref_name=default_name, db=db)
            chosen_url = info.get("full_url") if prefer_full_url else info.get("url")
            if chosen_url:
                return f"\n\n![Foto Profil]({chosen_url})\n\n"
            return ""

        cleaned_text = standalone_raw_b64.sub(_sub_raw_b64, cleaned_text)

        if prefer_full_url and base_url:
            cleaned_text = self.expand_media_urls_to_absolute(cleaned_text, base_url)

        return cleaned_text

    def expand_media_urls_to_absolute(self, text: str, base_url: Optional[str] = None) -> str:
        """
        Expands relative /api/chat/media/... URLs in markdown or HTML into full absolute URLs.
        Useful when sending responses to external API or chat clients (e.g. OpenAI completions, MCP).
        """
        if not text or not isinstance(text, str):
            return text
        root_base = (base_url or self.get_default_base_url()).rstrip("/")
        if not root_base:
            return text

        def _expand(m):
            full_match = m.group(0)
            if full_match.startswith(("http://", "https://")):
                return full_match
            return f"{root_base}{full_match}"

        return re.sub(r'(?:https?://[^\s/\"\'\)]+)?/api/chat/media/[\w\-.]+', _expand, text)


media_cache_service = MediaCacheService()
