import asyncio
import httpx
import json

BASE_URL = "http://mcp_nginx:80"
# Atau bisa diganti dengan "http://togian.internal.domain:8092"
API_KEY = "mcp_df2a74914275848566234169d00943583ea9c856163dd669ba67658f73ce36e5"

HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

async def test_rpc(client):
    print("--------------------------------------------------")
    print(f"Testing /rpc endpoint...")
    url = f"{BASE_URL}/rpc"
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/list"
    }
    try:
        response = await client.post(url, headers=HEADERS, json=payload, timeout=10.0)
        print(f"Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            if "result" in data and "tools" in data["result"]:
                print(f"Success! Retrieved {len(data['result']['tools'])} tools.")
            else:
                print(f"Response: {data}")
        else:
            print(f"Response: {response.text}")
    except Exception as e:
        print(f"Error connecting to /rpc: {e}")

async def test_mcp(client):
    print("--------------------------------------------------")
    print(f"Testing /mcp endpoint (Native MCP SSE)...")
    url = f"{BASE_URL}/mcp"
    try:
        # Request stream to see if it connects
        async with client.stream("GET", url, headers=HEADERS, timeout=10.0) as response:
            print(f"Status: {response.status_code}")
            if response.status_code == 200:
                print(f"Headers: {response.headers.get('content-type', '')}")
                # Try to read the first chunk to ensure SSE is active
                async for chunk in response.aiter_text():
                    if chunk:
                        print(f"Received data: {chunk.strip()}")
                        break
            else:
                print(f"Response: {await response.aread()}")
    except Exception as e:
        print(f"Error connecting to /mcp: {e}")

async def test_sse(client):
    print("--------------------------------------------------")
    print(f"Testing /sse endpoint (OpenWebUI SSE)...")
    url = f"{BASE_URL}/sse"
    try:
        async with client.stream("GET", url, headers=HEADERS, timeout=10.0) as response:
            print(f"Status: {response.status_code}")
            if response.status_code == 200:
                print(f"Headers: {response.headers.get('content-type', '')}")
                async for chunk in response.aiter_text():
                    if chunk:
                        print(f"Received data: {chunk.strip()}")
                        break
            else:
                print(f"Response: {await response.aread()}")
    except Exception as e:
        print(f"Error connecting to /sse: {e}")

async def main():
    print(f"Testing connections to {BASE_URL} with API Key...")
    async with httpx.AsyncClient(verify=False) as client:
        await test_rpc(client)
        await test_mcp(client)
        await test_sse(client)
    print("--------------------------------------------------")

if __name__ == "__main__":
    asyncio.run(main())
