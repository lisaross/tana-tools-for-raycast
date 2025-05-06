# DEVELOPMENT BRANCH WARNING

**⚠️ IMPORTANT: YOU ARE ON THE DEVELOPMENT BRANCH ⚠️**

This branch contains the full development environment, including:
- Memory bank files
- Example files
- Development documentation
- Test files

**DO NOT MERGE THIS BRANCH DIRECTLY TO ANY PUBLISHING BRANCH!**

## Publishing Workflow Instructions

To publish this extension to Raycast store:

1. Make all your changes on this development branch
2. Run tests and verify everything works
3. When ready to publish, use:
   ```
   ./scripts/prepare-for-publish.sh
   ```
4. This script will:
   - Create a clean publish branch
   - Remove development-only files
   - Update the version in package.json if needed
   - Update the CHANGELOG.md if needed
   - Automatically edit README.md to remove Python references
   - Ensure metadata folder exists (required for Raycast)
   - Run linting and building to verify the extension works
   - Prepare for Raycast store submission

## How to Identify Your Branch

- **Development branch:** You should see memory-bank/ and metadata/ directories
- **Publish branch:** The memory-bank directory will be missing

## Safety Measures

1. Always check `git status` before making changes
2. Look for this warning file - if it's missing, you're on the wrong branch!
3. Run `./scripts/check-environment.sh` to verify your environment has development files 