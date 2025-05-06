# Tana Converter Module

This directory contains a modular implementation of the Tana converter, which transforms various text formats into Tana's hierarchical note structure.

## Module Structure

The code is organized into the following modules:

- **index.ts**: Main entry point that brings together all modules and exports the public API
- **types.ts**: Type definitions and constants used throughout the converter
- **line-parser.ts**: Functions for parsing and processing text lines
- **date-formatter.ts**: Date detection and conversion utilities
- **formatters.ts**: Text formatting functions for various content types
- **transcript-processor.ts**: Specialized functions for handling transcript formats

## Usage

The main module re-exports all necessary functions:

```typescript
import { convertToTana } from '../tana-converter';

const tanaFormatted = convertToTana(markdownText);
```

## Module Relationships

```
types.ts
   ↑
   |
   +----------------+----------------+----------------+
   |                |                |                |
line-parser.ts  date-formatter.ts  formatters.ts  transcript-processor.ts
   |                |                |                |
   +----------------+----------------+----------------+
                               ↓
                            index.ts
                               ↓
                        tana-converter.ts
```

## Public API

- `convertToTana(text: string): string`: Main function to convert text to Tana format
- `processTableRow(text: string): string`: Utility for processing table rows
- `TextElement`: Type definition for text elements

## Testing

The `_test` export provides access to internal functions for testing purposes.

## Notes

This modular structure replaced the original monolithic implementation to improve:
- Code organization and maintainability
- Type safety
- Testability
- Documentation 