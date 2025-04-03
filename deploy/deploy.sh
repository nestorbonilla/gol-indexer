#!/bin/bash
# Unified deployment script for gol-indexer
set -e  # Exit on any error

# Check for root privileges needed for IPv6 setup
if [ "$EUID" -ne 0 ]; then
  echo "This script requires root privileges to configure networking."
  echo "Please run with: sudo $(basename "$0")"
  exit 1
fi

# Navigate to project root directory
cd "$(dirname "$0")/.." || exit

# If you want to delete all docker containers and volumes, run the following command:
# docker system prune -a --volumes
# docker builder prune -a

# Check if .env exists; if not, create it and prompt for values
if [ ! -f .env ]; then
  echo "Creating .env file and collecting required values..."
  
  # Prompt for variables
  read -p "Enter your Supabase host: " SUPABASE_HOST
  read -p "Enter your Supabase password: " SUPABASE_PASSWORD
  read -p "Enter your Apibara DNA token: " DNA_TOKEN
  
  # Write to .env file
  cat > .env << EOL
# Supabase
SUPABASE_HOST=${SUPABASE_HOST}
SUPABASE_PASSWORD=${SUPABASE_PASSWORD}

# Apibara
DNA_TOKEN=${DNA_TOKEN}

# Digital Ocean
DO_METADATA_IP=169.254.169.254
EOL
  echo ".env file created with provided values."
else
  echo "Found existing .env file."
fi

# Source the environment variables
set -a # automatically export all variables
source .env
set +a

# If you want to clean the database, run the following command:
# psql -h SUPABASE_HOST -U postgres -d postgres -f deploy/reset-supabase-db.sql

# Validate required variables
if [ -z "$SUPABASE_HOST" ] || [ -z "$SUPABASE_PASSWORD" ]; then
  echo "Error: SUPABASE_HOST and SUPABASE_PASSWORD must be set in .env file"
  exit 1
fi

if [ -z "$DNA_TOKEN" ]; then
  echo "Warning: DNA_TOKEN is not set. You may experience rate limiting."
  read -p "Continue anyway? (y/n): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment canceled."
    exit 1
  fi
fi

# Digital Ocean metadata service IP
METADATA_IP=${DO_METADATA_IP:-169.254.169.254}

echo "Enabling IPv6..."
echo "Getting IPv6 configuration from DigitalOcean metadata service..."

# Get droplet's IPv6 address and gateway
IPV6_ADDRESS=$(curl -s http://$METADATA_IP/metadata/v1/interfaces/public/0/ipv6/address)
IPV6_GATEWAY=$(curl -s http://$METADATA_IP/metadata/v1/interfaces/public/0/ipv6/gateway)

if [ -z "$IPV6_ADDRESS" ] || [ -z "$IPV6_GATEWAY" ]; then
  echo "Error: Could not get IPv6 configuration from DigitalOcean metadata"
  exit 1
fi

echo "Found IPv6 configuration:"
echo "Address: $IPV6_ADDRESS"
echo "Gateway: $IPV6_GATEWAY"

echo "Configuring IPv6 networking..."
cat > /etc/netplan/60-ipv6.yaml << EOF
# IPv6 configuration
network:
  version: 2
  ethernets:
    eth0:
      dhcp6: true
      accept-ra: true
      addresses:
        - "${IPV6_ADDRESS}/64"
      routes:
        - to: "::/0"
          via: "${IPV6_GATEWAY}"
EOF

chmod 600 /etc/netplan/60-ipv6.yaml
echo "Applying network configuration..."
netplan apply

echo "Waiting for network to be ready..."
sleep 5

echo "Testing connectivity to Supabase..."
if ! ping6 -c 1 $SUPABASE_HOST > /dev/null 2>&1; then
  echo "Warning: Cannot ping Supabase host via IPv6, but continuing..."
fi

# Create database tables if they don't exist
echo "Creating database tables in Supabase..."
if ! command -v psql &> /dev/null; then
  echo "Installing PostgreSQL client..."
  apt-get update -qq && apt-get install -y -qq postgresql-client > /dev/null
fi

echo "Running migration script against Supabase..."
PGPASSWORD=$SUPABASE_PASSWORD psql -h $SUPABASE_HOST -U postgres -d postgres -f drizzle/0000_initial_script.sql
if [ $? -eq 0 ]; then
  echo "Database tables created successfully."
else
  echo "Warning: Error creating database tables. Check if they already exist."
fi

# Build and deploy
echo "Building and deploying the indexer..."
docker compose -f deploy/docker-compose.prod.yml up -d --build

# Check status
echo "Deployment complete. Checking container status..."
docker compose -f deploy/docker-compose.prod.yml ps

echo "Deployment successful! Showing logs (press Ctrl+C to exit)..."
docker compose -f deploy/docker-compose.prod.yml logs -f 