#!/bin/bash

# Reset script - cleans up and restarts all services

set -e

echo "🧹 Resetting DevSponsor Backend..."

# Stop all services
echo "🛑 Stopping Docker services..."
docker-compose down

# Remove volumes (optional - uncomment to delete all data)
# echo "🗑️  Removing volumes..."
# docker-compose down -v

# Start services again
echo "🚀 Starting Docker services..."
docker-compose up -d

# Wait for services
echo "⏳ Waiting for services..."
sleep 10

# Reset database
echo "📊 Resetting database..."
npm run db:push

echo "✅ Reset complete!"
echo "Run 'npm run dev' to start the server"
