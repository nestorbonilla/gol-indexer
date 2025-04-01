# Apibara Indexer

A Starknet event indexer built with Apibara V2 that processes and stores
blockchain events in a Supabase Postgres database.

## Deployment Instructions

### Prerequisites

If Docker is not installed:

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
docker login
```

### Digital Ocean Setup

#### Droplet Requirements

Minimum specifications:

- 1 GB RAM
- 1 CPU
- 25 GB SSD
- 1000 GB transfer

#### Deployment Steps

1. Create a Ubuntu Droplet on Digital Ocean with the minimum specifications
   listed above
2. Configure SSH access through Digital Ocean's interface
3. SSH into your droplet
4. Follow the general setup steps below

### Database Setup

1. Create a new database in Supabase
2. Have your database credentials ready:
   - Supabase host
   - Supabase password

No manual table creation is needed - the deployment script will handle all
database schema setup automatically.

### Apibara Setup

1. Visit [Apibara website](https://www.apibara.com/)
2. Sign in and create a new project
3. Get your DNA token from the project settings

### Setup Steps

1. Clone the repository:

```bash
git clone https://github.com/nestorbonilla/gol-indexer.git
cd gol-indexer
```

2. Set execution permissions:

```bash
chmod +x deploy/deploy.sh
```

3. Deploy the indexer:

```bash
# First, check and stop any existing indexer container (skip this if first run)
docker compose -f deploy/docker-compose.prod.yml down

# Then deploy the new instance
./deploy/deploy.sh
```

The script will prompt for your Supabase credentials and Apibara DNA token
during first run and create all necessary tables automatically.

The indexer will automatically start processing events from Starknet and storing
them in Supabase.
