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

# Expose port for the API if needed
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV POSTGRES_CONNECTION_STRING=postgres://postgres:${SUPABASE_PASSWORD}@${SUPABASE_HOST}:5432/postgres
ENV DNA_TOKEN=${DNA_TOKEN}

# Start the application
CMD ["pnpm", "start"] 