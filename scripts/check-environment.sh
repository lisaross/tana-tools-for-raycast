#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== TANA PASTE ENVIRONMENT CHECK ===${NC}"

# Check if we're on the development branch
if [ -d "memory-bank" ]; then
  echo -e "${GREEN}✅ DEVELOPMENT ENVIRONMENT DETECTED${NC}"
  echo -e "${GREEN}Memory bank directory is present.${NC}"
  echo -e "${YELLOW}Safe to make changes to this branch.${NC}"
else
  echo -e "${RED}⛔ PUBLISHING ENVIRONMENT DETECTED${NC}"
  echo -e "${RED}Memory bank directory is NOT present!${NC}"
  echo -e "${RED}WARNING: This appears to be a publishing branch.${NC}"
  echo -e "${RED}DO NOT make development changes here!${NC}"
  echo -e "${YELLOW}Switch to development-with-memory-bank branch for development.${NC}"
fi

# Show branch information
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo -e "${BLUE}Current branch: ${CURRENT_BRANCH}${NC}"

# Extract current version from package.json
CURRENT_VERSION=$(grep '"version":' package.json | sed 's/.*"version": "\(.*\)",/\1/')
echo -e "${BLUE}Current version: ${CURRENT_VERSION}${NC}"

# Check for metadata folder
if [ -d "metadata" ]; then
  echo -e "${GREEN}✅ Metadata folder is present.${NC}"
else
  echo -e "${YELLOW}⚠️ Metadata folder is missing! This is required for Raycast store submission.${NC}"
fi

# Show directory structure
echo -e "${BLUE}Directory structure:${NC}"
DIR_COUNT=$(find . -type d -maxdepth 1 | grep -v "^\.$\|^\./\.\|node_modules" | wc -l | xargs)
echo -e "  ${GREEN}Directories at root level: ${DIR_COUNT}${NC}"

# Count files in src
SRC_FILES=$(find ./src -type f -name "*.ts*" | wc -l | xargs)
echo -e "  ${GREEN}TypeScript files in src: ${SRC_FILES}${NC}"

# Show available tools
echo -e "${YELLOW}Available commands:${NC}"
echo -e "  ${GREEN}scripts/prepare-for-publish.sh${NC} - Create a clean publish branch"
echo -e "  ${GREEN}scripts/check-environment.sh${NC}  - Run this check again"
echo -e "  ${GREEN}ls memory-bank/${NC}              - Verify development files"
echo -e "  ${GREEN}git checkout development-with-memory-bank${NC} - Switch to development" 