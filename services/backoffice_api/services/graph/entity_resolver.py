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
        name_val = entity.get("name") or entity.get("id") or ""
        norm_name = EntityResolver.normalize_name(str(name_val))
        
        entity_type_raw = str(entity.get("type", "UNKNOWN")).strip()
        t_upper = entity_type_raw.upper()
        
        if t_upper == "ORANG":
            entity_type = "Orang"
        elif t_upper == "PERUSAHAAN":
            entity_type = "Perusahaan"
        elif t_upper in ["TELEPON", "MSISDN"]:
            entity_type = "Telepon"
        elif t_upper == "REKENING":
            entity_type = "Rekening"
        elif t_upper == "NAMA":
            entity_type = "Nama"
        elif t_upper == "DOKUMEN":
            entity_type = "Dokumen"
        elif t_upper in ["ASET", "TANAH", "RANMOR", "KENDARAAN", "PROPERTI", "BANGUNAN"]:
            entity_type = "Aset"
        elif t_upper in ["LOKASI", "ALAMAT", "TEMPAT"]:
            entity_type = "Lokasi"
        else:
            entity_type = entity_type_raw.title() if entity_type_raw else "UNKNOWN"
            
        return {
            "name": norm_name,
            "type": entity_type,
            "description": str(entity.get("description", "")).strip()
        }

entity_resolver = EntityResolver()
