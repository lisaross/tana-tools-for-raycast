# Tana Paste

A command-line tool that converts Markdown text to Tana Paste format for seamless integration with the Tana note-taking application.

## Overview

Tana Paste is a Python script that transforms Markdown content into a format compatible with Tana's paste functionality. It preserves the hierarchical structure of your Markdown documents, including headings, lists, and paragraphs, while converting them into Tana's node-based format.

## Features

- Converts Markdown headings (H1-H6) to Tana nodes with heading style
- Preserves bullet and numbered lists with proper indentation
- Maintains paragraph structure and formatting
- Handles nested content and hierarchical relationships
- Processes input from stdin for easy integration with other tools

## Installation

1. Clone this repository:
```bash
git clone https://github.com/yourusername/tana-paste.git
cd tana-paste
```

2. Make the script executable:
```bash
chmod +x script.py
```

## Usage

The script reads Markdown content from stdin and outputs the converted Tana Paste format to stdout. Here are some examples:

### Basic Usage
```bash
echo "# My Heading\n- List item" | ./script.py
```

### Using with a File
```bash
cat my-document.md | ./script.py
```

### Output Format
The script generates output in the following format:
```
%%tana%%
- !! Heading 1
  - !! Heading 2
    - List item
    - Another list item
  - Regular paragraph text
```

## Input Format Support

The script supports the following Markdown elements:
- Headings (H1-H6) using `#` syntax
- Bullet lists using `-`, `*`, or `+`
- Numbered lists
- Regular paragraphs
- Nested content through indentation

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Inspired by the Tana note-taking application
- Built with Python 3 