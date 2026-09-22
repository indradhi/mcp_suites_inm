import re

with open("services/backoffice_ui/src/components/modals/AddDatabaseModal.jsx", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Extract the Test button block
btn_pattern = r'(\s*<button\s+type="button"\s+className="btn-secondary"\s+onClick=\{handleTest\}[\s\S]*?</button>\n)'
btn_match = re.search(btn_pattern, content)
btn_str = btn_match.group(1) if btn_match else ""

# Delete it from its original place
content = content.replace(btn_str, "")

# 2. Extract the Test Output block
out_pattern = r'(\s*\{\/\* Test Connection \/ Query Output \*\/\}[\s\S]*?\{testResult && \([\s\S]*?\n\s*\)\}\n)'
out_match = re.search(out_pattern, content)
out_str = out_match.group(1) if out_match else ""

# Delete it from its original place
content = content.replace(out_str, "")

# 3. Find the end of Query Editor Box
query_editor_end = r'(\s*\{\(isTool \|\| parameters\.length > 0\) && \(\s*<div style=\{\{ marginTop: \'6px\', fontSize: \'11px\', color: \'var\(--text-muted\)\', display: \'flex\', alignItems: \'center\', gap: \'6px\' \}\}>\s*<HelpCircle size=\{12\} />\s*<span>Nilai parameter otomatis di-bind dan di-escape secara aman sesuai tipenya \(string, integer, boolean\)\.</span>\s*</div>\s*\)\}\n\s*</div>)'

# Insert btn_str and out_str before the last </div> of query_editor_end
def replacer(m):
    original = m.group(1)
    # We want to put it right before the last </div>
    parts = original.rsplit('</div>', 1)
    
    # Let's wrap the button in a div with marginTop
    wrapped_btn = "\n            <div style={{ marginTop: '12px' }}>" + btn_str.replace('\n              <button', '\n                <button').replace('\n              </button>', '\n                </button>') + "            </div>\n"
    
    return parts[0] + wrapped_btn + out_str + "          </div>"

content = re.sub(query_editor_end, replacer, content)

with open("services/backoffice_ui/src/components/modals/AddDatabaseModal.jsx", "w", encoding="utf-8") as f:
    f.write(content)

print("Done")
