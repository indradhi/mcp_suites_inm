import os
import re
import json
import logging
from typing import Dict, Any, List, Optional
from openai import OpenAI, AsyncOpenAI
import httpx
from config import settings

logger = logging.getLogger(__name__)

class LLMService:
    def __init__(self):
        self.default_base_url = settings.DEFAULT_OPENAI_API_BASE
        self.default_api_key = settings.DEFAULT_OPENAI_API_KEY
        self.default_model = settings.DEFAULT_OPENAI_MODEL

    def get_client(self, api_base: Optional[str] = None, api_key: Optional[str] = None) -> OpenAI:
        base = api_base or self.default_base_url
        key = api_key or self.default_api_key or "EMPTY"
        return OpenAI(
            base_url=base,
            api_key=key,
            timeout=120.0
        )

    def get_async_client(self, api_base: Optional[str] = None, api_key: Optional[str] = None) -> AsyncOpenAI:
        base = api_base or self.default_base_url
        key = api_key or self.default_api_key or "EMPTY"
        return AsyncOpenAI(
            base_url=base,
            api_key=key,
            timeout=120.0
        )

    async def list_remote_models(self, api_base: str, api_key: Optional[str] = None) -> List[str]:
        """
        Attempts to list models from an OpenAI-compatible /v1/models endpoint (vLLM, Ollama, etc.)
        """
        key = api_key or "EMPTY"
        headers = {"Authorization": f"Bearer {key}"} if key != "EMPTY" else {}
        url = api_base.rstrip("/")
        if not url.endswith("/v1"):
            url += "/v1"
        url += "/models"

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            if "data" in data and isinstance(data["data"], list):
                return [m["id"] for m in data["data"] if "id" in m]
            return []

    def get_task_backend(self, task: str, db) -> tuple[str, str, str]:
        """
        Retrieves the assigned backend and model for a task from MySQL, or returns default.
        """
        from models.llm_backend import ModelAssignment, LLMBackend
        try:
            assignment = db.query(ModelAssignment).filter(ModelAssignment.task == task).first()
            if assignment and assignment.backend and assignment.backend.is_active:
                return (
                    assignment.backend.api_base,
                    assignment.backend.api_key or "EMPTY",
                    assignment.model_name
                )
        except Exception as e:
            logger.warning(f"Could not load custom assignment for task {task}: {e}")

        return (self.default_base_url, self.default_api_key, self.default_model)

    def extract_entities_and_relations(self, text: str, db=None) -> Dict[str, Any]:
        """
        Uses LLM with structured JSON prompting to extract entities and relations.
        Runs synchronously to avoid event-loop conflicts inside Celery worker processes.
        """
        api_base, api_key, model = self.get_task_backend("entity_extraction", db)
        client = self.get_client(api_base, api_key)

        # Strip long base64 image strings from text to avoid wasting prompt tokens
        clean_text = re.sub(r'(/9j/[a-zA-Z0-9+/=]{40,})', '[IMAGE_DATA]', text)
        clean_text = re.sub(r'(data:image/[^;]+;base64,[a-zA-Z0-9+/=]{40,})', '[IMAGE_DATA]', clean_text)
        clean_text = re.sub(r'(iVBORw0KGgo[a-zA-Z0-9+/=]{40,})', '[IMAGE_DATA]', clean_text)

        prompt = f"""You are an expert Knowledge Graph Information Extraction system.
Analyze the following text and extract significant entities and the relationships between them.

Entities can be: PERSON, ORGANIZATION, LOCATION, DATABASE_RECORD, API_ENDPOINT, DOCUMENT, SYSTEM, PRODUCT, CONCEPT, EVENT.
Relationships should be clear verbs or semantic connections like WORKS_FOR, LOCATED_IN, CONNECTED_TO, OWNS, USES, CONTAINS, PART_OF, RELATED_TO.

Focus on the top 8-12 most significant entities and up to 10 relationships.
Keep descriptions concise (under 15 words).

IMPORTANT: Output strictly a valid JSON object. Do NOT include thinking, reasoning, markdown or conversational text.

Schema:
{{
  "entities": [
    {{"name": "Entity Name", "type": "ENTITY_TYPE", "description": "brief description"}}
  ],
  "relationships": [
    {{"source": "Entity A", "relation": "RELATION_TYPE", "target": "Entity B", "properties": {{"context": "brief info"}}}}
  ]
}}

Text to analyze:
\"\"\"
{clean_text[:2500]}
\"\"\"
"""
        try:
            kwargs = {
                "model": model,
                "messages": [
                    {"role": "system", "content": "You are a precise data extraction assistant that outputs strictly valid JSON only."},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.1,
                "max_tokens": 2500
            }
            # Disable thinking/reasoning mode on vLLM/Qwen to prevent token exhaustion by thinking traces
            try:
                response = client.chat.completions.create(
                    **kwargs,
                    extra_body={"chat_template_kwargs": {"enable_thinking": False}}
                )
            except Exception:
                response = client.chat.completions.create(**kwargs)

            msg = response.choices[0].message
            raw_content = (msg.content or "").strip()
            if not raw_content and hasattr(msg, "reasoning") and msg.reasoning:
                raw_content = msg.reasoning.strip()

            # Remove thinking block if present
            raw_content = re.sub(r"<think>.*?</think>", "", raw_content, flags=re.DOTALL).strip()

            # Clean markdown codeblocks if model wraps output
            if "```json" in raw_content:
                parts = raw_content.split("```json")
                if len(parts) > 1:
                    raw_content = parts[1].split("```")[0].strip()
            elif "```" in raw_content:
                parts = raw_content.split("```")
                if len(parts) > 1:
                    raw_content = parts[1].strip()

            # Find json block
            if "{" in raw_content and "}" in raw_content:
                start_idx = raw_content.find("{")
                end_idx = raw_content.rfind("}") + 1
                raw_content = raw_content[start_idx:end_idx]

            parsed = None
            try:
                parsed = json.loads(raw_content)
            except Exception as e_json:
                # Robust repair for truncated JSON
                logger.debug(f"Direct JSON parse failed ({e_json}), attempting repair...")
                repaired = raw_content
                # If cut off inside an array/object, try trimming to last complete object
                last_obj = repaired.rfind("}")
                if last_obj != -1:
                    repaired = repaired[:last_obj+1]
                    if repaired.count("[") > repaired.count("]"):
                        repaired += "]" * (repaired.count("[") - repaired.count("]"))
                    if repaired.count("{") > repaired.count("}"):
                        repaired += "}" * (repaired.count("{") - repaired.count("}"))
                    try:
                        parsed = json.loads(repaired)
                    except Exception:
                        pass

                # If still fails, regex extract entities
                if not parsed:
                    ents = []
                    for m in re.finditer(r'\{\s*"name"\s*:\s*"([^"]+)"\s*,\s*"type"\s*:\s*"([^"]+)"(?:\s*,\s*"description"\s*:\s*"([^"]*)")?', raw_content):
                        ents.append({"name": m.group(1), "type": m.group(2), "description": m.group(3) or ""})
                    rels = []
                    for m in re.finditer(r'\{\s*"source"\s*:\s*"([^"]+)"\s*,\s*"relation"\s*:\s*"([^"]+)"\s*,\s*"target"\s*:\s*"([^"]+)"', raw_content):
                        rels.append({"source": m.group(1), "relation": m.group(2), "target": m.group(3)})
                    if ents or rels:
                        parsed = {"entities": ents, "relationships": rels}

            if parsed and isinstance(parsed, dict):
                return {
                    "entities": parsed.get("entities", []),
                    "relationships": parsed.get("relationships", [])
                }
            return {"entities": [], "relationships": []}
        except Exception as e:
            logger.warning(f"Notice in LLM entity extraction: {e}")
            return {"entities": [], "relationships": []}

llm_service = LLMService()
