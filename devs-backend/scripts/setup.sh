#!/bin/bash

# Setup script for DevSponsor Backend

set -e

echo "🚀 Setting up DevSponsor Backend..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

echo "✅ Docker is running"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ and try again."
    exit 1
fi

echo "✅ Node.js $(node --version) found"

# Check if .env exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file from .env.example..."
    cp .env.example .env
    echo "⚠️  Please edit .env and add your configuration values"
else
    echo "✅ .env file already exists"
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Start Docker services
echo "🐳 Starting Docker services..."
docker-compose up -d

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 10

# Check if Postgres is ready
echo "🔍 Checking PostgreSQL..."
until docker exec devsponsor-postgres pg_isready -U devsponsor > /dev/null 2>&1; do
    echo "   Waiting for PostgreSQL..."
    sleep 2
done
echo "✅ PostgreSQL is ready"

# Check if Redis is ready
echo "🔍 Checking Redis..."
until docker exec devsponsor-redis redis-cli ping > /dev/null 2>&1; do
    echo "   Waiting for Redis..."
    sleep 2
done
echo "✅ Redis is ready"

# Generate Prisma client
echo "🔧 Generating Prisma client..."
npm run db:generate

# Push database schema
echo "📊 Pushing database schema..."
npm run db:push

# Create S3 bucket in MinIO
echo "🪣 Setting up S3 bucket..."
docker run --rm --network devs-hack_devsponsor-network \
    --entrypoint sh minio/mc -c "
    mc alias set minio http://minio:9000 minioadmin minioadmin;
    mc mb minio/devsponsor-artifacts --ignore-existing;
    mc anonymous set download minio/devsponsor-artifacts;
    echo '✅ S3 bucket created'
    " || echo "⚠️  S3 bucket setup skipped (may already exist)"

echo ""
echo "✨ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Edit .env with your API keys and configuration"
echo "  2. Run 'npm run dev' to start the API server"
echo "  3. Run 'npm run worker:verifier' in another terminal"
echo "  4. Run 'npm run worker:prover' in another terminal"
echo ""
echo "Useful URLs:"
echo "  - API: http://localhost:3000"
echo "  - Prisma Studio: npm run db:studio"
echo "  - Kafka UI: http://localhost:8080"
echo "  - MinIO Console: http://localhost:9001"
echo ""
