import sys
import os
from dotenv import load_dotenv

load_dotenv()
sys.path.append(os.path.dirname(__file__))

from services.vector_store import vector_store
from services.llm_service import llm_service
from database import SessionLocal

db = SessionLocal()
collection = vector_store.get_collection()
res = collection.get(limit=2)
docs = res.get("documents", [])

for i, doc in enumerate(docs):
    print(f"--- Chunk {i+1} ---")
    print("Sending to LLM...")
    
    # We want to see raw output from deepseek
    api_base, api_key, model = llm_service.get_task_backend("entity_extraction", db)
    client = llm_service.get_client(api_base, api_key)
    prompt = f"""You are an expert Knowledge Graph Information Extraction system.
Analyze the following text and extract significant entities and the relationships between them.

# Entity Guidelines (STRICTLY FOLLOW THESE RULES):
1. "Orang" (Person): MUST be uniquely identified by NIK if available (use NIK as the entity `name`). If NIK is unknown, use their full name. Node Type: "Orang".
2. "Perusahaan" (Company/Organization): Uniquely identified by its Name (e.g., PT, CV, Yayasan). Node Type: "Perusahaan".
3. "Telepon" (Phone Number): Uniquely identified by MSISDN. Node Type: "Telepon".
4. Other entities can be LOCATION, DOCUMENT, CONCEPT, etc.

# Relationship Guidelines (USE EXACT RELATION NAMES IF APPLICABLE):
1. "Orang" -> "Orang" (Family): ISTRI, ANAK, SUAMI, AYAH, IBU.
2. "Orang" -> "Orang" (Social): TEMAN, REKAN_BISNIS.
3. "Orang" -> "Location/Address": ALAMAT_KTP, DOMISILI.
4. "Orang" -> "Telepon": MEMILIKI_TELEPON.
5. "Orang" -> "Perusahaan": BEKERJA_SEBAGAI, PEMILIK, PESAHAM, PENANGGUNG_JAWAB, PENERIMA_MANFAAT.
6. "Perusahaan" -> "Orang" or "Perusahaan": PEMILIK, PESAHAM, PENANGGUNG_JAWAB, PENERIMA_MANFAAT.
7. "Telepon" -> "Telepon": MENGHUBUNGI_TELEPON, MENGHUBUNGI_SMS, WA_CHAT, VOICE.
8. "Telepon" -> "Location/IP/Web": IPDR.
9. You may use generic relationships (RELATED_TO, etc.) if they do not fit the above.

Focus on the top 8-12 most significant entities and up to 10 relationships.
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
{doc[:2500]}
\"\"\"
"""
    
    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}]
    )
    msg = response.choices[0].message
    print("RAW LLM OUTPUT:")
    print(msg.content)
    
    # Also test the actual function
    extracted = llm_service.extract_entities_and_relations(doc, db=db)
    print("\nPARSED OUTPUT:")
    print(extracted)
    print("="*40)
    
db.close()
