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
- Converter implementation in `src/utils/tana-converter/`
- Core module exports via `src/utils/tana-converter.ts`
