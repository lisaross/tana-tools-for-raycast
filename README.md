# Tana Paste - Raycast Extension

A Raycast extension that converts clipboard content to Tana Paste format. Perfect for quickly transforming Markdown text into Tana's node-based structure.

## Features

- Automatically converts clipboard content to Tana Paste format
- Supports Markdown elements:
  - Headings (H1-H6)
  - Bullet lists (`-`, `*`, `+`)
  - Numbered lists
  - Paragraphs
  - Nested content with proper indentation
- No UI needed - works directly with your clipboard
- Instant feedback via HUD notifications

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

1. Copy your Markdown text to clipboard (⌘+C)
2. Open Raycast (⌘+Space)
3. Type "Copy Clipboard to Tana Paste"
4. Press Enter
5. Your clipboard now contains the Tana-formatted version
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

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details. 