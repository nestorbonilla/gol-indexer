#!/bin/bash

# Cleanup script for the indexer
set -e

echo "Stopping and removing containers..."
docker compose -f deploy/docker-compose.prod.yml down

echo "Cleaning up Docker system..."
docker system prune -f

echo "Removing indexer data volume..."
docker volume rm gol-indexer_indexer_data || true

echo "Cleanup complete. You can now redeploy with ./deploy/deploy.sh"