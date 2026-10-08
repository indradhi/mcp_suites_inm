import json

raw = """{
  "entities": [
    {"name": "3603280910810007", "type": "Orang", "description": "INDRADHI NUGRAHA MULYANTO, lahir Jakarta 1981-10-08"},
    {"name": "MULYATI", "type": "Orang", "description": "Ibu kandung INDRADHI NUGRAHA MULYANTO"},
    {"name": "SIRDADI MULYANTO", "type": "Orang", "description": "Ayah kandung INDRADHI NUGRAHA MULYANTO"},
    {"name": "JL.TAMAN BOROBUDUR 1", "type": "Location", "description": "Alamat KTP di Bencongan, Kelapa Dua, Tangerang"},
    {"name": "3603281409090014", "type": "Document", "description": "Nomor Kartu Keluarga (KK)"},
    {"name": "JAKARTA", "type": "Location", "description": "Tempat lahir"},
    {"name": "BENCONGAN", "type": "Location", "description": "Kelurahan"},
    {"name": "TANGERANG", "type": "Location", "description": "Kabupaten"},
    {"name": "BANTEN", "type": "Location", "description": "Provinsi"},
    {"name": "Karyawan Swasta", "type": "Concept", "description": "Pekerjaan"},
    {"name": "Islam", "type": "Concept", "description": "Agama"}
  ],
  "relationships": [
    {"source": "3603280910810007", "relation": "IBU", "target": "MULYATI", "properties": {"context": "Ibu kandung"}},
    {"source": "3603280910810007", "relation": "AYAH", "target": "SIRDADI MULYANTO", "properties": {"context": "Ayah kandung"}},
    {"source": "3603280910810007", "relation": "ALAMAT_KTP", "target": "JL.TAMAN BOROBUDUR 1", "properties": {"context": "Alamat KTP, RT 4 RW 4"}},
    {"source": "3603280910810007", "relation": "LAHIR_DI", "target": "JAKARTA", "properties": {"context": "Tempat lahir"}},
    {"source": "3603280910810007", "relation": "MEMILIKI_DOKUMEN", "target": "3603281409090014", "properties": {"context": "Nomor Kartu Keluarga"}},
    {"source": "3603280910810007", "relation": "RELATED_TO", "target": "Karyawan Swasta", "properties": {"context": "Pekerjaan"}},
    {"source": "3603280910810007", "relation": "RELATED_TO", "target": "Islam", "properties": {"context": "Agama"}},
    {"source": "JL.TAMAN BOROBUDUR 1", "relation": "BERADA_DI", "target": "BENCONGAN", "properties": {"context": "Kelurahan"}},
    {"source": "BENCONGAN", "relation": "BERADA_DI", "target": "TANGERANG", "properties": {"context": "Kabupaten"}},
    {"source": "TANGERANG", "relation": "BERADA_DI", "target": "BANTEN", "properties": {"context": "Provinsi"}}
  ]
}"""

import sys
import os
sys.path.append(os.path.dirname(__file__))

from services.backoffice_api.services.llm_service import llm_service

# Monkey patch get_task_backend and get_client so it doesn't do a real call
class MockClient:
    class chat:
        class completions:
            @staticmethod
            def create(*args, **kwargs):
                class Msg:
                    content = raw
                class Choice:
                    message = Msg()
                class Resp:
                    choices = [Choice()]
                return Resp()

llm_service.get_client = lambda *args: MockClient()
llm_service.get_task_backend = lambda *args: ("mock", "mock", "mock")

out = llm_service.extract_entities_and_relations("dummy text", db=None)
print("FINAL RETURN:", out)
