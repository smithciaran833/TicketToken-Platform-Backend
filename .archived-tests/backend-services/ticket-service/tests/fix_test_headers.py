import re

with open('tests/endpoints/ticket-endpoints-comprehensive.test.ts', 'r') as f:
    content = f.read()

# Add TENANT_ID constant after timestamp
content = content.replace(
    "const timestamp = Date.now();",
    "const timestamp = Date.now();\nconst TENANT_ID = '00000000-0000-0000-0000-000000000001';"
)

# Fix headers - add x-tenant-id to Authorization headers
content = re.sub(
    r"{ headers: { Authorization: `Bearer \$\{(\w+)\}` } }",
    r"{ headers: { Authorization: `Bearer ${\1}`, 'x-tenant-id': TENANT_ID } }",
    content
)

with open('tests/endpoints/ticket-endpoints-comprehensive.test.ts', 'w') as f:
    f.write(content)

print("✅ Fixed test headers!")
