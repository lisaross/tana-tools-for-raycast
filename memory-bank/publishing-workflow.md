# Tana Paste Publishing Workflow

## Branch Structure

This project maintains two distinct environments:

1. **DEVELOPMENT ENVIRONMENT**
   - Contains full development files (memory-bank, examples, docs)
   - Branch: `development-with-memory-bank`
   - ALWAYS do development work here

2. **PUBLISH ENVIRONMENT**
   - Stripped down for Raycast store submission
   - Branch: Various branches named `publish-{version}-{timestamp}`
   - Used ONLY for publishing to Raycast store
   - NEVER make development changes here

## How to Identify Your Environment

- **Visual indicator**: The presence of `memory-bank/` directory
- **Check command**: Run `scripts/check-environment.sh`
- **Automatic checks**: Git hooks will warn when on a publish branch

## Development Workflow

1. ALWAYS work on the `development-with-memory-bank` branch
2. All features, fixes, and enhancements should be developed here
3. Any time you check out a branch, verify you're in the correct environment:
   ```
   ./scripts/check-environment.sh
   ```
4. If you accidentally end up on a publish branch:
   ```
   git checkout development-with-memory-bank
   ```

## Publishing Workflow

When ready to publish a new version to Raycast:

1. Ensure all changes are committed to the development branch
2. Run the publishing script:
   ```
   ./scripts/prepare-for-publish.sh
   ```
3. The script will automatically:
   - Create a clean publish branch
   - Remove all development-only files (memory-bank, examples, tests, Python script)
   - Keep only files needed for Raycast store
   - Update the README.md to remove Python references and development info
   - Update package.json with new version (if specified)
   - Update CHANGELOG.md with new version details (if needed)
   - Ensure metadata folder with screenshots exists
   - Run linting and build verification
4. After the script completes:
   - Review the changes
   - Test the extension in Raycast
   - Push to GitHub and create a PR to main
   - After merging PR, run `npm run publish` from main branch
5. Always switch back to development branch immediately after publishing:
   ```
   git checkout development-with-memory-bank
   ```

## Files Automatically Removed During Publishing

The publishing script automatically removes:

1. `memory-bank/` - All memory bank files
2. `examples/` - Example files and test data
3. `scripts/` - Development scripts 
4. `.github/DEVELOPMENT_WARNING.md` - Development warning
5. Test directories - `__tests__` directories in src
6. `tana_converter.py` - Python script 
7. `jest.config.mjs` - Jest configuration
8. `.cursorrules` - Cursor AI configuration
9. `.DS_Store` files - macOS metadata files

## Safety Measures

The following measures help prevent accidents:

1. **Warning file**: `.github/DEVELOPMENT_WARNING.md` exists only in development branches
2. **Environment checker**: `scripts/check-environment.sh` shows which environment you're in
3. **Git hook**: Post-checkout hook warns when on publish branches
4. **Branch naming**: Clear naming distinction between types

## CRITICAL: Preventing Branch Confusion

The most important rule: **NEVER DEVELOP ON A PUBLISH BRANCH**

If you find yourself without memory-bank files and didn't intentionally run the publish script:
1. STOP - don't make any changes
2. Run `git branch` to see which branch you're on
3. Run `git checkout development-with-memory-bank`
4. Verify with `./scripts/check-environment.sh` that you're back in the development environment

## Emergency Recovery

If memory-bank files are accidentally deleted:
1. Check for uncommitted changes:
   ```
   git status
   ```
2. If needed, stash changes:
   ```
   git stash
   ```
3. Return to development branch:
   ```
   git checkout development-with-memory-bank
   ```
4. Apply stashed changes if needed:
   ```
   git stash pop
   ``` 