import sys
import os
from dotenv import load_dotenv

load_dotenv()
sys.path.append(os.path.join(os.path.dirname(__file__), "services", "backoffice_api"))

from services.graph.graph_remapper import graph_remapper

def main():
    print("=========================================")
    print("Starting Comprehensive Graph Re-mapping")
    print("=========================================")
    print("This process will:")
    print("1. Fetch all ingested data from the vector database.")
    print("2. Re-extract entities and relationships using the strict Neo4j schema (Orang, Perusahaan, Telepon).")
    print("3. Re-insert into Neo4j graph database.")
    print("=========================================")
    
    result = graph_remapper.remap_all(clear_existing=True)
    print("\n--- Mapping Results ---")
    print(f"Status: {result.get('status')}")
    print(f"Chunks Processed: {result.get('chunks_processed')}")
    print(f"Entities Created: {result.get('entities_created')}")
    print(f"Relationships Created: {result.get('relationships_created')}")
    if "message" in result:
        print(f"Message: {result['message']}")

if __name__ == "__main__":
    main()
