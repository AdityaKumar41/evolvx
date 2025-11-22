#!/bin/bash

# Quick Start Script - Run this after setup to verify everything works

echo "🔍 DevSponsor Backend - Quick Health Check"
echo "=========================================="
echo ""

# Check if Docker is running
echo "Checking Docker..."
if docker info > /dev/null 2>&1; then
    echo "✅ Docker is running"
else
    echo "❌ Docker is not running"
    echo "   Please start Docker and run this script again"
    exit 1
fi

echo ""
echo "Checking Docker services..."

# Check each service
services=("devsponsor-postgres" "devsponsor-redis" "devsponsor-kafka" "devsponsor-zookeeper" "devsponsor-qdrant" "devsponsor-minio")

for service in "${services[@]}"; do
    if docker ps | grep -q $service; then
        echo "✅ $service is running"
    else
        echo "❌ $service is not running"
        echo "   Run: docker-compose up -d"
    fi
done

echo ""
echo "Checking Node.js environment..."

if [ -f "node_modules/.bin/tsx" ]; then
    echo "✅ Dependencies installed"
else
    echo "❌ Dependencies not installed"
    echo "   Run: npm install"
fi

if [ -f ".env" ]; then
    echo "✅ .env file exists"
else
    echo "❌ .env file missing"
    echo "   Run: cp .env.example .env"
fi

if [ -d "node_modules/.prisma" ]; then
    echo "✅ Prisma client generated"
else
    echo "⚠️  Prisma client not generated"
    echo "   Run: npm run db:generate"
fi

echo ""
echo "Testing database connection..."
if docker exec devsponsor-postgres pg_isready -U devsponsor > /dev/null 2>&1; then
    echo "✅ PostgreSQL is ready"
else
    echo "❌ PostgreSQL is not ready"
fi

echo ""
echo "Testing Redis connection..."
if docker exec devsponsor-redis redis-cli ping > /dev/null 2>&1; then
    echo "✅ Redis is ready"
else
    echo "❌ Redis is not ready"
fi

echo ""
echo "=========================================="
echo "Health Check Complete!"
echo ""
echo "Next steps:"
echo "  1. Configure .env with your API keys"
echo "  2. Run: npm run dev"
echo "  3. Visit: http://localhost:3000/health"
echo ""
echo "Useful commands:"
echo "  make dev          - Start development server"
echo "  make docker-logs  - View all Docker logs"
echo "  make db-studio    - Open database browser"
echo "  make kafka-ui     - Open Kafka management UI"
echo ""
