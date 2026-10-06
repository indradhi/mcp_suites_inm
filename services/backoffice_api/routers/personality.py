import logging
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from security import get_current_user, require_role
from services.personality_service import personality_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/settings/personality", tags=["MCP Personality Settings"])


class PersonalityPayload(BaseModel):
    name: Optional[str] = None
    nickname: Optional[str] = None
    role_title: Optional[str] = None
    role: Optional[str] = None
    preset_id: Optional[str] = None
    preset: Optional[str] = None
    tone: Optional[str] = None
    tone_label: Optional[str] = None
    tone_of_voice: Optional[str] = None
    language_style: Optional[str] = "id"
    core_mission: Optional[str] = None
    guidelines: Optional[List[str]] = []
    custom_instructions: Optional[str] = ""
    anti_hallucination_level: Optional[str] = "strict"
    system_prompt_override: Optional[str] = None


@router.get("")
def get_personality_settings(
    db: Session = Depends(get_db)
):
    """
    Returns current active MCP Personality, list of curated presets, and live prompt preview.
    Open for internal service-to-service calls (MCP Server) and UI clients.
    """
    try:
        active = personality_service.get_personality(db)
        presets = personality_service.get_all_available_personalities(db)
        preview = personality_service.build_system_instruction(db=db)
        return {
            "status": "success",
            "success": True,
            "personality": active,
            "active": active,
            "presets": presets,
            "system_instruction": preview,
            "preview": preview
        }
    except Exception as e:
        logger.error(f"Error fetching personality settings: {e}")
        raise HTTPException(status_code=500, detail=f"Gagal memuat pengaturan kepribadian: {str(e)}")


@router.put("")
def update_personality_settings(
    payload: PersonalityPayload,
    db: Session = Depends(get_db)
):
    """
    Updates active MCP Personality configuration.
    """
    try:
        raw_data = payload.dict()
        # Handle field aliases
        if raw_data.get("preset") and not raw_data.get("preset_id"):
            raw_data["preset_id"] = raw_data["preset"]
        if raw_data.get("role") and not raw_data.get("role_title"):
            raw_data["role_title"] = raw_data["role"]
        if raw_data.get("tone_of_voice") and not raw_data.get("tone_label"):
            raw_data["tone_label"] = raw_data["tone_of_voice"]

        updated = personality_service.update_personality(db, raw_data)
        preview = personality_service.build_system_instruction(db=db)
        return {
            "status": "success",
            "success": True,
            "message": "Kepribadian MCP berhasil diperbarui dan diterapkan ke seluruh prompting default.",
            "personality": updated,
            "active": updated,
            "data": updated,
            "system_instruction": preview,
            "preview": preview
        }
    except Exception as e:
        logger.error(f"Error updating personality settings: {e}")
        raise HTTPException(status_code=500, detail=f"Gagal menyimpan kepribadian: {str(e)}")


@router.post("/reset")
def reset_personality_settings(
    db: Session = Depends(get_db)
):
    """
    Resets active MCP Personality to standard BIN Investigator preset.
    """
    try:
        resetted = personality_service.reset_personality(db)
        preview = personality_service.build_system_instruction(db=db)
        return {
            "status": "success",
            "success": True,
            "message": "Kepribadian MCP berhasil dikembalikan ke standar default (Analis Intelijen BIN).",
            "personality": resetted,
            "active": resetted,
            "data": resetted,
            "system_instruction": preview,
            "preview": preview
        }
    except Exception as e:
        logger.error(f"Error resetting personality settings: {e}")
        raise HTTPException(status_code=500, detail=f"Gagal mereset kepribadian: {str(e)}")


@router.get("/custom")
def get_custom_personalities(db: Session = Depends(get_db)):
    """
    Returns list of custom personalities.
    """
    try:
        results = personality_service.get_custom_personalities(db)
        return {
            "status": "success",
            "success": True,
            "data": results
        }
    except Exception as e:
        logger.error(f"Error fetching custom personalities: {e}")
        raise HTTPException(status_code=500, detail=f"Gagal memuat kepribadian kustom: {str(e)}")


@router.post("/custom")
def add_custom_personality(
    payload: PersonalityPayload,
    db: Session = Depends(get_db)
):
    """
    Creates a new custom personality.
    """
    try:
        raw_data = payload.dict(exclude_unset=True)
        created = personality_service.add_custom_personality(db, raw_data)
        return {
            "status": "success",
            "success": True,
            "message": "Kepribadian kustom berhasil ditambahkan.",
            "data": created
        }
    except Exception as e:
        logger.error(f"Error adding custom personality: {e}")
        raise HTTPException(status_code=500, detail=f"Gagal menambah kepribadian: {str(e)}")


@router.put("/preset/{preset_id}")
def update_preset_personality(
    preset_id: str,
    payload: PersonalityPayload,
    db: Session = Depends(get_db)
):
    """
    Updates any preset (both predefined/curated defined templates and custom presets),
    allowing persisting the nickname and parameters to defined templates.
    """
    try:
        raw_data = payload.dict(exclude_unset=True)
        updated = personality_service.update_preset(db, preset_id, raw_data)
        preview = personality_service.build_system_instruction(db=db)
        return {
            "status": "success",
            "success": True,
            "message": f"Template '{preset_id}' berhasil diperbarui.",
            "data": updated,
            "preset": updated,
            "presets": personality_service.get_all_available_personalities(db),
            "system_instruction": preview,
            "preview": preview
        }
    except Exception as e:
        logger.error(f"Error updating preset {preset_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Gagal memperbarui template: {str(e)}")


@router.put("/custom/{preset_id}")
def update_custom_personality(
    preset_id: str,
    payload: PersonalityPayload,
    db: Session = Depends(get_db)
):
    """
    Updates an existing custom personality or defined template.
    """
    try:
        raw_data = payload.dict(exclude_unset=True)
        updated = personality_service.update_preset(db, preset_id, raw_data)
        preview = personality_service.build_system_instruction(db=db)
        return {
            "status": "success",
            "success": True,
            "message": "Kepribadian berhasil diperbarui.",
            "data": updated,
            "preset": updated,
            "presets": personality_service.get_all_available_personalities(db),
            "system_instruction": preview,
            "preview": preview
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating custom personality: {e}")
        raise HTTPException(status_code=500, detail=f"Gagal memperbarui kepribadian: {str(e)}")


@router.delete("/custom/{preset_id}")
def delete_custom_personality(
    preset_id: str,
    db: Session = Depends(get_db)
):
    """
    Deletes a custom personality.
    """
    try:
        success = personality_service.delete_custom_personality(db, preset_id)
        if not success:
            raise HTTPException(status_code=404, detail="Kepribadian tidak ditemukan.")
        return {
            "status": "success",
            "success": True,
            "message": "Kepribadian kustom berhasil dihapus."
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting custom personality: {e}")
        raise HTTPException(status_code=500, detail=f"Gagal menghapus kepribadian: {str(e)}")
