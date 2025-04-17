# Tana Paste for Raycast

A Raycast extension that converts various text formats into Tana's paste format. This extension is particularly useful for converting meeting transcripts, notes, and other structured text into Tana's hierarchical format.

## Features

- Converts meeting transcripts with speaker names and timestamps
- Handles YouTube transcript formats with timestamps
- Supports bullet points and numbered lists
- Maintains proper indentation and hierarchy
- Preserves code blocks and formatting
- Converts headers and sections
- Handles mixed format lists (numbers and symbols)

## Installation

1. Install the extension from the [Raycast Store](https://www.raycast.com/lisaross/tana-paste)
2. Open Raycast and search for "Tana Paste"
3. Select the text you want to convert
4. The converted text will be copied to your clipboard in Tana's format

## Usage

### Basic Usage

1. Copy any text you want to convert
2. Open Raycast (⌘ + Space)
3. Type "Tana Paste"
4. Press Enter
5. The converted text will be copied to your clipboard
6. Paste into Tana (⌘ + V)

### Supported Formats

#### Meeting Transcript Example

Input:
```
Meeting Title

Discussion Topic

Speaker 1: Hello everyone.
You: Good morning.
```

Output:
```
%%tana%%
- Meeting Title
  - Discussion Topic
    - Speaker 1 (00:29:03): Hello everyone.
    - You (00:29:03): Good morning.
```

### New Transcription Format Example

Input:
```
Speaker 1

Yesterday, 11:00 AM
Lisa, hi.
Hello. Hello.
Speaker 2

Yesterday, 11:00 AM
You're on mute. It going?
Speaker 1

Yesterday, 11:00 AM
Yeah. Pretty good. Pretty good. How are you? Very good.
Hey.
Speaker 3
```

Output:
```
%%tana%%
- Speaker 1: Lisa, hi.
- Speaker 1: Hello. Hello.
- Speaker 2: You're on mute. It going?
- Speaker 1: Yeah. Pretty good. Pretty good. How are you? Very good.
- Speaker 1: Hey.
- Speaker 3
```

### YouTube Transcript Example

Input:
```markdown
> [00:00] Introduction to the topic
> 
> [01:30] Key concept explanation
> 
> [05:45] Summary and conclusion
```

Output:
```
%%tana%%
- [00:00] Introduction to the topic
- [01:30] Key concept explanation
- [05:45] Summary and conclusion
```

## Development

This project is built with:
- TypeScript
- Raycast Extension API

For development, you can use the standard Raycast development commands:

```bash
npm run dev     # Development mode with hot reload
npm run build   # Build the extension
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.
