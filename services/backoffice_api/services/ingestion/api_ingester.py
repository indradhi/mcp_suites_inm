import logging
from typing import List, Dict, Any, Optional
import httpx

logger = logging.getLogger(__name__)

class APIIngester:
    def _get_verify_ssl(self, config: Dict[str, Any]) -> bool:
        """
        Determines whether SSL certificate verification is enabled.
        Defaults to False for enterprise/government internal endpoints
        (such as *.kpk.go.id, internal CAs, or self-signed certificates),
        or reads explicit config flag 'verify_ssl' / 'ssl_verify'.
        """
        if not config:
            return False
        if "verify_ssl" in config:
            return bool(config["verify_ssl"])
        if "ssl_verify" in config:
            return bool(config["ssl_verify"])
        return False

    @staticmethod
    def extract_token_from_response(data: Any, token_path: Optional[str] = None) -> Optional[str]:
        """
        Robust extraction of token from API response:
        1. Custom dot-notation path (e.g. 'data.token' or 'result.accessToken')
        2. Common standard keys (access_token, token, id_token, jwt, etc.)
        3. Common container objects (data, result, response, auth, payload)
        4. Key search heuristics
        """
        if not data:
            return None

        if isinstance(data, str):
            clean_str = data.strip().strip('"').strip("'")
            return clean_str if clean_str else None

        if not isinstance(data, dict):
            return None

        # 1. Explicit dot-notation path
        if token_path and str(token_path).strip():
            parts = [p.strip() for p in str(token_path).strip().split(".") if p.strip()]
            curr = data
            for part in parts:
                if isinstance(curr, dict) and part in curr:
                    curr = curr[part]
                else:
                    curr = None
                    break
            if curr is not None and not isinstance(curr, (dict, list)):
                return str(curr).strip()

        # 2. Standard direct keys
        direct_candidates = [
            "access_token", "token", "id_token", "jwt", "accessToken", "bearer_token",
            "api_token", "authToken", "auth_token", "key", "token_value"
        ]
        for k in direct_candidates:
            if k in data and data[k] and not isinstance(data[k], (dict, list)):
                return str(data[k]).strip()

        # 3. Check inside common container dicts
        container_keys = ["data", "result", "response", "auth", "payload", "body", "item", "credentials"]
        for c_key in container_keys:
            sub = data.get(c_key)
            if isinstance(sub, dict):
                for k in direct_candidates:
                    if k in sub and sub[k] and not isinstance(sub[k], (dict, list)):
                        return str(sub[k]).strip()

        # 4. Search any key that contains 'token' or 'jwt'
        for k, v in data.items():
            if ("token" in k.lower() or "jwt" in k.lower()) and v and not isinstance(v, (dict, list)):
                return str(v).strip()

        for k, v in data.items():
            if isinstance(v, dict):
                for sub_k, sub_v in v.items():
                    if ("token" in sub_k.lower() or "jwt" in sub_k.lower()) and sub_v and not isinstance(sub_v, (dict, list)):
                        return str(sub_v).strip()

        return None

    async def get_bearer_token(self, auth_config: Dict[str, Any]) -> Optional[str]:
        """
        Supports dynamic token acquisition:
        - static: returns token directly
        - endpoint_token / oauth2 / token_url: sends credentials to obtain dynamic token from endpoint
        """
        if not auth_config:
            return None

        mode = auth_config.get("mode", "static")
        if mode == "static":
            return auth_config.get("token")

        if mode in ["oauth2", "token_endpoint", "endpoint_token", "dynamic_token", "pre_request"] or auth_config.get("token_url"):
            token_url = auth_config.get("token_url")
            if not token_url or not str(token_url).strip():
                raise ValueError("token_url wajib diisi untuk pengambilan token dinamis dari endpoint.")

            token_method = auth_config.get("token_method", "POST").upper()
            payload = auth_config.get("payload", {})
            payload_type = auth_config.get("payload_type", "json")
            headers = auth_config.get("headers", {}).copy() if auth_config.get("headers") else {}
            token_path = auth_config.get("token_path")

            if payload_type == "form" and "Content-Type" not in headers:
                headers["Content-Type"] = "application/x-www-form-urlencoded"
            elif "Content-Type" not in headers and payload_type != "form":
                headers["Content-Type"] = "application/json"

            verify_ssl = self._get_verify_ssl(auth_config)

            async def _do_req(v_ssl: bool):
                async with httpx.AsyncClient(timeout=15.0, verify=v_ssl) as client:
                    if token_method == "GET":
                        resp = await client.get(token_url, params=payload if isinstance(payload, dict) else None, headers=headers)
                    else:
                        if payload_type == "form":
                            resp = await client.post(token_url, data=payload, headers=headers)
                        else:
                            resp = await client.post(token_url, json=payload, headers=headers)
                    resp.raise_for_status()
                    try:
                        return resp.json()
                    except Exception:
                        return resp.text

            try:
                data = await _do_req(verify_ssl)
            except Exception as ssl_e:
                if any(err_kw in str(ssl_e).lower() for err_kw in ["certificate verify failed", "unable to get local issuer certificate", "certificate_verify_failed"]):
                    logger.warning(f"SSL verification failed for token_url {token_url}. Retrying with verify=False.")
                    data = await _do_req(False)
                else:
                    raise ssl_e

            token = self.extract_token_from_response(data, token_path)
            if not token:
                keys_info = list(data.keys()) if isinstance(data, dict) else str(data)[:100]
                raise ValueError(f"Field token tidak ditemukan dalam respons endpoint: {keys_info}")
            return token

        return None

    def get_bearer_token_sync(self, auth_config: Dict[str, Any]) -> Optional[str]:
        """
        Synchronously retrieves token from endpoint or static configuration.
        """
        if not auth_config:
            return None

        mode = auth_config.get("mode", "static")
        if mode == "static":
            return auth_config.get("token")

        if mode in ["oauth2", "token_endpoint", "endpoint_token", "dynamic_token", "pre_request"] or auth_config.get("token_url"):
            token_url = auth_config.get("token_url")
            if not token_url or not str(token_url).strip():
                raise ValueError("token_url wajib diisi untuk pengambilan token dinamis dari endpoint.")

            token_method = auth_config.get("token_method", "POST").upper()
            payload = auth_config.get("payload", {})
            payload_type = auth_config.get("payload_type", "json")
            headers = auth_config.get("headers", {}).copy() if auth_config.get("headers") else {}
            token_path = auth_config.get("token_path")

            if payload_type == "form" and "Content-Type" not in headers:
                headers["Content-Type"] = "application/x-www-form-urlencoded"
            elif "Content-Type" not in headers and payload_type != "form":
                headers["Content-Type"] = "application/json"

            verify_ssl = self._get_verify_ssl(auth_config)

            def _do_req_sync(v_ssl: bool):
                with httpx.Client(timeout=15.0, verify=v_ssl) as client:
                    if token_method == "GET":
                        resp = client.get(token_url, params=payload if isinstance(payload, dict) else None, headers=headers)
                    else:
                        if payload_type == "form":
                            resp = client.post(token_url, data=payload, headers=headers)
                        else:
                            resp = client.post(token_url, json=payload, headers=headers)
                    resp.raise_for_status()
                    try:
                        return resp.json()
                    except Exception:
                        return resp.text

            try:
                data = _do_req_sync(verify_ssl)
            except Exception as ssl_e:
                if any(err_kw in str(ssl_e).lower() for err_kw in ["certificate verify failed", "unable to get local issuer certificate", "certificate_verify_failed"]):
                    logger.warning(f"SSL verification failed for token_url {token_url}. Retrying with verify=False.")
                    data = _do_req_sync(False)
                else:
                    raise ssl_e

            token = self.extract_token_from_response(data, token_path)
            if not token:
                keys_info = list(data.keys()) if isinstance(data, dict) else str(data)[:100]
                raise ValueError(f"Field token tidak ditemukan dalam respons endpoint: {keys_info}")
            return token

        return None

    async def test_fetch_token(self, auth_config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Tests retrieving token from the specified endpoint and returns debug details.
        """
        token_url = auth_config.get("token_url")
        if not token_url or not str(token_url).strip():
            return {"success": False, "message": "Token Endpoint URL wajib diisi."}

        try:
            token = await self.get_bearer_token(auth_config)
            if not token:
                return {"success": False, "message": "Token tidak ditemukan dalam respons endpoint."}

            preview = f"{token[:16]}...{token[-8:]}" if len(token) > 28 else token
            return {
                "success": True,
                "message": f"Token berhasil diambil dari endpoint!",
                "token_preview": preview,
                "token_length": len(token),
                "header_name": auth_config.get("header_name", "Authorization") or "Authorization",
                "token_prefix": auth_config.get("token_prefix", "Bearer ")
            }
        except Exception as e:
            return {
                "success": False,
                "message": f"Gagal mengambil token dari endpoint: {str(e)}"
            }

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
                header_name = auth_config.get("header_name", "Authorization") or "Authorization"
                token_prefix = auth_config.get("token_prefix")
                if token_prefix is None:
                    token_prefix = "Bearer "
                headers[header_name] = f"{token_prefix}{token}".strip() if token_prefix else str(token)

        import urllib.parse
        if endpoint and "?" in endpoint:
            parsed = urllib.parse.urlsplit(endpoint)
            endpoint = urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, parsed.path, '', ''))
            existing_query = dict(urllib.parse.parse_qsl(parsed.query, keep_blank_values=True))
            merged_params = existing_query.copy()
            merged_params.update(params or {})
            params = merged_params

        verify_ssl = self._get_verify_ssl(config)
        async def _do_fetch(v_ssl: bool):
            async with httpx.AsyncClient(timeout=30.0, verify=v_ssl) as client:
                if method == "GET":
                    resp = await client.get(endpoint, headers=headers, params=params)
                else:
                    resp = await client.post(endpoint, headers=headers, params=params, json=body)
                resp.raise_for_status()
                return resp.json()

        try:
            data = await _do_fetch(verify_ssl)
        except Exception as ssl_e:
            if any(err_kw in str(ssl_e).lower() for err_kw in ["certificate verify failed", "unable to get local issuer certificate", "certificate_verify_failed"]):
                logger.warning(f"SSL certificate verify failed for {endpoint}. Retrying with verify=False.")
                data = await _do_fetch(False)
            else:
                raise ssl_e

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
        if hasattr(config, "config"):
            config = getattr(config, "config") or {}
        if not isinstance(config, dict):
            config = {}
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
            include_empty = bool(spec.get("include_empty") or spec.get("allow_empty"))

            # Skip empty or null parameters unless include_empty is enabled
            if (arg_val is None or (isinstance(arg_val, str) and str(arg_val).strip() == "")) and not include_empty:
                continue

            val_to_use = "" if (arg_val is None or (isinstance(arg_val, str) and str(arg_val).strip() == "")) and include_empty else arg_val

            loc = spec.get("in", "query").lower()
            
            if loc == "path" or f"{{{arg_name}}}" in endpoint:
                endpoint = endpoint.replace(f"{{{arg_name}}}", str(val_to_use))
            elif loc == "header":
                headers[arg_name] = str(val_to_use)
            elif loc == "body":
                body_params[arg_name] = val_to_use
            else:
                query_params[arg_name] = val_to_use

        # Fill defaults or empty-included parameters for missing parameters
        for p in parameters_def:
            p_name = p.get("name")
            if not p_name or p_name in (arguments or {}):
                continue

            include_empty = bool(p.get("include_empty") or p.get("allow_empty"))
            has_default = "default" in p and p["default"] is not None and str(p["default"]).strip() != ""

            if has_default or include_empty:
                loc = p.get("in", "query").lower()
                def_val = p.get("default") if p.get("default") is not None and str(p.get("default")).strip() != "" else ""
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
            p_name = p.get("name")
            if not p_name:
                continue
            include_empty = bool(p.get("include_empty") or p.get("allow_empty"))
            if p.get("required") and not include_empty and p_name not in (arguments or {}) and (p.get("default") is None or str(p.get("default", "")).strip() == ""):
                raise ValueError(f"Missing required parameter '{p_name}'")

        # Handle Auth
        auth_config = config.get("auth", {})
        if auth_config:
            token = await self.get_bearer_token(auth_config)
            if token:
                header_name = auth_config.get("header_name", "Authorization") or "Authorization"
                token_prefix = auth_config.get("token_prefix")
                if token_prefix is None:
                    token_prefix = "Bearer "
                headers[header_name] = f"{token_prefix}{token}".strip() if token_prefix else str(token)

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

        import urllib.parse
        if endpoint and "?" in endpoint:
            parsed = urllib.parse.urlsplit(endpoint)
            endpoint = urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, parsed.path, '', ''))
            existing_query = dict(urllib.parse.parse_qsl(parsed.query, keep_blank_values=True))
            merged_params = existing_query.copy()
            merged_params.update(query_params or {})
            query_params = merged_params

        verify_ssl = self._get_verify_ssl(config)
        async def _do_exec_call(v_ssl: bool):
            async with httpx.AsyncClient(timeout=30.0, verify=v_ssl) as client:
                if method == "GET":
                    return await client.get(endpoint, headers=headers, params=query_params)
                elif method == "POST":
                    return await client.post(endpoint, headers=headers, params=query_params, json=req_json)
                elif method == "PUT":
                    return await client.put(endpoint, headers=headers, params=query_params, json=req_json)
                elif method == "DELETE":
                    return await client.delete(endpoint, headers=headers, params=query_params)
                else:
                    return await client.request(method, endpoint, headers=headers, params=query_params, json=req_json)

        try:
            response = await _do_exec_call(verify_ssl)
        except Exception as ssl_e:
            if any(err_kw in str(ssl_e).lower() for err_kw in ["certificate verify failed", "unable to get local issuer certificate", "certificate_verify_failed"]):
                logger.warning(f"SSL certificate verify failed for {endpoint}. Retrying with verify=False.")
                try:
                    response = await _do_exec_call(False)
                except Exception as req_err:
                    latency_ms = int((time.time() - start_time) * 1000)
                    logger.error(f"Error executing API tool call to {endpoint}: {req_err}")
                    return {
                        "success": False,
                        "status_code": getattr(req_err, "response", None).status_code if hasattr(req_err, "response") and req_err.response else 500,
                        "endpoint": endpoint,
                        "method": method,
                        "arguments": arguments,
                        "latency_ms": latency_ms,
                        "error": str(req_err),
                        "data": None,
                        "text": f"Error executing API call: {str(req_err)}"
                    }
            else:
                latency_ms = int((time.time() - start_time) * 1000)
                logger.error(f"Error executing API tool call to {endpoint}: {ssl_e}")
                return {
                    "success": False,
                    "status_code": getattr(ssl_e, "response", None).status_code if hasattr(ssl_e, "response") and ssl_e.response else 500,
                    "endpoint": endpoint,
                    "method": method,
                    "arguments": arguments,
                    "latency_ms": latency_ms,
                    "error": str(ssl_e),
                    "data": None,
                    "text": f"Error executing API call: {str(ssl_e)}"
                }

        latency_ms = int((time.time() - start_time) * 1000)
        try:
            resp_data = response.json()
        except Exception:
            resp_data = response.text

        is_call_success = response.is_success
        err_msg = None
        if isinstance(resp_data, dict):
            m = str(resp_data.get("message", "")).lower()
            e = str(resp_data.get("error", "")).lower()
            st = str(resp_data.get("status", "")).lower()
            if "workflow execution failed" in m or "execution failed" in m or st in ["error", "fail", "failed"] or (e and e not in ["none", "false", "0"]):
                is_call_success = False
                err_msg = resp_data.get("message") or resp_data.get("error") or "Upstream execution failed"

        if isinstance(resp_data, (dict, list)):
            text_repr = json.dumps(resp_data, indent=2, ensure_ascii=False)
        else:
            text_repr = str(resp_data)

        return {
            "success": is_call_success,
            "status_code": response.status_code,
            "endpoint": endpoint,
            "method": method,
            "arguments": arguments,
            "latency_ms": latency_ms,
            "error": err_msg,
            "data": resp_data,
            "text": text_repr[:10000]
        }

    def execute_tool_call_sync(self, config: Dict[str, Any], arguments: Dict[str, Any]) -> Dict[str, Any]:
        """
        Synchronous on-demand API tool call execution.
        """
        import time
        import json
        if hasattr(config, "config"):
            config = getattr(config, "config") or {}
        if not isinstance(config, dict):
            config = {}
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
            include_empty = bool(spec.get("include_empty") or spec.get("allow_empty"))

            # Skip empty or null parameters unless include_empty is enabled
            if (arg_val is None or (isinstance(arg_val, str) and str(arg_val).strip() == "")) and not include_empty:
                continue

            val_to_use = "" if (arg_val is None or (isinstance(arg_val, str) and str(arg_val).strip() == "")) and include_empty else arg_val
            loc = spec.get("in", "query").lower()
            if loc == "path" or f"{{{arg_name}}}" in endpoint:
                endpoint = endpoint.replace(f"{{{arg_name}}}", str(val_to_use))
            elif loc == "header":
                headers[arg_name] = str(val_to_use)
            elif loc == "body":
                body_params[arg_name] = val_to_use
            else:
                query_params[arg_name] = val_to_use

        for p in parameters_def:
            p_name = p.get("name")
            if not p_name or p_name in (arguments or {}):
                continue

            include_empty = bool(p.get("include_empty") or p.get("allow_empty"))
            has_default = "default" in p and p["default"] is not None and str(p["default"]).strip() != ""

            if has_default or include_empty:
                loc = p.get("in", "query").lower()
                def_val = p.get("default") if p.get("default") is not None and str(p.get("default")).strip() != "" else ""
                if loc == "path" and f"{{{p_name}}}" in endpoint:
                    endpoint = endpoint.replace(f"{{{p_name}}}", str(def_val))
                elif loc == "header" and p_name not in headers:
                    headers[p_name] = str(def_val)
                elif loc == "body" and p_name not in body_params:
                    body_params[p_name] = def_val
                elif loc == "query" and p_name not in query_params:
                    query_params[p_name] = def_val

        for p in parameters_def:
            p_name = p.get("name")
            if not p_name:
                continue
            include_empty = bool(p.get("include_empty") or p.get("allow_empty"))
            if p.get("required") and not include_empty and p_name not in (arguments or {}) and (p.get("default") is None or str(p.get("default", "")).strip() == ""):
                raise ValueError(f"Missing required parameter '{p_name}'")

        auth_config = config.get("auth", {})
        if auth_config:
            token = self.get_bearer_token_sync(auth_config)
            if token:
                header_name = auth_config.get("header_name", "Authorization") or "Authorization"
                token_prefix = auth_config.get("token_prefix")
                if token_prefix is None:
                    token_prefix = "Bearer "
                headers[header_name] = f"{token_prefix}{token}".strip() if token_prefix else str(token)

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

        import urllib.parse
        if endpoint and "?" in endpoint:
            parsed = urllib.parse.urlsplit(endpoint)
            endpoint = urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, parsed.path, '', ''))
            existing_query = dict(urllib.parse.parse_qsl(parsed.query, keep_blank_values=True))
            merged_params = existing_query.copy()
            merged_params.update(query_params or {})
            query_params = merged_params

        verify_ssl = self._get_verify_ssl(config)
        def _do_sync_call(v_ssl: bool):
            with httpx.Client(timeout=30.0, verify=v_ssl) as client:
                if method == "GET":
                    return client.get(endpoint, headers=headers, params=query_params)
                elif method == "POST":
                    return client.post(endpoint, headers=headers, params=query_params, json=req_json)
                elif method == "PUT":
                    return client.put(endpoint, headers=headers, params=query_params, json=req_json)
                elif method == "DELETE":
                    return client.delete(endpoint, headers=headers, params=query_params)
                else:
                    return client.request(method, endpoint, headers=headers, params=query_params, json=req_json)

        try:
            response = _do_sync_call(verify_ssl)
        except Exception as ssl_e:
            if any(err_kw in str(ssl_e).lower() for err_kw in ["certificate verify failed", "unable to get local issuer certificate", "certificate_verify_failed"]):
                logger.warning(f"SSL certificate verify failed for {endpoint}. Retrying with verify=False.")
                try:
                    response = _do_sync_call(False)
                except Exception as req_err:
                    latency_ms = int((time.time() - start_time) * 1000)
                    logger.error(f"Error executing sync API tool call to {endpoint}: {req_err}")
                    return {
                        "success": False,
                        "status_code": getattr(req_err, "response", None).status_code if hasattr(req_err, "response") and req_err.response else 500,
                        "endpoint": endpoint,
                        "method": method,
                        "arguments": arguments,
                        "latency_ms": latency_ms,
                        "error": str(req_err),
                        "data": None,
                        "text": f"Error executing API call: {str(req_err)}"
                    }
            else:
                latency_ms = int((time.time() - start_time) * 1000)
                logger.error(f"Error executing sync API tool call to {endpoint}: {ssl_e}")
                return {
                    "success": False,
                    "status_code": getattr(ssl_e, "response", None).status_code if hasattr(ssl_e, "response") and ssl_e.response else 500,
                    "endpoint": endpoint,
                    "method": method,
                    "arguments": arguments,
                    "latency_ms": latency_ms,
                    "error": str(ssl_e),
                    "data": None,
                    "text": f"Error executing API call: {str(ssl_e)}"
                }

        latency_ms = int((time.time() - start_time) * 1000)
        try:
            resp_data = response.json()
        except Exception:
            resp_data = response.text

        is_call_success = response.is_success
        err_msg = None
        if isinstance(resp_data, dict):
            m = str(resp_data.get("message", "")).lower()
            e = str(resp_data.get("error", "")).lower()
            st = str(resp_data.get("status", "")).lower()
            if "workflow execution failed" in m or "execution failed" in m or st in ["error", "fail", "failed"] or (e and e not in ["none", "false", "0"]):
                is_call_success = False
                err_msg = resp_data.get("message") or resp_data.get("error") or "Upstream execution failed"

        if isinstance(resp_data, (dict, list)):
            text_repr = json.dumps(resp_data, indent=2, ensure_ascii=False)
        else:
            text_repr = str(resp_data)

        return {
            "success": is_call_success,
            "status_code": response.status_code,
            "endpoint": endpoint,
            "method": method,
            "arguments": arguments,
            "latency_ms": latency_ms,
            "error": err_msg,
            "data": resp_data,
            "text": text_repr[:10000]
        }

api_ingester = APIIngester()


