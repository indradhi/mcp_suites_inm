with open('routers/knowledge.py', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Add Request to fastapi imports if not present
if 'Request' not in code[:500]:
    code = code.replace(
        'from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status, Query',
        'from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status, Query, Request'
    )

# 2. Add request: Request to execute_api_tool signature
old_sig = """async def execute_api_tool(
    source_id: int,
    payload: ExecuteToolRequest,
    db: Session = Depends(get_db)
):"""

new_sig = """async def execute_api_tool(
    source_id: int,
    payload: ExecuteToolRequest,
    request: Request,
    db: Session = Depends(get_db)
):"""

if old_sig in code:
    code = code.replace(old_sig, new_sig)
    print("Signature updated")
else:
    print("Signature already updated or not found")

# 3. Add convert_data_images before attaching data priority metadata
target_loc = "# Attach data priority metadata and field definitions for caller (MCP client or LLM)"

converter_code = """        # Convert any Base64 images into lightweight cached media files so callers don't receive raw base64
        try:
            from services.media_cache_service import media_cache_service
            base_url = media_cache_service.get_default_base_url(request)
            raw_data = result.get("data")
            if raw_data:
                sanitized_data, converted_media = media_cache_service.convert_data_images(
                    raw_data,
                    base_url=base_url,
                    source_name=source.name,
                    db=db
                )
                result["data"] = sanitized_data
                if converted_media:
                    result["media_files"] = [m.get("url") for m in converted_media]
        except Exception as media_err:
            logging.getLogger(__name__).warning(f"Notice converting tool images: {media_err}")

        # Attach data priority metadata and field definitions for caller (MCP client or LLM)"""

if converter_code not in code and target_loc in code:
    code = code.replace(target_loc, converter_code)
    print("Converter code added")
else:
    print("Converter code already present or target not found")

with open('routers/knowledge.py', 'w', encoding='utf-8') as f:
    f.write(code)

print("Updated routers/knowledge.py successfully")
