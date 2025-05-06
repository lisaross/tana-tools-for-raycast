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
   scripts/check-environment.sh
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
   scripts/prepare-for-publish.sh
   ```
3. Follow the on-screen instructions to:
   - Create a clean publish branch
   - Specify version number
   - Remove development-only files
   - Test the build
   - Push to GitHub
4. Create a PR from the publish branch to the `main` branch
5. After publishing, immediately switch back to development:
   ```
   git checkout development-with-memory-bank
   ```

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
4. Verify with `ls memory-bank/` that you're back in the development environment

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