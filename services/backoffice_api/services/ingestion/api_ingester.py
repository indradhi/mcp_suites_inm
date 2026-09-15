import logging
from typing import List, Dict, Any, Optional
import httpx

logger = logging.getLogger(__name__)

class APIIngester:
    async def get_bearer_token(self, auth_config: Dict[str, Any]) -> Optional[str]:
        """
        Supports dynamic token acquisition:
        - static: returns token directly
        - oauth2 / token_url: sends credentials to obtain dynamic token
        """
        mode = auth_config.get("mode", "static")
        if mode == "static":
            return auth_config.get("token")

        elif mode in ["oauth2", "token_endpoint"]:
            token_url = auth_config.get("token_url")
            payload = auth_config.get("payload", {})
            headers = auth_config.get("headers", {})

            if not token_url:
                raise ValueError("token_url is required for dynamic token acquisition")

            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(token_url, json=payload, headers=headers)
                resp.raise_for_status()
                data = resp.json()
                # Search common token fields
                token = data.get("access_token") or data.get("token") or data.get("id_token")
                if not token:
                    raise ValueError(f"Token field not found in response: {list(data.keys())}")
                return token

        return None

    async def fetch_and_extract(self, config: Dict[str, Any]) -> List[Dict[str, Any]]:
        endpoint = config.get("endpoint")
        method = config.get("method", "GET").upper()
        headers = config.get("headers", {}).copy()
        params = config.get("params", {})
        body = config.get("body", None)

        auth_config = config.get("auth", {})
        if auth_config:
            token = await self.get_bearer_token(auth_config)
            if token:
                headers["Authorization"] = f"Bearer {token}"

        async with httpx.AsyncClient(timeout=30.0) as client:
            if method == "GET":
                response = await client.get(endpoint, headers=headers, params=params)
            else:
                response = await client.post(endpoint, headers=headers, params=params, json=body)
            response.raise_for_status()
            data = response.json()

        results = []
        # If response is a list of items
        if isinstance(data, list):
            batch_size = 15
            for i in range(0, len(data), batch_size):
                batch = data[i:i+batch_size]
                lines = [f"API Source: {endpoint} | Total Items: {len(data)}"]
                for item_idx, item in enumerate(batch, start=i+1):
                    if isinstance(item, dict):
                        fields = [f"{k}: {v}" for k, v in item.items() if not isinstance(v, (dict, list))]
                        lines.append(f"Item {item_idx}: " + " | ".join(fields))
                    else:
                        lines.append(f"Item {item_idx}: {item}")

                results.append({
                    "chunk_index": (i // batch_size) + 1,
                    "text": "\n".join(lines),
                    "metadata": {
                        "endpoint": endpoint,
                        "batch": (i // batch_size) + 1
                    }
                })
        else:
            # Single object or nested dict
            lines = [f"API Source: {endpoint}"]
            for k, v in data.items():
                if isinstance(v, (str, int, float, bool)):
                    lines.append(f"{k}: {v}")
                elif isinstance(v, list) and v and isinstance(v[0], dict):
                    lines.append(f"\nSection {k}:")
                    for sub in v[:20]:
                        sub_str = ", ".join([f"{sk}: {sv}" for sk, sv in sub.items() if isinstance(sv, (str, int, float, bool))])
                        lines.append(f" - {sub_str}")

            results.append({
                "chunk_index": 1,
                "text": "\n".join(lines),
                "metadata": {"endpoint": endpoint}
            })

        return results

    async def execute_tool_call(self, config: Dict[str, Any], arguments: Dict[str, Any]) -> Dict[str, Any]:
        """
        Executes an on-demand API tool call with parameter mapping:
        - Path params: replaces {param} in endpoint URL
        - Query params: adds to query params dict
        - Body params: adds to json body
        - Header params: adds to custom headers
        Returns structured execution dictionary with status_code, data, text_summary, and latency.
        """
        import time
        import json
        start_time = time.time()
        endpoint = config.get("endpoint", "")
        method = config.get("method", "GET").upper()
        headers = config.get("headers", {}).copy()
        parameters_def = config.get("parameters", [])

        query_params = {}
        body_params = {}
        param_specs = {p.get("name"): p for p in parameters_def if p.get("name")}

        # Process passed arguments
        for arg_name, arg_val in (arguments or {}).items():
            spec = param_specs.get(arg_name, {})
            loc = spec.get("in", "query").lower()
            
            if loc == "path" or f"{{{arg_name}}}" in endpoint:
                endpoint = endpoint.replace(f"{{{arg_name}}}", str(arg_val))
            elif loc == "header":
                headers[arg_name] = str(arg_val)
            elif loc == "body":
                body_params[arg_name] = arg_val
            else:
                query_params[arg_name] = arg_val

        # Fill defaults for missing parameters
        for p in parameters_def:
            p_name = p.get("name")
            if p_name and p_name not in (arguments or {}) and "default" in p and p["default"] is not None and str(p["default"]).strip() != "":
                loc = p.get("in", "query").lower()
                def_val = p["default"]
                if loc == "path" and f"{{{p_name}}}" in endpoint:
                    endpoint = endpoint.replace(f"{{{p_name}}}", str(def_val))
                elif loc == "header" and p_name not in headers:
                    headers[p_name] = str(def_val)
                elif loc == "body" and p_name not in body_params:
                    body_params[p_name] = def_val
                elif loc == "query" and p_name not in query_params:
                    query_params[p_name] = def_val

        # Check required params
        for p in parameters_def:
            if p.get("required") and p.get("name") not in (arguments or {}) and (p.get("default") is None or str(p.get("default", "")).strip() == ""):
                raise ValueError(f"Missing required parameter '{p.get('name')}'")

        # Handle Auth
        auth_config = config.get("auth", {})
        if auth_config:
            token = await self.get_bearer_token(auth_config)
            if token:
                headers["Authorization"] = f"Bearer {token}"

        req_json = None
        if method in ["POST", "PUT", "PATCH"]:
            body_template = config.get("body_template")
            if body_template and isinstance(body_template, str) and body_template.strip():
                templated_body = body_template
                for k, v in (arguments or {}).items():
                    templated_body = templated_body.replace(f"{{{k}}}", json.dumps(v) if isinstance(v, (dict, list)) else str(v))
                try:
                    req_json = json.loads(templated_body)
                except Exception:
                    req_json = body_params or None
            else:
                req_json = body_params if body_params else (arguments if method == "POST" and not query_params else None)

        async with httpx.AsyncClient(timeout=30.0) as client:
            if method == "GET":
                response = await client.get(endpoint, headers=headers, params=query_params)
            elif method == "POST":
                response = await client.post(endpoint, headers=headers, params=query_params, json=req_json)
            elif method == "PUT":
                response = await client.put(endpoint, headers=headers, params=query_params, json=req_json)
            elif method == "DELETE":
                response = await client.delete(endpoint, headers=headers, params=query_params)
            else:
                response = await client.request(method, endpoint, headers=headers, params=query_params, json=req_json)

        latency_ms = int((time.time() - start_time) * 1000)
        try:
            resp_data = response.json()
        except Exception:
            resp_data = response.text

        if isinstance(resp_data, (dict, list)):
            text_repr = json.dumps(resp_data, indent=2, ensure_ascii=False)
        else:
            text_repr = str(resp_data)

        return {
            "success": response.is_success,
            "status_code": response.status_code,
            "endpoint": endpoint,
            "method": method,
            "arguments": arguments,
            "latency_ms": latency_ms,
            "data": resp_data,
            "text": text_repr[:10000]
        }

    def execute_tool_call_sync(self, config: Dict[str, Any], arguments: Dict[str, Any]) -> Dict[str, Any]:
        """
        Synchronous on-demand API tool call execution.
        """
        import time
        import json
        start_time = time.time()
        endpoint = config.get("endpoint", "")
        method = config.get("method", "GET").upper()
        headers = config.get("headers", {}).copy()
        parameters_def = config.get("parameters", [])

        query_params = {}
        body_params = {}
        param_specs = {p.get("name"): p for p in parameters_def if p.get("name")}

        for arg_name, arg_val in (arguments or {}).items():
            spec = param_specs.get(arg_name, {})
            loc = spec.get("in", "query").lower()
            if loc == "path" or f"{{{arg_name}}}" in endpoint:
                endpoint = endpoint.replace(f"{{{arg_name}}}", str(arg_val))
            elif loc == "header":
                headers[arg_name] = str(arg_val)
            elif loc == "body":
                body_params[arg_name] = arg_val
            else:
                query_params[arg_name] = arg_val

        for p in parameters_def:
            p_name = p.get("name")
            if p_name and p_name not in (arguments or {}) and "default" in p and p["default"] is not None and str(p["default"]).strip() != "":
                loc = p.get("in", "query").lower()
                def_val = p["default"]
                if loc == "path" and f"{{{p_name}}}" in endpoint:
                    endpoint = endpoint.replace(f"{{{p_name}}}", str(def_val))
                elif loc == "header" and p_name not in headers:
                    headers[p_name] = str(def_val)
                elif loc == "body" and p_name not in body_params:
                    body_params[p_name] = def_val
                elif loc == "query" and p_name not in query_params:
                    query_params[p_name] = def_val

        for p in parameters_def:
            if p.get("required") and p.get("name") not in (arguments or {}) and (p.get("default") is None or str(p.get("default", "")).strip() == ""):
                raise ValueError(f"Missing required parameter '{p.get('name')}'")

        auth_config = config.get("auth", {})
        if auth_config:
            mode = auth_config.get("mode", "static")
            if mode == "static":
                token = auth_config.get("token")
                if token:
                    headers["Authorization"] = f"Bearer {token}"
            elif mode in ["oauth2", "token_endpoint"]:
                token_url = auth_config.get("token_url")
                if token_url:
                    with httpx.Client(timeout=15.0) as client:
                        resp = client.post(token_url, json=auth_config.get("payload", {}), headers=auth_config.get("headers", {}))
                        if resp.is_success:
                            data = resp.json()
                            token = data.get("access_token") or data.get("token") or data.get("id_token")
                            if token:
                                headers["Authorization"] = f"Bearer {token}"

        req_json = None
        if method in ["POST", "PUT", "PATCH"]:
            body_template = config.get("body_template")
            if body_template and isinstance(body_template, str) and body_template.strip():
                templated_body = body_template
                for k, v in (arguments or {}).items():
                    templated_body = templated_body.replace(f"{{{k}}}", json.dumps(v) if isinstance(v, (dict, list)) else str(v))
                try:
                    req_json = json.loads(templated_body)
                except Exception:
                    req_json = body_params or None
            else:
                req_json = body_params if body_params else (arguments if method == "POST" and not query_params else None)

        with httpx.Client(timeout=30.0) as client:
            if method == "GET":
                response = client.get(endpoint, headers=headers, params=query_params)
            elif method == "POST":
                response = client.post(endpoint, headers=headers, params=query_params, json=req_json)
            elif method == "PUT":
                response = client.put(endpoint, headers=headers, params=query_params, json=req_json)
            elif method == "DELETE":
                response = client.delete(endpoint, headers=headers, params=query_params)
            else:
                response = client.request(method, endpoint, headers=headers, params=query_params, json=req_json)

        latency_ms = int((time.time() - start_time) * 1000)
        try:
            resp_data = response.json()
        except Exception:
            resp_data = response.text

        if isinstance(resp_data, (dict, list)):
            text_repr = json.dumps(resp_data, indent=2, ensure_ascii=False)
        else:
            text_repr = str(resp_data)

        return {
            "success": response.is_success,
            "status_code": response.status_code,
            "endpoint": endpoint,
            "method": method,
            "arguments": arguments,
            "latency_ms": latency_ms,
            "data": resp_data,
            "text": text_repr[:10000]
        }

api_ingester = APIIngester()


