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
echo -e "${YELLOW}The following directories/files will be removed:${NC}"
echo "- memory-bank/"
echo "- .github/DEVELOPMENT_WARNING.md"
echo "- scripts/"
echo "- examples/"
echo "- .cursorrules"
echo "- test directories (__tests__)"
echo "- tana_converter.py"
echo "- jest.config.mjs"
echo "- assets/.DS_Store"

# Ask for confirmation
read -p "Proceed with removal? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo -e "${RED}Operation cancelled.${NC}"
  git checkout "$CURRENT_BRANCH"
  git branch -D "$PUBLISH_BRANCH"
  exit 1
fi

# Remove development directories
rm -rf memory-bank/
rm -rf .github/DEVELOPMENT_WARNING.md
rm -rf scripts/
rm -rf examples/
rm -f .cursorrules
rm -f jest.config.mjs
rm -f tana_converter.py
rm -f assets/.DS_Store

# Remove test directories
find ./src -name '__tests__' -type d -exec rm -rf {} +

# Update version in package.json if needed
if [ "$NEW_VERSION" != "$CURRENT_VERSION" ]; then
  echo -e "${BLUE}Updating version in package.json to ${NEW_VERSION}${NC}"
  sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" package.json
fi

# Update README.md to remove Python references and development workflows
echo -e "${BLUE}Updating README.md to remove development-only content...${NC}"
cp README.md README.md.bak
cat README.md.bak | awk '
BEGIN { printing = 1; }
/^## Backup Solution: Python Script/ { printing = 0; }
/^## Example/ && !printing { printing = 1; }
/^## Development/ { printing = 0; }
/^## Technical Details/ && !printing { printing = 1; }
/^More examples can be found in the/ { next; }
printing { print $0; }
' > README.md
rm README.md.bak

# Make sure metadata folder exists
if [ ! -d "metadata" ]; then
  echo -e "${YELLOW}WARNING: metadata folder not found!${NC}"
  echo -e "${YELLOW}Do you want to copy it from main branch? (y/n)${NC}"
  read -p "" -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${BLUE}Copying metadata folder from main branch...${NC}"
    git checkout main -- metadata/
  else
    echo -e "${RED}WARNING: metadata folder is required for Raycast store submissions!${NC}"
  fi
fi

# Update CHANGELOG.md with new version if needed
if [ "$NEW_VERSION" != "$CURRENT_VERSION" ]; then
  echo -e "${BLUE}Updating CHANGELOG.md with new version...${NC}"
  DATE=$(date +%Y-%m-%d)
  TEMP_FILE=$(mktemp)
  echo "# Tana Paste For Raycast Changelog

## [$NEW_VERSION] - $DATE

### Changed
- Updated project structure to comply with Raycast store requirements
- Removed Python script dependency for streamlined installation
- Improved documentation for clarity and focus on Raycast extension functionality
- Updated ESLint configuration to match Raycast recommendations

" > $TEMP_FILE
  cat CHANGELOG.md >> $TEMP_FILE
  mv $TEMP_FILE CHANGELOG.md
fi

# Run lint to ensure everything is formatted correctly
echo -e "${BLUE}Running linter...${NC}"
npm run lint -- --fix

# Run build to verify everything works
echo -e "${BLUE}Building extension to verify it works...${NC}"
npm run build

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
echo -e "2. Test the built extension in Raycast"
echo -e "3. Push to GitHub with: ${BLUE}git push -u origin ${PUBLISH_BRANCH}${NC}"
echo -e "4. Create PR from ${BLUE}${PUBLISH_BRANCH}${NC} to ${BLUE}main${NC} for publishing"
echo -e "5. After merging PR, run: ${BLUE}npm run publish${NC} from main branch to publish to Raycast"
echo -e "6. After publishing, switch back to your development branch: ${BLUE}git checkout ${CURRENT_BRANCH}${NC}"
echo -e "${RED}IMPORTANT: Always develop on the ${CURRENT_BRANCH} branch, NOT on main or publish branches!${NC}"

echo -e "${GREEN}Done!${NC}" 