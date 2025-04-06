# Greptile Recommendations Checklist

This checklist covers common issues flagged by the Greptile bot in Raycast extension PRs. Use this to systematically verify that our code meets Raycast's standards.

## Code Style & Formatting

- [ ] Use 2 spaces for indentation consistently
- [ ] Remove unnecessary semicolons (Raycast prefers no semicolons)
- [ ] Use single quotes instead of double quotes for strings 
- [ ] Remove trailing whitespace
- [ ] Remove commented out code
- [ ] Ensure consistent newlines at end of files
- [ ] Use template literals instead of string concatenation

## TypeScript Best Practices

- [ ] Provide proper TypeScript types for all variables and functions
- [ ] Avoid using `any` type
- [ ] Use explicit return types for functions
- [ ] Use interfaces for object types
- [ ] Ensure consistent use of optional chaining and nullish coalescing
- [ ] Use type imports (`import type`) for types

## React Best Practices

- [ ] Use functional components instead of class components
- [ ] Use proper React hooks practices (rules of hooks)
- [ ] Extract complex logic from JSX
- [ ] Avoid unnecessary re-renders
- [ ] Use proper key props in lists

## Raycast API Usage

- [ ] Follow Raycast API patterns for commands
- [ ] Implement proper error handling
- [ ] Use Raycast UI components correctly
- [ ] Follow Raycast's state management patterns
- [ ] Use proper action patterns

## Documentation

- [ ] Ensure README.md is complete and well-formatted
- [ ] Update CHANGELOG.md with proper version and date format
- [ ] Use proper JSDoc comments for public functions
- [ ] Ensure package.json has correct metadata
- [ ] Check command descriptions for clarity

## Project Structure

- [ ] Follow Raycast's folder structure conventions
- [ ] Place types in appropriate locations
- [ ] Organize components logically
- [ ] Keep files reasonably sized
- [ ] Use consistent filename patterns

## Performance & Best Practices

- [ ] Avoid unnecessary dependencies
- [ ] Implement proper caching where appropriate
- [ ] Handle async operations correctly
- [ ] Implement proper error states
- [ ] Use Raycast preferences correctly

## Assets

- [ ] Ensure command icon meets requirements
- [ ] Provide appropriate screenshots/GIFs for README
- [ ] Check image formats and sizes 