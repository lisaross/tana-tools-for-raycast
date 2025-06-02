# Tana Tools for Raycast

Convert text, Markdown, YouTube, and Limitless content to Tana Paste format from Raycast.

> **Note:** Unofficial Tana tool by Lisa Ross. Suggestions welcome via GitHub issues or Slack DM.

## Features

- Convert clipboard, selected text, or web content to Tana Paste format
- Extract and format YouTube video metadata and transcripts
- Process Limitless Pendant and App transcriptions
- Edit and preview content before converting
- Support for Markdown transformations (headings, lists, nesting)
- Compatible with Chrome, Arc, and Safari

## Commands

*All commands automatically open Tana and copy content to clipboard for pasting with ⌘+V.*

- **Quick Clipboard to Tana:** Instantly convert clipboard content to Tana format
- **Paste and Edit for Tana:** Review and edit content before converting
- **Convert Selected Text to Tana:** Convert highlighted text (includes page title/URL for web content)
- **YouTube to Tana:** Extract video title, URL, channel, description, and transcript
- **Copy Page Content to Tana Paste:** Extract main content from web pages
- **Limitless Pendant/App:** Convert transcriptions to structured Tana outlines

## Prerequisites

YouTube functionality requires Chrome, Arc, or Safari as the frontmost browser. Other commands work without browser requirements.

## Example

**Input:**
```markdown
# My Heading
- List item
```

**Output:**
```text
%%tana%%
- !! My Heading
  - List item
```

## Development

### Setup

1. Install [Raycast](https://raycast.com/)
2. Clone and install:
   ```sh
   git clone https://github.com/lisaross/tana-tools-for-raycast.git
   cd tana-tools-for-raycast
   npm install
   npm run build
   npm run dev
   ```

### Contributing

Contributions welcome! Submit Pull Requests or open issues for feature requests.

### Technical Stack

TypeScript, Raycast API v1.99.2

## License

MIT License
