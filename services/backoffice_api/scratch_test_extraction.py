import os
import sys

# Ensure backend directory is in path
sys.path.append(os.path.join(os.getcwd(), 'services', 'backoffice_api'))

from services.ingestion.bank_data_saver import normalize_tool_data, extract_structured_entities_and_relations

class MockSource:
    def __init__(self):
        self.name = "MCP Togian"

def main():
    raw_data = {
        "tool": "cari_pemilik_tanah_bpn",
        "source_id": 12,
        "success": True,
        "status_code": 200,
        "arguments": {"nama": "indradhi nugraha mulyanto"},
        "data": {
            "combinedResults": [
                {
                    "pemilik": [
                        {
                            "pemilikid": "CE0B9698CD181253E0530B1D140AFAB8", 
                            "nama": "INDRADHI NUGRAHA MULYANTO", 
                            "alamat": "JL TAMAN BOROBUDUR"
                        }
                    ],
                    "result": [
                        {
                            "dokumenhakid": "9EBE9FC4D9F045E1E0530C1D140A8A4B",
                            "persilid": "9DB8067C32E9A967E0530B1D140A0AF6",
                            "kabupaten": "Cianjur",
                            "kecamatan": "Cilaku",
                            "desa": "Sirnagalih",
                            "jenishak": "Hak Guna Bangunan",
                            "nomor_hak": "12345"
                        }
                    ]
                }
            ]
        }
    }
    
    norm_records = normalize_tool_data(raw_data)
    print("Normalized Records:")
    print(norm_records)
    print("-" * 50)
    
    source = MockSource()
    for i, record in enumerate(norm_records):
        print(f"Record {i+1}:")
        ents, rels = extract_structured_entities_and_relations(record, source, {})
        print("Entities:", ents)
        print("Relationships:", rels)
        print("-" * 50)

if __name__ == "__main__":
    main()
