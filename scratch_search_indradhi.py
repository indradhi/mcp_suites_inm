import os
import sys

# Ensure backend directory is in path to import modules
sys.path.append(os.path.join(os.getcwd(), 'services', 'backoffice_api'))

import chromadb

def main():
    try:
        client = chromadb.HttpClient(host='localhost', port=8000)
        collection = client.get_collection("knowledge_chunks")
        results = collection.get(
            where_document={"$contains": "Indradhi"},
            include=["documents", "metadatas"]
        )
        if not results or not results['ids']:
            print("No results found for Indradhi")
            return
            
        for i, doc_id in enumerate(results['ids']):
            print(f"--- Result {i+1} ---")
            print(f"ID: {doc_id}")
            print(f"Metadata: {results['metadatas'][i]}")
            print(f"Document: {results['documents'][i][:500]}")
            print("-" * 50)
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
