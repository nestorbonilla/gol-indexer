FROM node:20-slim

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package.json and pnpm-lock.yaml
COPY package.json pnpm-lock.yaml* ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN pnpm run drizzle:generate
RUN pnpm run build

# Expose port for the API if needed
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
# POSTGRES_CONNECTION_STRING will be set dynamically in the command
# to handle special characters in the password

# Default command - will be overridden by docker-compose
CMD ["node", "/app/.apibara/build/start.mjs", "start", "--indexer", "starknet-lifeform"] 