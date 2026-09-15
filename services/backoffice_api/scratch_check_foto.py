from services.ingestion.db_adapters.mongodb_adapter import MongoDBAdapter

adapter = MongoDBAdapter()
config = {
    'host': '192.168.1.30',
    'port': '27017',
    'database': 'dblake',
    'username': 'root',
    'password': '',
    'collection': 'orang_api_dukcapil'
}
recs = adapter.execute_query(config, '{"NAMA_LGKP": "INDRADHI NUGRAHA MULYANTO"}', limit=2)
for r in recs:
    foto = str(r.get('FOTO', ''))
    print('NIK:', r.get('NIK'))
    print('Foto length:', len(foto))
    print('Foto start:', foto[:50])
    print('Foto end:', foto[-50:])
