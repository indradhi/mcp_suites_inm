import sys
import os
from dotenv import load_dotenv

load_dotenv()
sys.path.append(os.path.dirname(__file__))

from services.vector_store import vector_store

collection = vector_store.get_collection()
res = collection.get(limit=10)
docs = res.get("documents", [])
for i, d in enumerate(docs):
    print(f"--- Chunk {i+1} ---")
    print(repr(d[:200]))
