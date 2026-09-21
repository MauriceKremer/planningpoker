#!/bin/bash

# Planning Poker Development Setup Script

set -e

echo "🚀 Setting up Planning Poker for development..."

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

echo -e "${BLUE}📋 Checking development prerequisites...${NC}"

# Check if Node.js is installed
if ! command_exists node; then
    echo -e "${RED}❌ Node.js is not installed. Please install Node.js first.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Node.js is installed ($(node --version))${NC}"

# Check if npm is installed
if ! command_exists npm; then
    echo -e "${RED}❌ npm is not installed. Please install npm first.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ npm is installed ($(npm --version))${NC}"

# Verify project structure
echo -e "${BLUE}📁 Verifying project structure...${NC}"
required_files=("server/package.json" "client/package.json")
for file in "${required_files[@]}"; do
    if [[ ! -f "$file" ]]; then
        echo -e "${RED}❌ Missing required file: $file${NC}"
        exit 1
    fi
done
echo -e "${GREEN}✅ All required files present${NC}"

# Install server dependencies
echo -e "${BLUE}📦 Installing server dependencies...${NC}"
cd server
npm install
cd ..
echo -e "${GREEN}✅ Server dependencies installed${NC}"

# Install client dependencies
echo -e "${BLUE}📦 Installing client dependencies...${NC}"
cd client
npm install
cd ..
echo -e "${GREEN}✅ Client dependencies installed${NC}"

# Create development environment files
echo -e "${BLUE}⚙️  Setting up environment files...${NC}"

# Server .env
if [[ ! -f "server/.env" ]]; then
    cat > server/.env << EOF
NODE_ENV=development
PORT=8081
CLIENT_URL=http://localhost:3000
EOF
    echo -e "${GREEN}✅ Created server/.env${NC}"
else
    echo -e "${YELLOW}⚠️  server/.env already exists${NC}"
fi

# Client .env
if [[ ! -f "client/.env" ]]; then
    cat > client/.env << EOF
REACT_APP_API_URL=http://localhost:8081/api
REACT_APP_SOCKET_URL=http://localhost:8081
EOF
    echo -e "${GREEN}✅ Created client/.env${NC}"
else
    echo -e "${YELLOW}⚠️  client/.env already exists${NC}"
fi

echo ""
echo "=========================================="
echo -e "${GREEN}🎉 Development Setup Complete!${NC}"
echo "=========================================="
echo ""
echo -e "${BLUE}🚀 Start Development Servers:${NC}"
echo ""
echo -e "${YELLOW}Terminal 1 - Backend Server:${NC}"
echo "  cd server && npm run dev"
echo ""
echo -e "${YELLOW}Terminal 2 - Frontend Server:${NC}"
echo "  cd client && npm start"
echo ""
echo -e "${BLUE}🌐 Development URLs:${NC}"
echo "  📱 Frontend: http://localhost:3000"
echo "  🔌 Backend API: http://localhost:8081/api"
echo "  ❤️  Health Check: http://localhost:8081/api/health"
echo ""
echo -e "${BLUE}📋 Useful Commands:${NC}"
echo "  🔄 Restart server: cd server && npm run dev"
echo "  📜 View server logs: cd server && npm run dev"
echo ""