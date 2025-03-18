# Tana Paste - Raycast Extension

A Raycast extension that converts clipboard content to Tana Paste format. Perfect for quickly transforming Markdown text into Tana's node-based structure.

## Features

- Multiple ways to convert content:
  - Quick clipboard conversion (no UI)
  - Paste and edit interface for reviewing before conversion
  - Convert selected text directly
- Automatically converts clipboard content to Tana Paste format
- Supports Markdown elements:
  - Headings (H1-H6)
  - Bullet lists (`-`, `*`, `+`)
  - Numbered lists
  - Paragraphs
  - Nested content with proper indentation
- Instant feedback via HUD notifications
- TypeScript implementation with strict typing
- Comprehensive error handling

## Installation

1. Make sure you have [Raycast](https://raycast.com/) installed
2. Install Node.js and npm if you haven't already
3. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/tana-paste.git
   cd tana-paste
   ```
4. Install dependencies:
   ```bash
   npm install
   ```
5. Build the extension:
   ```bash
   npm run build
   ```
6. Start development mode:
   ```bash
   npm run dev
   ```

## Usage

### Quick Clipboard Conversion
1. Copy your Markdown text to clipboard (⌘+C) (examples in the examples directory for testing)
2. Open Raycast (⌘+Space)
3. Type "Quick Clipboard to Tana"
4. Press Enter
5. Your clipboard now contains the Tana-formatted version
6. Paste into Tana (⌘+V)

### Paste and Edit Mode
1. Open Raycast (⌘+Space)
2. Type "Paste and Edit for Tana"
3. Press Enter
4. Edit your text in the interface
5. Press Enter to convert and copy to clipboard
6. Paste into Tana (⌘+V)

### Convert Selected Text
1. Select text in any application
2. Open Raycast (⌘+Space)
3. Type "Convert Selected Text to Tana"
4. Press Enter
5. The converted text is now in your clipboard
6. Paste into Tana (⌘+V)

### Example

Input (in clipboard):
```markdown
# My Heading
## Subheading
- List item 1
  - Nested item
    - Deep nested item
This is a paragraph.
```

Output (after conversion):
```
%%tana%%
- !! My Heading
  - !! Subheading
    - List item 1
      - Nested item
        - Deep nested item
    - This is a paragraph.
```

## Development

- `npm run dev` - Start development mode
- `npm run build` - Build the extension
- `npm run lint` - Run linter

## Technical Details

- Built with TypeScript and strict type checking
- Uses Raycast API v1.55.2
- Follows functional programming principles
- Implements comprehensive error handling
- Includes proper input validation

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details. 