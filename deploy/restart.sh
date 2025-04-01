#!/bin/bash
# Script to restart the indexer service without rebuilding or clearing data
set -e  # Exit on any error

# Navigate to project root directory
cd "$(dirname "$0")/.." || exit

# Load environment variables
if [ -f .env ]; then
  set -a # automatically export all variables
  source .env
  set +a
else
  echo "Error: .env file not found. Please run ./deploy/deploy.sh first."
  exit 1
fi

# Check required variables
if [ -z "$SUPABASE_HOST" ] || [ -z "$SUPABASE_PASSWORD" ]; then
  echo "Error: SUPABASE_HOST and SUPABASE_PASSWORD must be set in .env file"
  exit 1
fi

echo "Restarting indexer service..."
docker compose -f deploy/docker-compose.prod.yml restart

echo "Restart complete. Checking container status..."
docker compose -f deploy/docker-compose.prod.yml ps

echo "Showing logs (press Ctrl+C to exit)..."
docker compose -f deploy/docker-compose.prod.yml logs -f
