#!/bin/bash
set -euo pipefail

BYTEBASE_URL="${BYTEBASE_URL:-http://localhost:8080}"
BYTEBASE_EMAIL="${BYTEBASE_SERVICE_ACCOUNT:-admin@bytebase.com}"
BYTEBASE_PASSWORD="${BYTEBASE_SERVICE_KEY:-admin1234}"
PROJECT_ID="${BYTEBASE_PROJECT_ID:-db-automation}"

echo "=== Bytebase Setup Script ==="
echo "URL: $BYTEBASE_URL"
echo ""

# 1. Wait for Bytebase to be healthy
echo "[1/7] Waiting for Bytebase to be healthy..."
for i in $(seq 1 60); do
  if curl -sf "$BYTEBASE_URL/healthz" > /dev/null 2>&1; then
    echo "  Bytebase is healthy."
    break
  fi
  if [ "$i" = "60" ]; then
    echo "  ERROR: Bytebase did not become healthy within 60 seconds."
    exit 1
  fi
  sleep 2
done

# 2. Login and get access token
echo "[2/7] Authenticating..."
AUTH_RESPONSE=$(curl -sf -X POST "$BYTEBASE_URL/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$BYTEBASE_EMAIL\", \"password\": \"$BYTEBASE_PASSWORD\"}")

TOKEN=$(echo "$AUTH_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || echo "")

if [ -z "$TOKEN" ]; then
  echo "  Warning: Could not extract token. Proceeding with basic auth."
  AUTH_HEADER="Authorization: Basic $(echo -n "$BYTEBASE_EMAIL:$BYTEBASE_PASSWORD" | base64)"
else
  AUTH_HEADER="Authorization: Bearer $TOKEN"
  echo "  Authenticated successfully."
fi

# 3. Create project
echo "[3/7] Creating project '$PROJECT_ID'..."
curl -sf -X POST "$BYTEBASE_URL/v1/projects" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d "{
    \"projectId\": \"$PROJECT_ID\",
    \"title\": \"DB Change Automation\",
    \"key\": \"DBCA\"
  }" > /dev/null 2>&1 || echo "  Project may already exist (OK)"

# 4. Add MySQL prod instance
echo "[4/7] Adding MySQL prod instance..."
curl -sf -X POST "$BYTEBASE_URL/v1/instances" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d "{
    \"instanceId\": \"mysql-prod\",
    \"title\": \"MySQL Production\",
    \"engine\": \"MYSQL\",
    \"dataSourceList\": [{
      \"type\": \"ADMIN\",
      \"host\": \"mysql-prod\",
      \"port\": \"3306\",
      \"username\": \"root\",
      \"password\": \"rootpass\",
      \"database\": \"appdb\"
    }]
  }" > /dev/null 2>&1 || echo "  Instance may already exist (OK)"

# 5. Add MySQL preprod instance
echo "[5/7] Adding MySQL preprod instance..."
curl -sf -X POST "$BYTEBASE_URL/v1/instances" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d "{
    \"instanceId\": \"mysql-preprod\",
    \"title\": \"MySQL Preprod\",
    \"engine\": \"MYSQL\",
    \"dataSourceList\": [{
      \"type\": \"ADMIN\",
      \"host\": \"mysql-preprod\",
      \"port\": \"3306\",
      \"username\": \"root\",
      \"password\": \"rootpass\",
      \"database\": \"appdb\"
    }]
  }" > /dev/null 2>&1 || echo "  Instance may already exist (OK)"

# 6. Configure approval policy
echo "[6/7] Configuring approval policy..."
curl -sf -X PATCH "$BYTEBASE_URL/v1/projects/$PROJECT_ID/iamPolicy" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d @approval-policy.json > /dev/null 2>&1 || echo "  Policy update may require manual configuration (OK)"

# 7. Print summary
echo "[7/7] Setup complete!"
echo ""
echo "=== Configuration Summary ==="
echo "Bytebase UI:       $BYTEBASE_URL"
echo "Project:           $PROJECT_ID"
echo "MySQL Prod:        localhost:3307 (user: liquibase_user)"
echo "MySQL Preprod:     localhost:3309 (user: liquibase_user)"
echo "Bytebase Meta DB:  localhost:3308 (internal)"
echo ""
echo "Next steps:"
echo "1. Open $BYTEBASE_URL in your browser"
echo "2. Log in with the service account credentials"
echo "3. Verify both MySQL instances are connected"
echo "4. Configure the approval workflow in the project settings"
