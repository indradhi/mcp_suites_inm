import urllib.request
import urllib.error
import json

url = "http://localhost:8002/api/graph/remap?clear_existing=true"
req = urllib.request.Request(url, method="POST")

try:
    with urllib.request.urlopen(req) as response:
        print("Status:", response.status)
        print("Response:", response.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print("HTTP Error:", e.code)
    print("Error body:", e.read().decode('utf-8'))
except Exception as e:
    print("Exception:", e)
