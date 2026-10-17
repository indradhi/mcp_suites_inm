import json

def process_params(config, arguments):
    endpoint = config.get("endpoint", "")
    method = config.get("method", "GET").upper()
    headers = config.get("headers", {}).copy()
    parameters_def = config.get("parameters", [])

    query_params = {}
    body_params = {}
    param_specs = {p.get("name"): p for p in parameters_def if p.get("name")}

    def cast_type(val, p_type):
        if val is None:
            return val
        p_type = str(p_type).lower()
        if p_type in ["integer", "int"]:
            if str(val).strip() != "":
                try:
                    return int(val)
                except (ValueError, TypeError):
                    pass
        elif p_type in ["number", "float"]:
            if str(val).strip() != "":
                try:
                    return float(val)
                except (ValueError, TypeError):
                    pass
        elif p_type in ["boolean", "bool"]:
            if isinstance(val, str):
                return val.lower() in ["true", "1", "yes"]
            return bool(val)
        return val

    # 1. Process passed arguments
    for arg_name, arg_val in (arguments or {}).items():
        spec = param_specs.get(arg_name, {})
        include_empty = bool(spec.get("include_empty") or spec.get("allow_empty"))

        if (arg_val is None or (isinstance(arg_val, str) and str(arg_val).strip() == "")) and not include_empty:
            continue

        val_to_use = "" if (arg_val is None or (isinstance(arg_val, str) and str(arg_val).strip() == "")) and include_empty else arg_val
        val_to_use = cast_type(val_to_use, spec.get("type", "string"))

        loc = spec.get("in", "query").lower()
        if loc == "path" or f"{{{arg_name}}}" in endpoint:
            endpoint = endpoint.replace(f"{{{arg_name}}}", str(val_to_use))
        elif loc == "header":
            headers[arg_name] = str(val_to_use)
        elif loc == "body":
            body_params[arg_name] = val_to_use
        else:
            query_params[arg_name] = val_to_use

    # 2. Fill defaults or empty-included parameters for missing parameters
    for p in parameters_def:
        p_name = p.get("name")
        if not p_name or p_name in (arguments or {}):
            continue

        include_empty = bool(p.get("include_empty") or p.get("allow_empty"))
        has_default = "default" in p and p["default"] is not None and str(p["default"]).strip() != ""

        if has_default or include_empty:
            loc = p.get("in", "query").lower()
            raw_def = p.get("default") if has_default else ""
            def_val = raw_def if raw_def is not None else ""
            def_val = cast_type(def_val, p.get("type", "string"))

            if loc == "path" and f"{{{p_name}}}" in endpoint:
                endpoint = endpoint.replace(f"{{{p_name}}}", str(def_val))
            elif loc == "header" and p_name not in headers:
                headers[p_name] = str(def_val)
            elif loc == "body" and p_name not in body_params:
                body_params[p_name] = def_val
            elif loc == "query" and p_name not in query_params:
                query_params[p_name] = def_val

    req_json = None
    if method in ["POST", "PUT", "PATCH"]:
        req_json = body_params if body_params else None
        if req_json is not None:
            has_ct = any(k.lower() == "content-type" for k in headers)
            if not has_ct:
                headers["Content-Type"] = "application/json"

    return endpoint, headers, query_params, req_json

config = {
    "endpoint": "http://172.18.20.5:4013/api/ebdesk/v.1.0.0/ktp",
    "method": "POST",
    "headers": {"Content-Type": "application/json"},
    "parameters": [
        {"name": "NIK", "in": "body", "type": "string", "default": "", "include_empty": True, "required": True},
        {"name": "NO_KK", "in": "body", "type": "string", "default": "", "include_empty": True, "required": True},
        {"name": "NAMA", "in": "body", "type": "string", "default": "IWAN FALS", "include_empty": False, "required": True},
        {"name": "START_TGL_LHR", "in": "body", "type": "string", "default": "", "include_empty": True, "required": True},
        {"name": "FINISH_TGL_LHR", "in": "body", "type": "string", "default": "", "include_empty": True, "required": True},
        {"name": "START_ROW", "in": "body", "type": "integer", "default": "1", "include_empty": False, "required": True},
        {"name": "FINISH_ROW", "in": "body", "type": "integer", "default": "500", "include_empty": False, "required": True}
    ]
}

ep, hdrs, qp, rjson = process_params(config, {"NAMA": "IWAN FALS", "START_ROW": "5"})
print("req_json:", json.dumps(rjson, indent=2))
for k, v in rjson.items():
    print(f"  {k}: {repr(v)} ({type(v).__name__})")
