#!/bin/bash

# Tana Paste for Raycast - Publish Preparation Script
# This script prepares the codebase for publishing to Raycast store

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== TANA PASTE PUBLISHING SCRIPT ===${NC}"
echo -e "${YELLOW}This script will prepare your development branch for Raycast store submission${NC}"

# Check if we're on the development branch
if [ ! -d "memory-bank" ]; then
  echo -e "${RED}ERROR: Memory bank directory not found!${NC}"
  echo -e "${RED}Make sure you're running this from the development branch.${NC}"
  echo -e "${RED}Aborting.${NC}"
  exit 1
fi

# Ask for confirmation
echo -e "${YELLOW}This will create a new publish branch from your current state.${NC}"
echo -e "${YELLOW}Make sure all your work is committed first.${NC}"
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo -e "${RED}Operation cancelled.${NC}"
  exit 1
fi

# Get current branch name
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo -e "${GREEN}Current branch: ${CURRENT_BRANCH}${NC}"

# Extract current version from package.json
CURRENT_VERSION=$(grep '"version":' package.json | sed 's/.*"version": "\(.*\)",/\1/')
echo -e "${GREEN}Current version: ${CURRENT_VERSION}${NC}"

# Ask for new version
echo -e "${YELLOW}Enter new version number (leave empty to keep current):${NC}"
read NEW_VERSION
if [ -z "$NEW_VERSION" ]; then
  NEW_VERSION=$CURRENT_VERSION
  echo -e "${GREEN}Keeping version: ${NEW_VERSION}${NC}"
else
  echo -e "${GREEN}New version will be: ${NEW_VERSION}${NC}"
fi

# Generate timestamp for branch name
TIMESTAMP=$(date +%Y%m%d%H%M%S)
PUBLISH_BRANCH="publish-${NEW_VERSION}-${TIMESTAMP}"

# Create new branch
echo -e "${BLUE}Creating new publish branch: ${PUBLISH_BRANCH}${NC}"
git checkout -b "$PUBLISH_BRANCH"

# Remove development-only files and directories
echo -e "${BLUE}Removing development-only files...${NC}"

# List of directories/files to remove for publishing
echo -e "${YELLOW}The following directories will be removed:${NC}"
echo "- memory-bank/"
echo "- .github/DEVELOPMENT_WARNING.md"
echo "- scripts/prepare-for-publish.sh"
echo "- test-data/"

# Ask for confirmation
read -p "Proceed with removal? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo -e "${RED}Operation cancelled.${NC}"
  git checkout "$CURRENT_BRANCH"
  git branch -D "$PUBLISH_BRANCH"
  exit 1
fi

# Remove directories
rm -rf memory-bank/
rm -rf .github/DEVELOPMENT_WARNING.md
rm -rf test-data/
# Don't remove the script until the end

# Update version in package.json if needed
if [ "$NEW_VERSION" != "$CURRENT_VERSION" ]; then
  echo -e "${BLUE}Updating version in package.json to ${NEW_VERSION}${NC}"
  sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" package.json
fi

# Run lint to ensure everything is formatted correctly
echo -e "${BLUE}Running linter...${NC}"
npm run lint -- --fix

# Commit changes
echo -e "${BLUE}Committing changes...${NC}"
git add -A
git commit -m "chore: prepare for publishing version ${NEW_VERSION}"

# Final instructions
echo -e "${GREEN}=================================================================${NC}"
echo -e "${GREEN}Publish branch '${PUBLISH_BRANCH}' has been created!${NC}"
echo -e "${GREEN}=================================================================${NC}"
echo -e "${YELLOW}Next steps:${NC}"
echo -e "1. Review the changes with: ${BLUE}git diff ${CURRENT_BRANCH}..${PUBLISH_BRANCH}${NC}"
echo -e "2. Build the extension with: ${BLUE}npm run build${NC}"
echo -e "3. Test the build in Raycast"
echo -e "4. Push to GitHub with: ${BLUE}git push -u origin ${PUBLISH_BRANCH}${NC}"
echo -e "5. Create PR from ${BLUE}${PUBLISH_BRANCH}${NC} to ${BLUE}main${NC} for publishing"
echo -e "6. After publishing, switch back to your development branch: ${BLUE}git checkout ${CURRENT_BRANCH}${NC}"
echo -e "${RED}IMPORTANT: Always develop on the ${CURRENT_BRANCH} branch, NOT on main or publish branches!${NC}"

# Remove this script at the very end (from the publish branch)
rm -f scripts/prepare-for-publish.sh

echo -e "${GREEN}Done!${NC}" 