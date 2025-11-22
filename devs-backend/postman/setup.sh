#!/bin/bash

# DevSponsor API - Quick Start Script
# This script helps you get started with the Postman collection

set -e

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔════════════════════════════════════════╗"
echo "║   DevSponsor API - Postman Setup      ║"
echo "╔════════════════════════════════════════╗"
echo -e "${NC}"

# Check if Postman is installed
if ! command -v postman &> /dev/null; then
    echo -e "${YELLOW}⚠️  Postman CLI not found${NC}"
    echo "📥 Download Postman from: https://www.postman.com/downloads/"
    echo ""
fi

# Check if API is running
echo -e "${BLUE}🔍 Checking if API is running...${NC}"
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ API is running!${NC}"
else
    echo -e "${YELLOW}⚠️  API is not running${NC}"
    echo "Start the API with: npm run dev"
    echo ""
fi

# Display file locations
echo -e "${BLUE}📦 Postman Collection Files:${NC}"
echo ""
echo "Collection: ./postman/DevSponsor_API.postman_collection.json"
echo "Local Env:  ./postman/DevSponsor_Local.postman_environment.json"
echo "Prod Env:   ./postman/DevSponsor_Production.postman_environment.json"
echo ""

# Display import instructions
echo -e "${BLUE}📖 Import Instructions:${NC}"
echo ""
echo "1. Open Postman Desktop App"
echo "2. Click 'Import' button (top left)"
echo "3. Drag and drop the 3 JSON files above"
echo "4. Select 'DevSponsor - Local' environment"
echo ""

# Display auth instructions
echo -e "${BLUE}🔐 Authentication Setup:${NC}"
echo ""
echo "1. Run: Health Check > Basic Health Check"
echo "2. Run: Authentication > GitHub OAuth Login"
echo "3. Copy the URL and open in browser"
echo "4. Complete GitHub authentication"
echo "5. Copy JWT token from redirect URL"
echo "6. Set 'jwt_token' in environment variables"
echo "7. Test with: Authentication > Get Current User"
echo ""

# Quick test workflow
echo -e "${BLUE}🎯 Recommended Testing Workflow:${NC}"
echo ""
echo "For Sponsors:"
echo "  1. Authenticate → Get Current User"
echo "  2. Create Organization (optional)"
echo "  3. Create Project"
echo "  4. Get Funding Quote"
echo "  5. Fund Project"
echo "  6. Generate AI Milestones"
echo ""
echo "For Developers:"
echo "  1. Authenticate → Get Current User"
echo "  2. Get All Projects"
echo "  3. Get Project Milestones"
echo "  4. Claim Sub-Milestone"
echo "  5. Submit work (triggers webhook)"
echo ""

# Documentation links
echo -e "${BLUE}📚 Documentation:${NC}"
echo ""
echo "Postman Guide:        ./postman/README.md"
echo "Frontend Integration: ./postman/FRONTEND_INTEGRATION.md"
echo "Main README:          ./README.md"
echo ""

# Display useful curl commands
echo -e "${BLUE}🧪 Quick Test (curl):${NC}"
echo ""
echo "# Health check"
echo "curl http://localhost:3000/health"
echo ""
echo "# Get projects (no auth required)"
echo "curl http://localhost:3000/api/projects"
echo ""
echo "# Authenticated request (replace TOKEN)"
echo 'curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3000/auth/me'
echo ""

echo -e "${GREEN}✨ Ready to test! Import the collection into Postman to get started.${NC}"
echo ""
