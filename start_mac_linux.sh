#!/bin/bash

# Define colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}===================================================${NC}"
echo -e "${GREEN}  GigShield - Hybrid Income Protection ${NC}"
echo -e "${GREEN}  Weather + GPS + Deterministic Fraud Guardrails${NC}"
echo -e "${GREEN}===================================================${NC}"
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}[ERROR] Node.js is not installed!${NC}"
    echo "Please download and install Node.js (v18+) from https://nodejs.org/"
    exit 1
fi
echo -e "${GREEN}[OK] Node.js is installed.${NC}"

echo -e "${GREEN}===================================================${NC}"
echo "Installing dependencies (this may take a minute)..."
echo -e "${GREEN}===================================================${NC}"
npm install
if [ $? -ne 0 ]; then
    echo -e "${RED}[ERROR] Failed to install dependencies. Check your npm setup.${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}===================================================${NC}"
echo "Booting up the Server and React Frontend..."
echo -e "${GREEN}===================================================${NC}"
echo "The dashboard will be available at http://localhost:5000"
echo ""

# Start the dev server
npm run dev
