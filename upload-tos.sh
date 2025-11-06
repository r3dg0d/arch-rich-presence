#!/bin/bash
# Upload Terms of Service to 0x0.st

BOUNDARY="----WebKitFormBoundary$(openssl rand -hex 16)"
TEMP_FILE=$(mktemp)

cat > "$TEMP_FILE" << EOF
--${BOUNDARY}
Content-Disposition: form-data; name="file"; filename="terms-of-service.txt"
Content-Type: text/plain

$(cat terms-of-service.txt)
--${BOUNDARY}--
EOF

curl -s -X POST \
  -H "User-Agent: Arch-Rich-Presence/1.0" \
  -H "Content-Type: multipart/form-data; boundary=${BOUNDARY}" \
  --data-binary "@${TEMP_FILE}" \
  https://0x0.st/ | tee /tmp/tos-url.txt

rm -f "$TEMP_FILE"
echo ""

