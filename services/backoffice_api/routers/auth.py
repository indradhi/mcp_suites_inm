from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from models.user import User, RefreshToken
from security import verify_password, create_access_token, create_refresh_token, decode_token, get_current_user
from config import settings

router = APIRouter(prefix="/auth", tags=["Authentication"])

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: dict

class RefreshRequest(BaseModel):
    refresh_token: str

@router.post("/login", response_model=TokenResponse)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")

    access_token = create_access_token(data={"sub": user.username, "role": user.role.name if user.role else "viewer"})
    refresh_token_str = create_refresh_token(data={"sub": user.username})

    # Store refresh token
    expires_at = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    rf = RefreshToken(user_id=user.id, token=refresh_token_str, expires_at=expires_at)
    db.add(rf)
    db.commit()

    return {
        "access_token": access_token,
        "refresh_token": refresh_token_str,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role.name if user.role else "viewer"
        }
    }

@router.post("/refresh")
def refresh_token(payload: RefreshRequest, db: Session = Depends(get_db)):
    token_data = decode_token(payload.refresh_token)
    if token_data.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

    username = token_data.get("sub")
    db_token = db.query(RefreshToken).filter(
        RefreshToken.token == payload.refresh_token,
        RefreshToken.revoked == False
    ).first()

    if not db_token or db_token.expires_at < datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token expired or revoked")

    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    new_access_token = create_access_token(data={"sub": user.username, "role": user.role.name if user.role else "viewer"})
    return {"access_token": new_access_token, "token_type": "bearer"}

@router.get("/me")
def get_current_user_profile(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "role": current_user.role.name if current_user.role else "viewer"
    }


class ValidateApiKeyRequest(BaseModel):
    api_key: str


@router.post("/validate-api-key")
def validate_api_key(payload: ValidateApiKeyRequest, db: Session = Depends(get_db)):
    """
    Internal endpoint for MCP Server to validate an API key.
    No JWT required — intended for Docker internal network calls only.
    """
    from models.api_key import ApiKey
    raw_key = (payload.api_key or "").strip()
    if not raw_key or not raw_key.startswith("mcp_"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key format")

    # Find active keys and check hash
    active_keys = db.query(ApiKey).filter(ApiKey.is_active == True).all()
    for ak in active_keys:
        if verify_password(raw_key, ak.key_hash):
            # Check expiration
            if ak.expires_at and ak.expires_at < datetime.utcnow():
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="API key has expired")

            # Update last_used_at
            ak.last_used_at = datetime.utcnow()
            db.commit()

            import json
            scopes = json.loads(ak.scopes) if ak.scopes else None
            return {
                "valid": True,
                "key_id": ak.id,
                "name": ak.name,
                "scopes": scopes
            }

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or revoked API key")

