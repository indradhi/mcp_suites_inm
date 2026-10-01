import re

with open('services/mcp_server/main.py', encoding='utf-8') as f:
    src = f.read()

# Find Tool objects in list_tools handler
tool_blocks = re.findall(r'Tool\(\s*name=["\']([^"\']+)["\'],\s*description=["\']([^"\']+)["\']', src, re.DOTALL)
print('=== MCP Tools ===')
for name, desc in tool_blocks:
    print(f'  {name}: {desc[:80]}')

# Find dynamic tool endpoints
endpoints = re.findall(r'@app\.(?:get|post|put|delete)\(["\']([^"\']+)["\']', src)
print('\n=== MCP Server Endpoints ===')
for e in endpoints:
    print(f'  {e}')
