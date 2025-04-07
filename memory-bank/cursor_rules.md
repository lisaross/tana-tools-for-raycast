# Cursor Development Rules

## General Code Quality
- Always use TypeScript with strict typing
- Follow functional programming principles
- Write clean, self-documenting code with meaningful variable names
- Include JSDoc comments for functions and classes
- Follow SOLID principles
- Use modern ES6+ syntax
- Implement proper error handling

## Testing
- Write unit tests using Jest/Vitest
- Include test coverage for edge cases
- Follow TDD principles when applicable

## Security
- Follow OWASP security guidelines
- Never expose sensitive data or credentials
- Implement proper input validation

## Project Specific
- Follow project's established naming conventions
- Use prescribed design patterns
- Adhere to team's code style guide
- Prefer native solutions over third-party packages

## Documentation
- Include clear documentation
- Add relevant code comments
- Explain complex algorithms

## GitHub-Based Development Workflow

When working on ANY project, please follow this structured workflow:

NOTE: If the github repo is new, create labels for the github issues like this:
NAME              DESCRIPTION                                 COLOR  
bug               Something isn't working                     #d73a4a
documentation     Improvements or additions to documentation  #0075ca
duplicate         This issue or pull request already exists   #cfd3d7
enhancement       New feature or request                      #a2eeef
good first issue  Good for newcomers                          #7057ff
help wanted       Extra attention is needed                   #008672
invalid           This doesn't seem right                     #e4e669
question          Further information is requested            #d876e3
wontfix           This will not be worked on                  #ffffff
feature           New features for the application            #5319e7
performance       Performance improvements                    #e99695
security          Security related issues                     #d93f0b

1. For every new feature or bug fix:
   - Create a GitHub issue using the template below
   - When I ask you to create a new issue, I'll prompt you for:
     * Issue type (bug, feature, enhancement, etc.)
     * Issue title (concise description of the problem/feature)
     * Description (detailed explanation)
     * Acceptance criteria / Expected behavior
     * For bugs: Steps to reproduce and current behavior
     * Priority (high, medium, low)
     * Any related issues or dependencies

   - GITHUB ISSUE TEMPLATE:
     ```
     gh issue create --title "{ISSUE_TITLE}" --body "
     ## Description
     
     {DETAILED_DESCRIPTION}
     
     ## {ISSUE_TYPE_SPECIFIC_HEADING}
     
     {ISSUE_TYPE_SPECIFIC_CONTENT}
     
     ## Acceptance Criteria
     
     - [ ] {CRITERION_1}
     - [ ] {CRITERION_2}
     - [ ] {CRITERION_3}
     
     ## Additional Context
     
     {ANY_ADDITIONAL_INFORMATION}
     " --label "{PRIMARY_LABEL}" --label "{SECONDARY_LABEL}"
     ```

   - For BUG issues, use these specific sections:
     ```
     ## Current Behavior
     
     {DESCRIPTION_OF_THE_BUG}
     
     ## Expected Behavior
     
     {WHAT_SHOULD_HAPPEN_INSTEAD}
     
     ## Steps to Reproduce
     
     1. {STEP_1}
     2. {STEP_2}
     3. {STEP_3}
     
     ## Environment
     
     - OS: {OS_VERSION}
     - Browser/Device: {BROWSER_OR_DEVICE}
     - Version: {APP_VERSION}
     ```

   - For FEATURE/ENHANCEMENT issues, use these specific sections:
     ```
     ## Motivation
     
     {WHY_THIS_FEATURE_IS_NEEDED}
     
     ## Proposed Solution
     
     {SUGGESTION_FOR_IMPLEMENTATION}
     
     ## Alternatives Considered
     
     {OTHER_APPROACHES_CONSIDERED}
     ```

2. Branch management:
   - Create a new branch for each issue using the format: `<type>/<issue-number>-<issue-description>`
   - Types include: feature/, fix/, refactor/, docs/, chore/
   - Example: `fix/42-bullet-points-indentation` or `feature/17-dark-mode`
   - Always branch from the main/master branch unless working on a dependent feature

3. Code changes:
   - Make focused commits with clear commit messages
   - Reference the issue number in commit messages (#XX)
   - Update CHANGELOG.md with your changes under a ## [Unreleased] section
   - Ensure all tests pass and add new tests as appropriate
   - Follow the existing code style conventions

4. CHANGELOG.md management:
   - Ensure all projects have a CHANGELOG.md file (create one if it doesn't exist)
   - Follow the "Keep a Changelog" format (https://keepachangelog.com/)
   - Add entries under appropriate sections: Added, Changed, Fixed, Removed
   - For version updates, use the format: ## [version] - YYYY-MM-DD or ## [version] - {PR_MERGE_DATE}
   - Keep the most recent changes at the top

5. Pull Request process:
   - Create a PR with a clear description referencing the GitHub issue
   - Use this PR template:
     ```
     ## Description
     
     Fixes #XX
     
     Changes made:
     - Change 1
     - Change 2
     - Change 3
     
     ## Testing
     
     - [ ] Test case 1
     - [ ] Test case 2
     
     ## Screenshots/Recordings
     
     [If applicable]
     
     ## Checklist
     
     - [ ] CHANGELOG.md updated
     - [ ] Version number bumped (if applicable)
     - [ ] Documentation updated (if applicable)
     - [ ] Tests added/updated
     ```
   - Request reviews from appropriate team members
   - Address all review comments

6. After PR approval and merge:
   - Close the GitHub issue with a properly formatted comment:
     ```
     gh issue close XX --reason "completed" --comment "
     Fixed in PR #YY with the following improvements:
     
     - First improvement
     - Second improvement
     
     The fix is included in version Z.Z.Z
     "
     ```
   - Note: When using the GitHub CLI, always use multi-line strings with actual newlines (press Enter) rather than \n escape sequences
   - Pull the latest changes to your local main/master branch
   - Delete the feature branch locally and remotely if no longer needed

7. Version bumping:
   - Follow semantic versioning (MAJOR.MINOR.PATCH)
   - Increment PATCH for bug fixes (1.0.0 → 1.0.1)
   - Increment MINOR for backward-compatible features (1.0.0 → 1.1.0)
   - Increment MAJOR for breaking changes (1.0.0 → 2.0.0)
   - Update the version in all relevant files (package.json, etc.)

8. Documentation:
   - Update README.md if the changes affect usage, installation, or configuration
   - Ensure API documentation is up-to-date with any code changes
   - Add examples for new features when appropriate 