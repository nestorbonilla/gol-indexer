#!/bin/bash
# Stop all containers
docker stop $(docker ps -aq) 2>/dev/null || true

# Remove all containers
docker rm $(docker ps -aq) 2>/dev/null || true

# Remove all images
docker rmi $(docker images -q) -f 2>/dev/null || true

# Remove orphaned volumes
docker volume prune -f

# Remove unused networks
docker network prune -f

# Stop Docker services
systemctl stop docker.socket
systemctl stop docker

# Completely remove Docker directories (more radical)
rm -rf /var/lib/docker/*
mkdir -p /var/lib/docker/overlay2

# Restart Docker
systemctl start docker

# Wait for Docker to be ready
sleep 5

# Optional: verify that Docker is running
docker info

# Now you can run deploy.sh
