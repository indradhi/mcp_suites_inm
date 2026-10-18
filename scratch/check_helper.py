import sys
import os
import unittest
from unittest.mock import patch, MagicMock

sys.path.append(os.path.abspath("services/backoffice_api"))

from services.ingestion.api_ingester import APIIngester

ingester = APIIngester()

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

# Test helper directly
ep, meth, hdrs, qp, rjson = ingester._prepare_request_params(config, {"NAMA": "IWAN FALS"}) if hasattr(ingester, "_prepare_request_params") else (None, None, None, None, None)
print("Helper exists:", hasattr(ingester, "_prepare_request_params"))
