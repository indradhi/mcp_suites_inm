import sys
import os
import unittest
from unittest.mock import patch, MagicMock

sys.path.append(os.path.abspath("services/backoffice_api"))

from services.ingestion.api_ingester import api_ingester

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

# Capture httpx call
with patch("httpx.Client.post") as mock_post:
    mock_resp = MagicMock()
    mock_resp.is_success = True
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"status": "success", "data": [{"NAMA": "IWAN FALS"}]}
    mock_post.return_value = mock_resp

    res = api_ingester.execute_tool_call_sync(config, {"NAMA": "IWAN FALS"})
    print("Result success:", res.get("success"))
    if mock_post.called:
        call_args, call_kwargs = mock_post.call_args
        print("Called URL:", call_args[0] if call_args else call_kwargs.get("url"))
        print("Called headers:", call_kwargs.get("headers"))
        print("Called json payload:", json_payload := call_kwargs.get("json"))
        print("Types in json payload:")
        for k, v in json_payload.items():
            print(f"  {k}: {repr(v)} (type: {type(v).__name__})")
    else:
        print("mock_post was NOT called! Error:", res.get("error"))
