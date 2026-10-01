import json
with open('scratch/OpenAI API.postman_collection.json', encoding='utf-8') as f:
    data = json.load(f)

def find_all(items, results=None):
    if results is None: results = []
    for item in items:
        name = item.get('name', '')
        if 'item' in item:
            find_all(item['item'], results)
        elif 'request' in item:
            req = item['request']
            body = (req.get('body') or {}).get('raw', '')
            results.append({'name': name, 'method': req.get('method'), 'body': body})
    return results

all_reqs = find_all(data['item'])
keywords = ['response_format', 'stream', 'logprob', 'vision', 'structured', 'presence_penalty', 'frequency_penalty', 'top_p', 'seed', 'max_completion']
for r in all_reqs:
    body = r['body']
    hits = [k for k in keywords if k in body]
    if hits:
        name = r['name']
        print(f'=== {name} ({hits}) ===')
        print(body[:600])
        print()
