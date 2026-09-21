#!/bin/bash

# Planning Poker Production Deployment Script
# Note: This script uses Docker to build and deploy the application.
# For development setup with npm install, use: ./dev-setup.sh

set -e

echo "🚀 Deploying Planning Poker to production..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

echo -e "${BLUE}📋 Checking prerequisites...${NC}"

# Check if Docker is installed
if ! command_exists docker; then
    echo -e "${RED}❌ Docker is not installed. Please install Docker first.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Docker is installed${NC}"

# Check if Docker Compose is installed
if ! docker compose version >/dev/null 2>&1; then
    echo -e "${RED}❌ Docker Compose is not installed. Please install Docker Compose first.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Docker Compose is installed ($(docker compose version --short))${NC}"

# Check if Docker daemon is running
if ! docker info >/dev/null 2>&1; then
    echo -e "${RED}❌ Docker daemon is not running. Please start Docker first.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Docker daemon is running${NC}"

# Verify project structure
echo -e "${BLUE}📁 Verifying project structure...${NC}"
required_files=("docker-compose.prod.yml" "server/package.json" "client/package.json" "server/Dockerfile.prod")
for file in "${required_files[@]}"; do
    if [[ ! -f "$file" ]]; then
        echo -e "${RED}❌ Missing required file: $file${NC}"
        exit 1
    fi
done
echo -e "${GREEN}✅ All required files present${NC}"

# Create dockerdata directory for persistent storage
echo -e "${BLUE}📁 Creating dockerdata directories...${NC}"
mkdir -p dockerdata/client-build
echo -e "${GREEN}✅ dockerdata directories created${NC}"

# Check if ports are available
echo -e "${BLUE}🔍 Checking if port 4080 is available...${NC}"
if netstat -tuln 2>/dev/null | grep -q ":4080 " || ss -tuln 2>/dev/null | grep -q ":4080 "; then
    echo -e "${YELLOW}⚠️  Port 4080 is already in use. Existing containers will be stopped.${NC}"
fi

echo -e "${BLUE}🛑 Stopping existing containers...${NC}"
docker compose -f docker-compose.prod.yml down --remove-orphans || true

# Build and start services
echo -e "${BLUE}🔨 Building Docker images...${NC}"
echo -e "${YELLOW}This may take a few minutes on first run...${NC}"
docker compose -f docker-compose.prod.yml build --no-cache

echo -e "${BLUE}🚀 Starting services...${NC}"
docker compose -f docker-compose.prod.yml up -d

# Wait for services to be ready
echo -e "${BLUE}⏳ Waiting for services to start...${NC}"
sleep 20

# Check if containers are running
echo -e "${BLUE}📊 Checking container status...${NC}"
docker compose -f docker-compose.prod.yml ps

# Health check with retry
echo -e "${BLUE}🩺 Performing health checks...${NC}"
max_attempts=6
attempt=1

while [ $attempt -le $max_attempts ]; do
    echo -e "${YELLOW}Health check attempt $attempt/$max_attempts...${NC}"
    
    # Check nginx health
    if curl -s -f http://localhost:4080/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Nginx is responding${NC}"
        nginx_healthy=true
    else
        echo -e "${RED}❌ Nginx not responding${NC}"
        nginx_healthy=false
    fi
    
    # Check API health
    if curl -s -f http://localhost:4080/api/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ API server is responding${NC}"
        api_healthy=true
    else
        echo -e "${RED}❌ API server not responding${NC}"
        api_healthy=false
    fi
    
    if [ "$nginx_healthy" = true ] && [ "$api_healthy" = true ]; then
        break
    fi
    
    if [ $attempt -lt $max_attempts ]; then
        echo -e "${YELLOW}Waiting 10 seconds before retry...${NC}"
        sleep 10
    fi
    
    attempt=$((attempt + 1))
done

echo ""
echo "=========================================="
echo -e "${GREEN}🎉 Deployment Complete!${NC}"
echo "=========================================="
echo ""
echo -e "${GREEN}✅ Application Status:${NC}"
echo -e "   🌐 Running on port 4080"
echo -e "   🔗 Internal API: http://localhost:4080/api"
echo -e "   ❤️  Health check: http://localhost:4080/health"
echo ""
echo -e "${BLUE}🔗 Next Steps:${NC}"
echo "  1. Configure your reverse proxy / firewall to forward planningpoker.bytecoder.nl to port 80"
echo "  2. Test the application at http://planningpoker.bytecoder.nl"
echo "  3. Monitor logs for any issues"
echo ""
echo -e "${BLUE}📋 Management Commands:${NC}"
echo "  📜 View logs: docker compose -f docker-compose.prod.yml logs -f"
echo "  🛑 Stop all: docker compose -f docker-compose.prod.yml down"
echo "  🔄 Restart: docker compose -f docker-compose.prod.yml restart"
echo ""

# Final health status
if [ "$nginx_healthy" = true ] && [ "$api_healthy" = true ]; then
    echo -e "${GREEN}🚀 All services are healthy and ready!${NC}"
    exit 0
else
    echo -e "${RED}⚠️  Some services may not be fully ready. Check logs for details.${NC}"
    echo -e "${YELLOW}Run: docker-compose -f docker-compose.prod.yml logs${NC}"
    exit 1
fi