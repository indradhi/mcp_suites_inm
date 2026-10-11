import logging
import copy
from datetime import datetime
from typing import List, Dict, Any, Optional, Union
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from security import get_current_user, require_role
from models.orchestration_flow import OrchestrationFlow
from services.flow_orchestrator import flow_orchestrator

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/orchestrator", tags=["Data Orchestration & Flows"])

class FlowStepItem(BaseModel):
    step_order: int
    title: str
    action_type: str  # tool_call, graph_traversal, vector_search, synthesis_rule
    target: str
    priority: Optional[str] = "REQUIRED"  # MANDATORY, REQUIRED, OPTIONAL
    description: Optional[str] = None
    parameters_mapping: Optional[Dict[str, Any]] = None

class FlowCreateRequest(BaseModel):
    name: str
    description: Optional[str] = None
    prompt_pattern: str
    intent_category: Optional[str] = "profiling"
    trigger_keywords: Optional[List[str]] = []
    steps: List[Dict[str, Any]]
    validity_priority_rule: Optional[str] = "PRIORITIZE_HIGHEST_VALIDITY"
    is_active: Optional[bool] = True

class FlowUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    prompt_pattern: Optional[str] = None
    intent_category: Optional[str] = None
    trigger_keywords: Optional[List[str]] = None
    steps: Optional[List[Dict[str, Any]]] = None
    validity_priority_rule: Optional[str] = None
    is_active: Optional[bool] = None

class FlowMatchRequest(BaseModel):
    query: str

class FlowExecuteRequest(BaseModel):
    query: str

@router.get("/flows")
def list_orchestration_flows(
    intent: Optional[str] = Query(None, description="Filter by intent category"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    db: Session = Depends(get_db),
    user = Depends(get_current_user)
):
    """
    Returns all registered prompt retrieval flows / routing memory templates.
    Auto-seeds default golden flows if the table is empty.
    """
    q = db.query(OrchestrationFlow)
    if intent:
        q = q.filter(OrchestrationFlow.intent_category == intent)
    if is_active is not None:
        q = q.filter(OrchestrationFlow.is_active == is_active)

    flows = q.order_by(OrchestrationFlow.execution_count.desc(), OrchestrationFlow.created_at.desc()).all()
    if not flows:
        flow_orchestrator.seed_default_flows(db)
        flows = q.order_by(OrchestrationFlow.execution_count.desc(), OrchestrationFlow.created_at.desc()).all()

    return {
        "total": len(flows),
        "flows": [f.to_dict() for f in flows]
    }

@router.post("/flows", status_code=status.HTTP_201_CREATED)
def create_orchestration_flow(
    payload: FlowCreateRequest,
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin", "editor"]))
):
    """
    Creates a new prompt retrieval flow to remember as a reference for similar queries.
    """
    if not payload.name or not payload.prompt_pattern:
        raise HTTPException(status_code=400, detail="Flow name and prompt_pattern are required.")

    flow = OrchestrationFlow(
        name=payload.name.strip(),
        description=payload.description,
        prompt_pattern=payload.prompt_pattern.strip(),
        intent_category=payload.intent_category or "profiling",
        trigger_keywords=payload.trigger_keywords or [],
        steps=payload.steps or [],
        validity_priority_rule=payload.validity_priority_rule or "PRIORITIZE_HIGHEST_VALIDITY",
        is_active=payload.is_active if payload.is_active is not None else True,
        execution_count=0
    )
    db.add(flow)
    db.commit()
    db.refresh(flow)

    return {
        "success": True,
        "message": f"Alur perolehan '{flow.name}' berhasil disimpan ke memori orchestrator.",
        "flow": flow.to_dict()
    }

@router.get("/flows/export")
def export_orchestration_flows(
    flow_id: Optional[int] = Query(None, description="Optional ID of a specific flow to export"),
    db: Session = Depends(get_db),
    user = Depends(get_current_user)
):
    """
    Exports registered orchestration flows as a portable JSON structure.
    """
    if flow_id:
        flow = db.query(OrchestrationFlow).filter(OrchestrationFlow.id == flow_id).first()
        if not flow:
            raise HTTPException(status_code=404, detail="Flow not found")
        return {
            "version": "1.0",
            "type": "orchestration_flow",
            "exported_at": datetime.utcnow().isoformat(),
            "flow": {
                "name": flow.name,
                "description": flow.description,
                "prompt_pattern": flow.prompt_pattern,
                "intent_category": flow.intent_category,
                "trigger_keywords": flow.trigger_keywords or [],
                "steps": flow.steps or [],
                "validity_priority_rule": flow.validity_priority_rule,
                "is_active": flow.is_active
            }
        }

    flows = db.query(OrchestrationFlow).order_by(OrchestrationFlow.id.asc()).all()
    return {
        "version": "1.0",
        "type": "orchestration_flows_bundle",
        "exported_at": datetime.utcnow().isoformat(),
        "total": len(flows),
        "flows": [
            {
                "name": f.name,
                "description": f.description,
                "prompt_pattern": f.prompt_pattern,
                "intent_category": f.intent_category,
                "trigger_keywords": f.trigger_keywords or [],
                "steps": f.steps or [],
                "validity_priority_rule": f.validity_priority_rule,
                "is_active": f.is_active
            }
            for f in flows
        ]
    }

@router.post("/flows/import", status_code=status.HTTP_201_CREATED)
def import_orchestration_flows(
    payload: Union[Dict[str, Any], List[Dict[str, Any]]],
    overwrite: bool = Query(False, description="Whether to overwrite existing flows with same name"),
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin", "editor"]))
):
    """
    Imports orchestration flows from exported JSON payload.
    Accepts single flow dictionary, flows bundle dict, or raw array of flow objects.
    """
    items_to_import = []
    if isinstance(payload, list):
        items_to_import = payload
    elif isinstance(payload, dict):
        if "flows" in payload and isinstance(payload["flows"], list):
            items_to_import = payload["flows"]
        elif "flow" in payload and isinstance(payload["flow"], dict):
            items_to_import = [payload["flow"]]
        elif "name" in payload and ("prompt_pattern" in payload or "steps" in payload):
            items_to_import = [payload]
        else:
            raise HTTPException(status_code=400, detail="Format payload import tidak dikenali. Harus memuat 'flows' atau 'flow' yang valid.")
    else:
        raise HTTPException(status_code=400, detail="Data alur tidak valid.")

    if not items_to_import:
        raise HTTPException(status_code=400, detail="Tidak ada data alur yang ditemukan untuk diimpor.")

    imported_flows = []
    for item in items_to_import:
        if not isinstance(item, dict):
            continue
        name = item.get("name")
        pattern = item.get("prompt_pattern")
        if not name or not pattern:
            continue

        steps = item.get("steps") or []
        existing = db.query(OrchestrationFlow).filter(OrchestrationFlow.name == name.strip()).first()
        if existing and overwrite:
            existing.description = item.get("description", existing.description)
            existing.prompt_pattern = pattern.strip()
            existing.intent_category = item.get("intent_category", existing.intent_category or "profiling")
            existing.trigger_keywords = item.get("trigger_keywords", existing.trigger_keywords or [])
            existing.steps = steps
            existing.validity_priority_rule = item.get("validity_priority_rule", existing.validity_priority_rule or "PRIORITIZE_HIGHEST_VALIDITY")
            existing.is_active = item.get("is_active", True)
            imported_flows.append(existing)
        else:
            final_name = name.strip()
            if existing and not overwrite:
                counter = 1
                while db.query(OrchestrationFlow).filter(OrchestrationFlow.name == f"{final_name} (Import {counter})").first():
                    counter += 1
                final_name = f"{final_name} (Import {counter})"

            new_flow = OrchestrationFlow(
                name=final_name,
                description=item.get("description"),
                prompt_pattern=pattern.strip(),
                intent_category=item.get("intent_category") or "profiling",
                trigger_keywords=item.get("trigger_keywords") or [],
                steps=steps,
                validity_priority_rule=item.get("validity_priority_rule") or "PRIORITIZE_HIGHEST_VALIDITY",
                is_active=item.get("is_active", True),
                execution_count=0
            )
            db.add(new_flow)
            imported_flows.append(new_flow)

    db.commit()
    for f in imported_flows:
        db.refresh(f)

    return {
        "success": True,
        "imported_count": len(imported_flows),
        "message": f"Berhasil mengimpor {len(imported_flows)} alur perolehan informasi ke sistem orchestrator.",
        "flows": [f.to_dict() for f in imported_flows]
    }

@router.post("/flows/{flow_id}/clone", status_code=status.HTTP_201_CREATED)
def clone_orchestration_flow(
    flow_id: int,
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin", "editor"]))
):
    """
    Clones an existing orchestration flow with a '(Salinan)' suffix.
    """
    flow = db.query(OrchestrationFlow).filter(OrchestrationFlow.id == flow_id).first()
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")

    base_name = f"{flow.name} (Salinan)"
    cloned_name = base_name
    counter = 1
    while db.query(OrchestrationFlow).filter(OrchestrationFlow.name == cloned_name).first():
        counter += 1
        cloned_name = f"{flow.name} (Salinan {counter})"

    cloned_flow = OrchestrationFlow(
        name=cloned_name,
        description=flow.description,
        prompt_pattern=flow.prompt_pattern,
        intent_category=flow.intent_category or "profiling",
        trigger_keywords=copy.deepcopy(flow.trigger_keywords or []),
        steps=copy.deepcopy(flow.steps or []),
        validity_priority_rule=flow.validity_priority_rule or "PRIORITIZE_HIGHEST_VALIDITY",
        is_active=True,
        execution_count=0
    )
    db.add(cloned_flow)
    db.commit()
    db.refresh(cloned_flow)

    return {
        "success": True,
        "message": f"Alur '{flow.name}' berhasil digandakan menjadi '{cloned_flow.name}'.",
        "flow": cloned_flow.to_dict()
    }

@router.get("/flows/{flow_id}")
def get_orchestration_flow(
    flow_id: int,
    db: Session = Depends(get_db),
    user = Depends(get_current_user)
):
    flow = db.query(OrchestrationFlow).filter(OrchestrationFlow.id == flow_id).first()
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")
    return flow.to_dict()

@router.put("/flows/{flow_id}")
def update_orchestration_flow(
    flow_id: int,
    payload: FlowUpdateRequest,
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin", "editor"]))
):
    flow = db.query(OrchestrationFlow).filter(OrchestrationFlow.id == flow_id).first()
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")

    if payload.name is not None:
        flow.name = payload.name.strip()
    if payload.description is not None:
        flow.description = payload.description
    if payload.prompt_pattern is not None:
        flow.prompt_pattern = payload.prompt_pattern.strip()
    if payload.intent_category is not None:
        flow.intent_category = payload.intent_category
    if payload.trigger_keywords is not None:
        flow.trigger_keywords = payload.trigger_keywords
    if payload.steps is not None:
        flow.steps = payload.steps
    if payload.validity_priority_rule is not None:
        flow.validity_priority_rule = payload.validity_priority_rule
    if payload.is_active is not None:
        flow.is_active = payload.is_active

    db.commit()
    db.refresh(flow)
    return {
        "success": True,
        "message": f"Alur '{flow.name}' berhasil diperbarui.",
        "flow": flow.to_dict()
    }

@router.delete("/flows/{flow_id}")
def delete_orchestration_flow(
    flow_id: int,
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin", "editor"]))
):
    flow = db.query(OrchestrationFlow).filter(OrchestrationFlow.id == flow_id).first()
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")

    name = flow.name
    db.delete(flow)
    db.commit()
    return {"success": True, "message": f"Alur '{name}' berhasil dihapus."}

@router.post("/flows/match")
def match_prompt_flow(
    payload: FlowMatchRequest,
    db: Session = Depends(get_db),
    user = Depends(get_current_user)
):
    """
    Finds the best matching remembered retrieval flow for a given query prompt.
    """
    res = flow_orchestrator.match_flow_for_prompt(payload.query, db)
    return res

@router.post("/flows/{flow_id}/execute")
def execute_orchestration_flow(
    flow_id: int,
    payload: FlowExecuteRequest,
    db: Session = Depends(get_db),
    user = Depends(get_current_user)
):
    """
    Tests and executes a registered retrieval flow step-by-step for a prompt query.
    """
    try:
        res = flow_orchestrator.execute_flow(flow_id, payload.query, db)
        return {
            "success": True,
            "result": res
        }
    except Exception as e:
        logger.error(f"Error executing flow {flow_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/flows/seed")
def seed_golden_flows(
    db: Session = Depends(get_db),
    user = Depends(require_role(["admin", "editor"]))
):
    """
    Forces a re-seed of the default golden KPK investigation and governance flows.
    """
    count = flow_orchestrator.seed_default_flows(db)
    return {
        "success": True,
        "seeded_count": count,
        "message": f"Berhasil memverifikasi dan menambahkan {count} alur acuan standar."
    }
