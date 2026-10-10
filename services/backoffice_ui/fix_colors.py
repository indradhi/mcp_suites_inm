import os
import re

d = r'd:\sourcecode\MCP_SERVER_IN_CEC\services\backoffice_ui\src'

subs = [
    (r"'#07090e'", r"'var(--bg-dark-1)'"),
    (r"'#0a0e17'", r"'var(--bg-dark-1)'"),
    (r"'#0f172a'", r"'var(--bg-dark-2)'"),
    (r"'#1e293b'", r"'var(--bg-dark-3)'"),
    (r"'rgba\(15, 23, 42, 0\.98\)'", r"'var(--bg-glass-1)'"),
    (r"'rgba\(13, 18, 30, 0\.98\)'", r"'var(--bg-glass-1)'"),
    (r"'rgba\(10, 14, 23, 0\.95\)'", r"'var(--bg-glass-1)'"),
    (r"'rgba\(10, 14, 23, 0\.75\)'", r"'var(--bg-glass-2)'"),
    (r"'rgba\(11, 15, 25, 0\.97\)'", r"'var(--bg-glass-1)'"),
    (r"'rgba\(0, ?0, ?0, ?0\.[3-7]\)'", r"'var(--bg-glass-3)'"),
    (r"'rgba\(255, ?255, ?255, ?0\.0[2-8]\)'", r"'var(--bg-glass-light)'"),
    
    (r"'rgba\(255, ?255, ?255, ?0\.1\)'", r"'var(--border-subtle)'"),
    (r"'rgba\(255, ?255, ?255, ?0\.08\)'", r"'var(--border-subtle)'"),
    (r"'rgba\(255, ?255, ?255, ?0\.16\)'", r"'var(--border-strong)'"),
    (r"'#334155'", r"'var(--border-strong)'"),
    
    (r"'#ffffff'", r"'var(--text-main)'"),
    (r"'#cbd5e1'", r"'var(--text-sub)'")
]

count = 0
for root, _, files in os.walk(d):
    for f in files:
        if f.endswith('.jsx'):
            p = os.path.join(root, f)
            with open(p, 'r', encoding='utf-8') as file:
                content = file.read()
            
            orig = content
            for ptn, repl in subs:
                content = re.sub(ptn, repl, content)
                
            if content != orig:
                with open(p, 'w', encoding='utf-8') as file:
                    file.write(content)
                count += 1
                print(f'Updated {f}')

print(f'Total files updated: {count}')
