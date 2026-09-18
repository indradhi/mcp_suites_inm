from database import SessionLocal
from models.user import User
from models.orchestration_flow import OrchestrationFlow
from models.knowledge_source import KnowledgeSource
from services.flow_orchestrator import flow_orchestrator

db = SessionLocal()
try:
    flows = db.query(OrchestrationFlow).all()
    print(f"Total flows in DB: {len(flows)}")
    for f in flows:
        print(f"- [{f.id}] {f.name} (Intent: {f.intent_category}, Steps: {len(f.steps or [])})")
        print(f"  Validity Rule: {f.validity_priority_rule}")

    print("\n--- Test Flow Matching ---")
    test_queries = [
        "Tolong carikan profil lengkap NIK 3174051208850001 dan aset yang dia miliki",
        "Cek sertifikat tanah SHM No 12345 atas nama Bambang di Jakarta Selatan",
        "Analisis hubungan kepemilikan PT Maju Mundur dengan tersangka korupsi",
        "Bagaimana regulasi UU Tipikor pasal 12B tentang gratifikasi?"
    ]

    for q in test_queries:
        match_res = flow_orchestrator.match_flow_for_prompt(q, db)
        print(f"\nPrompt: '{q}'")
        print(f"-> Matched: {match_res.get('matched')}, Flow: {match_res.get('flow_name')}, Score: {match_res.get('match_score')}")
        print(f"   Guidance: {match_res.get('procedural_guidance')}")

    print("\n--- Check Knowledge Sources Validity Metadata ---")
    sources = db.query(KnowledgeSource).limit(5).all()
    for s in sources:
        conf = s.config or {}
        v_tier = conf.get("validity_tier") or ("authoritative" if s.source_type in ["database", "api"] and (conf.get("is_tool") or conf.get("parameters")) else "secondary")
        v_score = conf.get("validity_score") or (95 if v_tier == "authoritative" else (85 if v_tier == "verified" else (65 if v_tier == "secondary" else 45)))
        print(f"- {s.name} ({s.source_type}) -> Tier: {v_tier}, Score: {v_score}")

finally:
    db.close()
