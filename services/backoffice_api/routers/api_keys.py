import secrets
import json
import logging
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from models.api_key import ApiKey
from security import get_current_user, get_password_hash, verify_password

logger = logging.getLogger("api_keys")

router = APIRouter(prefix="/api-keys", tags=["API Keys"])


# ── Schemas ───────────────────────────────────────────────────────────

class ApiKeyCreateRequest(BaseModel):
    name: str
    scopes: Optional[List[str]] = None
    expires_at: Optional[str] = None  # ISO datetime string


class ApiKeyToggleRequest(BaseModel):
    is_active: bool


# ── Helpers ───────────────────────────────────────────────────────────

def generate_api_key() -> str:
    """Generate a random API key with 'mcp_' prefix."""
    random_part = secrets.token_hex(32)
    return f"mcp_{random_part}"


# ── Endpoints ─────────────────────────────────────────────────────────

@router.get("")
def list_api_keys(db: Session = Depends(get_db), user=Depends(get_current_user)):
    """List all API keys (without revealing the full key)."""
    keys = db.query(ApiKey).order_by(ApiKey.created_at.desc()).all()
    result = []
    for k in keys:
        creator_name = None
        if k.creator:
            creator_name = k.creator.full_name or k.creator.username
        result.append({
            "id": k.id,
            "name": k.name,
            "key_prefix": k.key_prefix,
            "scopes": json.loads(k.scopes) if k.scopes else None,
            "is_active": k.is_active,
            "expires_at": k.expires_at.isoformat() if k.expires_at else None,
            "last_used_at": k.last_used_at.isoformat() if k.last_used_at else None,
            "created_by": creator_name,
            "created_at": k.created_at.isoformat() if k.created_at else None
        })
    return {"api_keys": result}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_api_key(
    req: ApiKeyCreateRequest,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    """Generate a new API key. The full key is returned ONCE in this response."""
    if not req.name or not req.name.strip():
        raise HTTPException(status_code=400, detail="Name is required")

    raw_key = generate_api_key()
    key_prefix = raw_key[:8]  # "mcp_" + first 4 hex chars
    key_hash = get_password_hash(raw_key)

    expires_at = None
    if req.expires_at:
        try:
            expires_at = datetime.fromisoformat(req.expires_at.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid expires_at format. Use ISO 8601.")

    scopes_json = json.dumps(req.scopes) if req.scopes else None

    api_key = ApiKey(
        name=req.name.strip(),
        key_prefix=key_prefix,
        key_hash=key_hash,
        scopes=scopes_json,
        is_active=True,
        expires_at=expires_at,
        created_by=user.id
    )
    db.add(api_key)
    db.commit()
    db.refresh(api_key)

    logger.info(f"API Key '{req.name}' created by user '{user.username}' (id={api_key.id})")

    return {
        "id": api_key.id,
        "name": api_key.name,
        "key_prefix": key_prefix,
        "api_key": raw_key,  # Full key — shown only once!
        "scopes": req.scopes,
        "is_active": True,
        "expires_at": expires_at.isoformat() if expires_at else None,
        "created_at": api_key.created_at.isoformat() if api_key.created_at else None,
        "message": "API Key berhasil dibuat. Simpan key ini — tidak akan ditampilkan lagi!"
    }


@router.patch("/{key_id}/toggle")
def toggle_api_key(
    key_id: int,
    req: ApiKeyToggleRequest,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    """Enable or disable an API key."""
    api_key = db.query(ApiKey).filter(ApiKey.id == key_id).first()
    if not api_key:
        raise HTTPException(status_code=404, detail="API Key not found")

    api_key.is_active = req.is_active
    db.commit()

    action = "diaktifkan" if req.is_active else "dinonaktifkan"
    logger.info(f"API Key '{api_key.name}' (id={key_id}) {action} by user '{user.username}'")
    return {"message": f"API Key '{api_key.name}' berhasil {action}", "is_active": api_key.is_active}


@router.delete("/{key_id}")
def delete_api_key(
    key_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    """Permanently delete an API key."""
    api_key = db.query(ApiKey).filter(ApiKey.id == key_id).first()
    if not api_key:
        raise HTTPException(status_code=404, detail="API Key not found")

    name = api_key.name
    db.delete(api_key)
    db.commit()

    logger.info(f"API Key '{name}' (id={key_id}) deleted by user '{user.username}'")
    return {"message": f"API Key '{name}' berhasil dihapus"}
