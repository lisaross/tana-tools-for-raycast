# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- Build: `npm run build`
- Development: `npm run dev`
- Lint: `npm run lint`
- Publish extension: `npm run publish`

## Coding Standards

- **Formatting**: 2-space indentation, single quotes, trailing commas, semicolons
- **Types**: Use explicit TypeScript types/interfaces, readonly where appropriate
- **Imports**: Group external libraries first, then internal modules
- **Naming**: PascalCase for classes/types, camelCase for variables/functions, UPPER_SNAKE_CASE for constants
- **Error Handling**: Use custom error classes derived from TanaConverterError with rich context
- **Components**: Use functional React components with async functions for Raycast commands
- **Documentation**: Add JSDoc comments for all public functions, methods and classes
- **Architecture**: Follow pure functional programming principles with immutable data structures
- **Testing**: Currently no explicit testing framework - validate changes manually

## Project Structure

This extension provides tools to convert various formats to Tana Paste format:

- Command files in `src/` for Raycast commands
- Centralized utilities in `src/utils/page-content-extractor.ts`
- Legacy converter in `src/utils/tana-converter/` (avoid using)

## Key Architecture Principles

### Browser Tab Detection
- **NEVER use** `tabs.find(tab => tab.active)` - it finds wrong tabs from different browser windows
- **ALWAYS use** focused tab title matching approach:
  1. Get focused tab title via `BrowserExtension.getContent()` without tabId
  2. Match that title in the tabs list from `BrowserExtension.getTabs()`
  3. Fall back to highest ID tab if no match found

### Content Processing Pipeline
1. Extract content using `BrowserExtension.getContent()` with reader mode
2. Convert HTML to markdown using TurndownService if needed
3. Unescape Raycast's escaped markdown (`unescapeRaycastMarkdown()`)
4. Remove problematic content (`cleanContentForTana()`)
5. Format for Tana using centralized `formatForTana()` utility

### Tana Format Guidelines
- Use centralized `formatForTana()` function for ALL Tana formatting
- Escape `#` symbols to `\#` to prevent unwanted tag creation
- Convert markdown headers (`## Header`) to Tana headings (`!! Header`)
- Remove `::` from content to prevent accidental field creation
- Use flat structure under `Content::` field for better hierarchy

### Content Cleaning
- Remove image references (`!Image url` patterns)
- Remove javascript:void links
- Fix broken markdown links across multiple lines
- Convert relative URLs to absolute URLs when base URL available
