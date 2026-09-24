import os
import sys

import chromadb

def main():
    try:
        client = chromadb.HttpClient(host='mcp_chromadb', port=8000)
        collection = client.get_collection("knowledge_base")
        
        # Get all records or a large sample
        results = collection.get(limit=5000, include=["documents", "metadatas"])
        
        if not results or not results['ids']:
            print("Collection is empty")
            return
            
        found = False
        for i, doc in enumerate(results['documents']):
            if "indradhi" in doc.lower():
                found = True
                print(f"--- Result {i+1} ---")
                print(f"ID: {results['ids'][i]}")
                print(f"Metadata: {results['metadatas'][i]}")
                print(f"Document: {doc[:500]}")
                print("-" * 50)
                
        if not found:
            print("No results found for indradhi case-insensitively in the first 5000 records")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
