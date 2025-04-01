FROM node:20-slim

WORKDIR /app

# Install pnpm with a specific version to avoid issues
RUN npm install -g pnpm@8.10.0

# Copy package files first
COPY package.json ./

# Install dependencies with production flag
RUN pnpm install --prod --no-frozen-lockfile

# Copy application code
COPY . .

# Set environment variables
ENV NODE_ENV=production
ENV POSTGRES_CONNECTION_STRING=postgres://postgres:${SUPABASE_PASSWORD}@${SUPABASE_HOST}:5432/postgres
ENV DNA_TOKEN=${DNA_TOKEN}

# Start the application
CMD ["pnpm", "start"] 