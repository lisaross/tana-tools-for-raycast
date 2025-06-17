# Tana Tools for Raycast

Convert clipboard content, Markdown, YouTube, and Limitless content to Tana Paste format from Raycast.

> **⚠️ Important:** Web-based commands require the [Raycast Browser Extension](https://raycast.com/browser-extension)

> **Note:** Unofficial Tana tool by Lisa Ross. Suggestions welcome via GitHub issues or Slack DM.

## Features

- Convert clipboard or web content to Tana Paste format
- Extract and format YouTube video metadata and transcripts using Raycast Browser Extension API
- Process Limitless Pendant and App transcriptions
- Edit content before converting
- Support for Markdown transformations (headings, lists, nesting)
- Web extractions: Compatible with Chrome, Arc, and Safari
- Automatic Tana app opening after content conversion

## Commands

*All commands automatically open Tana and copy content to clipboard for pasting with ⌘+V.*

- **Quick Clipboard to Tana:** Instantly convert clipboard content to Tana format
- **Paste and Edit for Tana:** Review and edit content before converting
- **YouTube to Tana:** Extract video title, URL, channel, description, duration, and transcript from active YouTube tab (requires manually clicking "Show transcript" first)
- **Copy Page Content to Tana Paste:** Extract main content from web pages

## Prerequisites

### ⚠️ Required: Raycast Browser Extension

**All web-based commands require the Raycast Browser Extension to be installed and enabled:**

1. Install the [Raycast Browser Extension](https://raycast.com/browser-extension)
2. Follow Raycast's setup instructions for your browser
3. Ensure the extension is active and has necessary permissions

### For YouTube Functionality

1. **Browser Setup:**
   - **Arc/Chrome:** Works seamlessly with Browser Extension
   - **Safari:** Requires Browser Extension + additional configuration:
     - Safari Settings → Advanced → ✓ "Show features for web developers"
     - Safari Settings → Developer → ✓ "Allow JavaScript from Apple Events"
     - Reload YouTube page after enabling these settings

2. **Usage Steps (Important!):**
   - Open a YouTube video in your browser
   - Ensure the YouTube tab is active
   - **🔴 REQUIRED for transcripts:** Manually click "Show transcript" below the video
     - Look for the transcript button in the video description area
     - This must be done BEFORE running the Raycast command
     - Without this step, only basic video info will be extracted
   - Run the Raycast command

### For Web Content Extraction

Requires Raycast Browser Extension. Compatible with Chrome, Arc, and Safari for extracting page content.

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
