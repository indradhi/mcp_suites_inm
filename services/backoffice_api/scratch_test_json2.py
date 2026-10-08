import json

raw = """{
  "entities": [
    {"name": "3603280910810007", "type": "Orang", "description": "INDRADHI NUGRAHA MULYANTO, lahir Jakarta 1981-10-08"}
  ],
  "relationships": []
}"""

import sys
import os
sys.path.append(os.path.dirname(__file__))

from services.llm_service import llm_service

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
