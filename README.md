# Tana Tools for Raycast

Quickly convert text, Markdown, YouTube, and Limitless content to Tana Paste format—right from Raycast.

> **Note:** This is not an official Tana product. Made with nerd love by Lisa Ross. Suggestions welcome—open a GitHub issue or DM me on Slack!

## Features

- Convert clipboard or selected text to Tana Paste format
- Clip the main content of any web page and instantly convert it to a clean, organized Tana outline
- Edit and preview before converting
- Extract and format YouTube video metadata and transcripts
- Supports Limitless Pendant and Limitless App transcriptions
- Supports most Markdown transformations (headings, lists, paragraphs, nesting, etc.)
- Compatible with all browsers: Chrome, Safari, Firefox, and Zen Browser

## Commands

**All commands automatically open Tana when complete** — just paste your content with ⌘+V.

- **Quick Clipboard to Tana:**
  Copy any text or Markdown to your clipboard, run the command, and the content is instantly cleaned and converted to Tana Paste format.

- **Paste and Edit for Tana:**
  Like Quick Clipboard, but lets you review and edit your content in a Raycast window before converting.

- **Convert Selected Text to Tana:**
  Highlight text in any application, run the command, and it's converted to Tana Paste format. If the selection is from a website, it includes the page title and URL.

- **YouTube to Tana:**
  Go to a YouTube video page, run the command, and get the video title, URL, channel, description, and transcript formatted for Tana. *Note: Longer videos may take additional time for transcript extraction.*

- **Copy Page Content to Tana Paste:**
  Extract the main content from any web page, organized under the page title with URL included.

- **Limitless Pendant/App:**
  Convert Limitless transcriptions to clean, structured Tana outlines.

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

---

## For Developers

### Installation & Development

1. Install [Raycast](https://raycast.com/)
2. Clone this repo and install dependencies:

   ```sh
   git clone https://github.com/lisaross/tana-tools-for-raycast.git
   cd tana-tools-for-raycast
   npm install
   ```

3. Build and start development:

   ```sh
   npm run build
   npm run dev
   ```

### Contributing

Contributions are welcome! Please feel free to submit a Pull Request. Open an issue if you want a feature.

### Technical

- TypeScript, Raycast API v1.99.2

## License

MIT License
