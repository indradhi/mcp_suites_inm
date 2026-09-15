import re
from typing import Dict, Any

class EntityResolver:
    @staticmethod
    def normalize_name(name: str) -> str:
        if not name:
            return ""
        clean = name.strip()
        # Remove trailing periods, common honorifics or legal suffixes if appropriate
        clean = re.sub(r"\s+", " ", clean)
        return clean

    @staticmethod
    def resolve_entity(entity: Dict[str, Any]) -> Dict[str, Any]:
        norm_name = EntityResolver.normalize_name(entity.get("name", ""))
        entity_type = entity.get("type", "UNKNOWN").upper().strip()
        return {
            "name": norm_name,
            "type": entity_type,
            "description": entity.get("description", "").strip()
        }

entity_resolver = EntityResolver()
