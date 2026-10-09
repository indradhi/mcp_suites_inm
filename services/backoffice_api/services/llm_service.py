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

    def get_client(self, api_base: Optional[str] = None, api_key: Optional[str] = None, timeout: Optional[float] = None) -> OpenAI:
        base = api_base or self.default_base_url
        key = api_key or self.default_api_key or "EMPTY"
        default_headers = {
            "User-Agent": "MCP-Knowledge-Backoffice/1.0",
            "HTTP-Referer": "http://localhost:5173",
            "X-Title": "MCP Knowledge Backoffice"
        }
        if timeout is None:
            is_cloud = any(domain in (base or "").lower() for domain in [
                "openrouter.ai", "api.openai.com", "api.deepseek.com",
                "groq.com", "googleapis.com", "anthropic.com",
                "mistral.ai", "together.xyz", "cohere.com"
            ])
            cloud_timeout = float(os.getenv("CLOUD_LLM_TIMEOUT", "60.0"))
            local_timeout = float(os.getenv("LOCAL_LLM_TIMEOUT", "600.0"))
            # 60s for cloud endpoints, 600s (10 mins) for local models to allow compute/tool calling
            timeout = cloud_timeout if is_cloud else local_timeout

        return OpenAI(
            base_url=base,
            api_key=key,
            default_headers=default_headers,
            timeout=timeout
        )

    def get_async_client(self, api_base: Optional[str] = None, api_key: Optional[str] = None, timeout: Optional[float] = None) -> AsyncOpenAI:
        base = api_base or self.default_base_url
        key = api_key or self.default_api_key or "EMPTY"
        default_headers = {
            "User-Agent": "MCP-Knowledge-Backoffice/1.0",
            "HTTP-Referer": "http://localhost:5173",
            "X-Title": "MCP Knowledge Backoffice"
        }
        if timeout is None:
            is_cloud = any(domain in (base or "").lower() for domain in [
                "openrouter.ai", "api.openai.com", "api.deepseek.com",
                "groq.com", "googleapis.com", "anthropic.com",
                "mistral.ai", "together.xyz", "cohere.com"
            ])
            cloud_timeout = float(os.getenv("CLOUD_LLM_TIMEOUT", "60.0"))
            local_timeout = float(os.getenv("LOCAL_LLM_TIMEOUT", "600.0"))
            timeout = cloud_timeout if is_cloud else local_timeout

        return AsyncOpenAI(
            base_url=base,
            api_key=key,
            default_headers=default_headers,
            timeout=timeout
        )

    async def list_remote_models(self, api_base: str, api_key: Optional[str] = None) -> List[str]:
        """
        Attempts to list models from an OpenAI-compatible /models endpoint (OpenAI, Groq, DeepSeek, OpenRouter, Gemini, vLLM, Ollama, etc.)
        """
        key = api_key or "EMPTY"
        headers = {
            "User-Agent": "MCP-Knowledge-Backoffice/1.0",
            "HTTP-Referer": "http://localhost:5173",
            "X-Title": "MCP Knowledge Backoffice"
        }
        if key and key != "EMPTY":
            headers["Authorization"] = f"Bearer {key}"

        clean_base = api_base.strip().rstrip("/")
        if clean_base.endswith("/models"):
            candidate_urls = [clean_base]
        elif "/v1" in clean_base or "/openai" in clean_base or "/compatibility" in clean_base:
            candidate_urls = [f"{clean_base}/models"]
        else:
            candidate_urls = [f"{clean_base}/v1/models", f"{clean_base}/models"]

        last_err = None
        for test_url in candidate_urls:
            try:
                async with httpx.AsyncClient(timeout=12.0, follow_redirects=True, verify=False) as client:
                    resp = await client.get(test_url, headers=headers)
                    if resp.status_code == 200:
                        data = resp.json()
                        # Standard OpenAI / Groq / vLLM / OpenRouter format: {"data": [{"id": "model_id"}, ...]}
                        if "data" in data and isinstance(data["data"], list):
                            models = [str(m["id"]) for m in data["data"] if isinstance(m, dict) and "id" in m]
                            if models:
                                return models
                        # Ollama native format: {"models": [{"name": "llama3:latest"}, ...]}
                        elif "models" in data and isinstance(data["models"], list):
                            models = [str(m.get("name") or m.get("model") or m.get("id")) for m in data["models"] if isinstance(m, dict)]
                            if models:
                                return [m for m in models if m]
                    elif resp.status_code in [401, 403]:
                        resp.raise_for_status()
            except httpx.HTTPStatusError as hse:
                if hse.response.status_code == 401:
                    raise Exception("Autentikasi gagal: API Key tidak valid atau tidak diizinkan.")
                elif hse.response.status_code == 403:
                    raise Exception("Akses ditolak (403): Periksa izin API Key atau kuota akun.")
                last_err = hse
            except Exception as ex:
                last_err = ex

        if last_err:
            raise last_err
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

# Entity Guidelines (STRICTLY FOLLOW THESE RULES):
1. "Orang" (Person): MUST be uniquely identified by NIK if available (use NIK as the entity `name`). If NIK is unknown, use their full name. Node Type: "Orang". 
   - CRITICAL: If you use NIK as the identifier, you MUST also extract the person's actual full name as a separate entity (Node Type: "Nama") and link them with relation "MEMILIKI_NAMA".
2. "Dokumen" (Document/Identity): Uniquely identified by KK number (e.g., "KK: 360..."). Node Type: "Dokumen".
3. "Perusahaan" (Company/Organization): Uniquely identified by its Name (e.g., PT, CV, Yayasan). Node Type: "Perusahaan".
4. "Telepon" (Phone Number): Uniquely identified by MSISDN. Node Type: "Telepon".
5. "Rekening" (Bank Account): Uniquely identified by Account Number. Node Type: "Rekening".
6. "Aset" (Asset/Property/Vehicle): Land, buildings, cars, motorcycles, or other valuable items. Node Type: "Aset".
7. "Lokasi" (Location): Cities, regions, addresses, or specific places. Node Type: "Lokasi".
8. Other entities can be CONCEPT, dll.

# Relationship Guidelines:
1. Extract relationships EXACTLY as they are described in the text. DO NOT hallucinate or assume relationships (e.g., do not assume parents live in the same KK unless stated).
2. Use simple, descriptive relationship names derived directly from the text (e.g., AYAH, IBU, DOMISILI, LAHIR_DI, BEKERJA_SEBAGAI, PEMILIK, MENGHUBUNGI).
3. Extract administrative regions (Kelurahan/Desa, Kecamatan, Kabupaten/Kota, Provinsi) as distinct entities (Node Type: "Lokasi") and relate them to the central person using relationship names like: KELURAHAN, KECAMATAN, KABUPATEN_KOTA, PROVINSI.
4. "Orang" -> "Dokumen" (Identity): MEMILIKI_NIK.
5. "Orang" / "Perusahaan" -> "Rekening": MEMILIKI_REKENING.
6. "Orang" / "Perusahaan" -> "Aset": MEMILIKI_ASET, MEMBELI_ASET.
7. "Rekening" -> "Rekening": TRANSFER_DANA, MUTASI.
8. You may use generic relationships (RELATED_TO, dll.) if needed.

Focus on the top 12-15 most significant entities and up to 15 relationships.
Keep descriptions concise (under 15 words).

IMPORTANT: Output strictly a valid JSON object. Do NOT include thinking, reasoning, markdown or conversational text.

Schema:
{{
  "entities": [
    {{"name": "Entity ID or Name (e.g., NIK or Company Name)", "type": "Orang|Perusahaan|Telepon|etc", "description": "brief description"}}
  ],
  "relationships": [
    {{"source": "Entity A Name/ID", "relation": "RELATION_TYPE", "target": "Entity B Name/ID", "properties": {{"context": "brief info"}}}}
  ]
}}

Text to analyze:
\"\"\"
{clean_text[:2500]}
\"\"\"
"""
        try:
            is_o_series = any(model.lower().startswith(p) for p in ["o1", "o3", "openai/o1", "openai/o3"])
            if is_o_series:
                kwargs = {
                    "model": model,
                    "messages": [
                        {"role": "user", "content": f"You are a precise data extraction assistant that outputs strictly valid JSON only.\n\n{prompt}"}
                    ],
                    "max_completion_tokens": 8192
                }
            else:
                kwargs = {
                    "model": model,
                    "messages": [
                        {"role": "system", "content": "You are a precise data extraction assistant that outputs strictly valid JSON only."},
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 0.1,
                    "max_tokens": 8192
                }

            # Disable thinking/reasoning mode on vLLM/Qwen to prevent token exhaustion by thinking traces
            try:
                response = client.chat.completions.create(
                    **kwargs,
                    extra_body={"chat_template_kwargs": {"enable_thinking": False}}
                )
            except Exception:
                try:
                    response = client.chat.completions.create(**kwargs)
                except Exception as e_retry:
                    # Fallback if model requires max_completion_tokens instead of max_tokens or rejects temperature
                    if "max_tokens" in str(e_retry) or "temperature" in str(e_retry):
                        kwargs.pop("temperature", None)
                        if "max_tokens" in kwargs:
                            kwargs["max_completion_tokens"] = kwargs.pop("max_tokens")
                        response = client.chat.completions.create(**kwargs)
                    else:
                        raise e_retry

            msg = response.choices[0].message
            raw_content = (msg.content or "").strip()
            
            # Deepseek uses reasoning_content
            reasoning = getattr(msg, "reasoning_content", getattr(msg, "reasoning", ""))
            if not raw_content and reasoning:
                raw_content = reasoning.strip()

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
            print("DEBUG RAW CONTENT INSIDE EXTRACT:", repr(raw_content))
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
