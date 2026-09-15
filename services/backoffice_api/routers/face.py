import logging
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel

from services.face_service import face_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/face", tags=["Face Recognition"])


class RecognizeFaceRequest(BaseModel):
    image: str  # Local file path or Base64 string
    min_confidence: Optional[float] = 0.60
    max_candidates: Optional[int] = 3


class CompareFacesRequest(BaseModel):
    image_a: str  # Local file path or Base64 string
    image_b: str  # Local file path or Base64 string
    threshold: Optional[float] = 0.70


class EnrollFaceRequest(BaseModel):
    image: str  # Local file path or Base64 string
    person_name: str
    person_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


@router.post("/recognize")
def recognize_face_endpoint(req: RecognizeFaceRequest):
    """
    Recognize and identify a person's face from a file path or Base64 string against indexed face records.
    """
    try:
        result = face_service.recognize_face(
            image_input=req.image,
            min_confidence=req.min_confidence or 0.60,
            max_candidates=req.max_candidates or 3
        )
        return result
    except Exception as e:
        logger.error(f"Error in recognize endpoint: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/compare")
def compare_faces_endpoint(req: CompareFacesRequest):
    """
    Compare two face images (file paths or Base64) to determine if they belong to the same person.
    """
    try:
        result = face_service.compare_faces(
            image_a=req.image_a,
            image_b=req.image_b,
            threshold=req.threshold or 0.70
        )
        return result
    except Exception as e:
        logger.error(f"Error in compare endpoint: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/enroll")
def enroll_face_endpoint(req: EnrollFaceRequest):
    """
    Enroll a new face into the biometric knowledge base with identity metadata.
    """
    try:
        result = face_service.enroll_face(
            image_input=req.image,
            person_name=req.person_name,
            person_id=req.person_id,
            metadata=req.metadata
        )
        return result
    except Exception as e:
        logger.error(f"Error in enroll endpoint: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/enrolled")
def list_enrolled_faces_endpoint(limit: int = 50):
    """
    List all enrolled face profiles in the face knowledge base.
    """
    try:
        faces = face_service.list_enrolled_faces(limit=limit)
        return {"faces": faces, "total": len(faces)}
    except Exception as e:
        logger.error(f"Error listing enrolled faces: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/enrolled/{face_id}")
def delete_enrolled_face_endpoint(face_id: str):
    """
    Delete an enrolled face by ID.
    """
    try:
        success = face_service.delete_enrolled_face(face_id)
        return {"success": success, "message": f"Deleted face profile {face_id}"}
    except Exception as e:
        logger.error(f"Error deleting face {face_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
