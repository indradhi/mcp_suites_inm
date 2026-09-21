import os
import re
import json
import time
import asyncio
import logging
from typing import List, Dict, Any, Optional, Tuple
import httpx

logger = logging.getLogger(__name__)


class MCPIngester:
    """
    MCP (Model Context Protocol) Client & Ingester.
    Enables connecting to other MCP servers (either clones of this MCP server,
    or third-party MCP servers like Anthropic, PostgreSQL, GitHub, Brave Search, etc.).

    Supports:
    1. JSON-RPC 2.0 over HTTP (MCP standard: initialize, tools/list, tools/call, resources/list, resources/read).
    2. Server-Sent Events (SSE) endpoint discovery.
    3. Direct REST tool calls (/call_tool, /tools) for fast clone interoperability.
    """

    def _get_verify_ssl(self, config: Dict[str, Any]) -> bool:
        if not config:
            return False
        if "verify_ssl" in config:
            return bool(config["verify_ssl"])
        if "ssl_verify" in config:
            return bool(config["ssl_verify"])
        return False

    def _build_headers(self, config: Dict[str, Any]) -> Dict[str, str]:
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream"
        }
        auth_conf = config.get("auth", {})
        auth_mode = auth_conf.get("mode") or config.get("auth_mode", "none")

        if auth_mode == "bearer" or auth_conf.get("token"):
            token = auth_conf.get("token") or config.get("token") or config.get("bearer_token")
            if token:
                headers["Authorization"] = f"Bearer {token.strip()}"

        elif auth_mode == "api_key":
            api_key = auth_conf.get("api_key") or config.get("api_key")
            header_name = auth_conf.get("header_name") or config.get("header_name") or "X-API-Key"
            if api_key:
                headers[header_name] = api_key.strip()

        elif auth_mode == "custom_headers":
            custom = auth_conf.get("custom_headers") or config.get("custom_headers") or {}
            if isinstance(custom, str):
                try:
                    custom = json.loads(custom)
                except Exception:
                    custom = {}
            if isinstance(custom, dict):
                headers.update(custom)

        # Allow extra root-level headers
        if "headers" in config and isinstance(config["headers"], dict):
            headers.update(config["headers"])

        return headers

    def _resolve_endpoints(self, config: Dict[str, Any]) -> Tuple[str, str, str]:
        """
        Resolves (rpc_url, sse_url, rest_url) from config.
        """
        raw_endpoint = str(config.get("endpoint") or config.get("url") or "http://localhost:8001").strip()
        raw_endpoint = raw_endpoint.rstrip("/")

        transport = config.get("transport", "jsonrpc").lower()

        if raw_endpoint.endswith("/rpc"):
            base_url = raw_endpoint[:-4]
            rpc_url = raw_endpoint
            sse_url = f"{base_url}/sse"
            rest_url = f"{base_url}/call_tool"
        elif raw_endpoint.endswith("/sse"):
            base_url = raw_endpoint[:-4]
            rpc_url = f"{base_url}/rpc"
            sse_url = raw_endpoint
            rest_url = f"{base_url}/call_tool"
        elif raw_endpoint.endswith("/call_tool"):
            base_url = raw_endpoint[:-10]
            rpc_url = f"{base_url}/rpc"
            sse_url = f"{base_url}/sse"
            rest_url = raw_endpoint
        else:
            base_url = raw_endpoint
            rpc_url = f"{base_url}/rpc"
            sse_url = f"{base_url}/sse"
            rest_url = f"{base_url}/call_tool"

        return rpc_url, sse_url, rest_url

    async def _send_jsonrpc(
        self,
        rpc_url: str,
        method: str,
        params: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
        verify_ssl: bool = False,
        timeout: float = 20.0
    ) -> Dict[str, Any]:
        """
        Executes a standard JSON-RPC 2.0 POST request against an MCP server endpoint.
        """
        payload = {
            "jsonrpc": "2.0",
            "id": f"mcp_req_{int(time.time()*1000)}",
            "method": method,
            "params": params or {}
        }
        async with httpx.AsyncClient(timeout=timeout, verify=verify_ssl) as client:
            resp = await client.post(rpc_url, json=payload, headers=headers or {})
            if resp.status_code != 200:
                raise ValueError(f"HTTP {resp.status_code} from MCP server: {resp.text[:500]}")
            data = resp.json()
            if "error" in data and data["error"]:
                err = data["error"]
                err_msg = err.get("message") if isinstance(err, dict) else str(err)
                raise ValueError(f"JSON-RPC Error [{err.get('code', -1)}]: {err_msg}")
            return data.get("result", {})

    async def test_connection(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Tests connection to the target MCP server by:
        1. Calling 'initialize' over JSON-RPC.
        2. Listing available tools ('tools/list').
        3. Attempting REST or SSE probe if direct RPC fails.
        """
        t0 = time.time()
        rpc_url, sse_url, rest_url = self._resolve_endpoints(config)
        headers = self._build_headers(config)
        verify_ssl = self._get_verify_ssl(config)
        transport = config.get("transport", "jsonrpc").lower()

        server_info = {}
        capabilities = {}
        protocol_version = "unknown"
        tools = []
        resources = []
        prompts = []
        connection_mode = "jsonrpc"

        # 1. Primary Attempt: Standard MCP JSON-RPC
        try:
            init_res = await self._send_jsonrpc(
                rpc_url=rpc_url,
                method="initialize",
                params={
                    "protocolVersion": "2024-11-05",
                    "capabilities": {"tools": {}, "resources": {}, "prompts": {}},
                    "clientInfo": {"name": "mcp-backoffice-client", "version": "1.0.0"}
                },
                headers=headers,
                verify_ssl=verify_ssl,
                timeout=12.0
            )
            protocol_version = init_res.get("protocolVersion", "2024-11-05")
            server_info = init_res.get("serverInfo", {})
            capabilities = init_res.get("capabilities", {})

            # Fetch tools
            try:
                tools_res = await self._send_jsonrpc(
                    rpc_url=rpc_url,
                    method="tools/list",
                    params={},
                    headers=headers,
                    verify_ssl=verify_ssl,
                    timeout=10.0
                )
                tools = tools_res.get("tools", [])
            except Exception as te:
                logger.warning(f"tools/list notice on {rpc_url}: {te}")

            # Fetch prompts (optional)
            try:
                prompts_res = await self._send_jsonrpc(
                    rpc_url=rpc_url,
                    method="prompts/list",
                    params={},
                    headers=headers,
                    verify_ssl=verify_ssl,
                    timeout=6.0
                )
                prompts = prompts_res.get("prompts", [])
            except Exception:
                pass

            # Fetch resources (optional)
            try:
                res_res = await self._send_jsonrpc(
                    rpc_url=rpc_url,
                    method="resources/list",
                    params={},
                    headers=headers,
                    verify_ssl=verify_ssl,
                    timeout=6.0
                )
                resources = res_res.get("resources", [])
            except Exception:
                pass

        except Exception as rpc_err:
            logger.info(f"JSON-RPC probe failed ({rpc_err}), trying REST/clone format fallback on {rest_url}...")
            # 2. Fallback Attempt: REST / Clone format (/tools and /health)
            try:
                async with httpx.AsyncClient(timeout=8.0, verify=verify_ssl) as client:
                    base_url = rest_url.replace("/call_tool", "")
                    # Try /tools endpoint
                    resp = await client.get(f"{base_url}/tools", headers=headers)
                    if resp.status_code == 200:
                        t_data = resp.json()
                        tools_raw = t_data.get("tools") or (t_data if isinstance(t_data, list) else [])
                        for tr in tools_raw:
                            if isinstance(tr, dict):
                                fn = tr.get("function", tr)
                                tools.append({
                                    "name": fn.get("name") or tr.get("name"),
                                    "description": fn.get("description") or tr.get("description", ""),
                                    "inputSchema": fn.get("parameters") or tr.get("parameters", {})
                                })
                        server_info = {"name": "mcp-clone-rest", "version": "1.0.0"}
                        connection_mode = "rest"
                    else:
                        raise ValueError(f"REST fallback returned HTTP {resp.status_code}")
            except Exception as rest_err:
                raise ValueError(
                    f"Gagal terhubung ke Server MCP ({rpc_url} / {rest_url}). "
                    f"Detail JSON-RPC: {str(rpc_err)}. Detail REST: {str(rest_err)}"
                )

        latency_ms = int((time.time() - t0) * 1000)
        s_name = server_info.get("name") or "External MCP Server"
        s_ver = server_info.get("version") or "1.0.0"

        normalized_tools = self._normalize_tools(tools)

        tool_execution_result = None
        test_tool_name = config.get("test_tool_name")
        if test_tool_name:
            test_args = config.get("test_arguments") or {}
            tool_execution_result = await self.execute_tool_call(config, test_tool_name, test_args)

        return {
            "success": True,
            "message": f"Koneksi berhasil ke '{s_name}' (v{s_ver}) melalui {connection_mode.upper()}. Terdeteksi {len(normalized_tools)} tools.",
            "server_info": server_info,
            "protocol_version": protocol_version,
            "capabilities": capabilities,
            "connection_mode": connection_mode,
            "tools_count": len(normalized_tools),
            "tools": normalized_tools,
            "resources_count": len(resources),
            "resources": resources,
            "prompts_count": len(prompts),
            "prompts": prompts,
            "tool_execution_result": tool_execution_result,
            "latency_ms": latency_ms
        }

    def _normalize_tools(self, tools_raw: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Normalizes various MCP tool structures into standard internal tool metadata format.
        """
        results = []
        for t in tools_raw:
            if not isinstance(t, dict):
                continue
            name = t.get("name")
            if not name:
                continue
            desc = t.get("description") or f"Tool {name}"
            raw_schema = t.get("inputSchema") or t.get("parameters") or {}
            
            # Extract parameters list for UI display and query construction
            params_list = []
            properties = raw_schema.get("properties", {}) if isinstance(raw_schema, dict) else {}
            required_keys = set(raw_schema.get("required", [])) if isinstance(raw_schema, dict) else set()

            for p_k, p_v in properties.items():
                if isinstance(p_v, dict):
                    params_list.append({
                        "name": p_k,
                        "type": p_v.get("type", "string"),
                        "description": p_v.get("description", ""),
                        "required": p_k in required_keys,
                        "default": p_v.get("default")
                    })
                else:
                    params_list.append({
                        "name": p_k,
                        "type": "string",
                        "description": "",
                        "required": p_k in required_keys
                    })

            results.append({
                "name": name,
                "title": name.replace("_", " ").title(),
                "description": desc,
                "parameters": params_list,
                "input_schema": raw_schema,
                "is_enabled": t.get("is_enabled", True)
            })
        return results

    async def fetch_tools(self, config: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Retrieves live list of tools from remote MCP server.
        Uses cached tools in config if server is temporarily unreachable.
        """
        try:
            res = await self.test_connection(config)
            if res.get("success") and res.get("tools"):
                return res["tools"]
        except Exception as e:
            logger.warning(f"Failed to fetch live tools from MCP server ({config.get('endpoint')}): {e}")

        # Fallback to tools saved in config
        saved = config.get("tools") or []
        return self._normalize_tools(saved)

    async def execute_tool_call(
        self,
        config: Dict[str, Any],
        tool_name: str,
        arguments: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Dispatches a tool execution call to the remote MCP server via:
        1. JSON-RPC: method="tools/call", params={"name": tool_name, "arguments": arguments}
        2. REST Fallback: POST /call_tool, json={"name": tool_name, "arguments": arguments}
        """
        t0 = time.time()
        rpc_url, sse_url, rest_url = self._resolve_endpoints(config)
        headers = self._build_headers(config)
        verify_ssl = self._get_verify_ssl(config)
        transport = config.get("transport", "jsonrpc").lower()

        clean_tool_name = tool_name
        # Match original tool name from config tools list if mapped
        for saved_t in config.get("tools", []):
            s_name = saved_t.get("name")
            if s_name and (s_name == tool_name or tool_name.endswith(f"_{s_name}")):
                clean_tool_name = s_name
                break

        exec_res = None
        images = []
        text_content = ""
        structured_data = None

        if transport != "rest":
            try:
                # 1. Standard MCP tools/call
                call_res = await self._send_jsonrpc(
                    rpc_url=rpc_url,
                    method="tools/call",
                    params={
                        "name": clean_tool_name,
                        "arguments": arguments or {}
                    },
                    headers=headers,
                    verify_ssl=verify_ssl,
                    timeout=float(config.get("timeout", 45.0))
                )
                content_blocks = call_res.get("content", [])
                text_parts = []
                for b in content_blocks:
                    if isinstance(b, dict):
                        b_type = b.get("type")
                        if b_type == "text":
                            text_parts.append(b.get("text", ""))
                        elif b_type == "image":
                            images.append({
                                "data": b.get("data"),
                                "mimeType": b.get("mimeType", "image/jpeg")
                            })
                    elif isinstance(b, str):
                        text_parts.append(b)

                text_content = "\n".join(text_parts)
                # Try parsing text as JSON data
                if text_content.strip().startswith("{") or text_content.strip().startswith("["):
                    try:
                        structured_data = json.loads(text_content)
                    except Exception:
                        structured_data = text_content
                else:
                    structured_data = text_content

                exec_res = call_res
            except Exception as rpc_err:
                logger.info(f"tools/call JSON-RPC failed ({rpc_err}), trying REST fallback...")

        # 2. REST Fallback (/call_tool)
        if exec_res is None:
            async with httpx.AsyncClient(timeout=float(config.get("timeout", 45.0)), verify=verify_ssl) as client:
                resp = await client.post(
                    rest_url,
                    json={"name": clean_tool_name, "arguments": arguments or {}},
                    headers=headers
                )
                if resp.status_code != 200:
                    raise ValueError(f"Remote MCP execution error (HTTP {resp.status_code}): {resp.text[:500]}")
                data = resp.json()
                structured_data = data
                text_content = json.dumps(data, ensure_ascii=False) if isinstance(data, (dict, list)) else str(data)
                if isinstance(data, dict) and "_mcp_images" in data:
                    images.extend(data.get("_mcp_images", []))

        latency_ms = int((time.time() - t0) * 1000)

        return {
            "success": True,
            "tool": clean_tool_name,
            "data": structured_data,
            "text": text_content,
            "images": images,
            "latency_ms": latency_ms,
            "endpoint": rpc_url
        }

    def execute_tool_call_sync(
        self,
        config: Dict[str, Any],
        tool_name: str,
        arguments: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Synchronous wrapper for Celery worker and synchronous orchestrators.
        """
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor() as pool:
                    return pool.submit(
                        asyncio.run,
                        self.execute_tool_call(config, tool_name, arguments)
                    ).result()
            else:
                return loop.run_until_complete(
                    self.execute_tool_call(config, tool_name, arguments)
                )
        except RuntimeError:
            return asyncio.run(self.execute_tool_call(config, tool_name, arguments))

    async def extract_knowledge(self, config: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Extracts searchable knowledge resources from the remote MCP server for vector indexing in ChromaDB.
        Retrieves:
        1. resources/list and resources/read (MCP standard resources)
        2. prompts/list descriptions
        3. Catalog of supported tools and parameter dictionaries
        """
        rpc_url, sse_url, rest_url = self._resolve_endpoints(config)
        headers = self._build_headers(config)
        verify_ssl = self._get_verify_ssl(config)
        chunks = []

        # 1. Extract MCP Resources
        try:
            res_list = await self._send_jsonrpc(
                rpc_url=rpc_url,
                method="resources/list",
                params={},
                headers=headers,
                verify_ssl=verify_ssl,
                timeout=15.0
            )
            resources = res_list.get("resources", [])
            for r in resources:
                r_uri = r.get("uri")
                r_name = r.get("name") or r_uri
                r_desc = r.get("description", "")
                if not r_uri:
                    continue

                # Read resource contents
                try:
                    read_res = await self._send_jsonrpc(
                        rpc_url=rpc_url,
                        method="resources/read",
                        params={"uri": r_uri},
                        headers=headers,
                        verify_ssl=verify_ssl,
                        timeout=20.0
                    )
                    contents = read_res.get("contents", [])
                    res_texts = []
                    for c in contents:
                        if isinstance(c, dict):
                            t = c.get("text") or c.get("blob")
                            if t:
                                res_texts.append(str(t))
                    full_res_text = "\n".join(res_texts).strip()
                    if full_res_text:
                        chunks.append({
                            "text": f"MCP RESOURCE [{r_name}] ({r_uri}):\nDeskripsi: {r_desc}\n\nKonten:\n{full_res_text}",
                            "metadata": {
                                "resource_uri": r_uri,
                                "resource_name": r_name,
                                "type": "mcp_resource"
                            }
                        })
                except Exception as read_err:
                    logger.warning(f"Failed reading resource {r_uri}: {read_err}")
                    chunks.append({
                        "text": f"MCP RESOURCE METADATA [{r_name}] ({r_uri}):\n{r_desc}",
                        "metadata": {"resource_uri": r_uri, "type": "mcp_resource_meta"}
                    })
        except Exception as re_err:
            logger.info(f"resources/list not supported or empty on {rpc_url}: {re_err}")

        # 2. Extract Tools Catalog as Searchable Knowledge Chunks
        try:
            tools = await self.fetch_tools(config)
            if tools:
                tool_summaries = []
                for t in tools:
                    param_desc = ", ".join([f"{p['name']} ({p.get('type','str')})" for p in t.get("parameters", [])])
                    tool_summaries.append(
                        f"ALAT / TOOL: {t['name']}\n"
                        f"Deskripsi: {t.get('description', '')}\n"
                        f"Parameter: [{param_desc}]\n"
                    )
                chunks.append({
                    "text": (
                        f"KATALOG ALAT & FUNGSI SERVER MCP:\n"
                        f"Endpoint: {rpc_url}\n"
                        f"Jumlah Alat: {len(tools)}\n\n"
                        + "\n---\n".join(tool_summaries)
                    ),
                    "metadata": {
                        "type": "mcp_tools_catalog",
                        "tools_count": len(tools)
                    }
                })
        except Exception as te_err:
            logger.warning(f"Error indexing tools catalog from MCP: {te_err}")

        return chunks


mcp_ingester = MCPIngester()
