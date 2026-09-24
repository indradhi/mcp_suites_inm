import sys
sys.path.append("/app")
from database import engine
from sqlalchemy import text

try:
    with engine.begin() as con:
        con.execute(text('ALTER TABLE api_keys ADD COLUMN allowed_tools TEXT NULL;'))
        con.execute(text('ALTER TABLE api_keys ADD COLUMN allowed_kbs TEXT NULL;'))
        print("Columns added successfully.")
except Exception as e:
    print(f"Error (maybe columns exist): {e}")
