/**
 * Represents different types of text elements that can be detected
 */
export type TextElement = {
  type: 'text' | 'url' | 'email' | 'lineBreak' | 'listItem' | 'header';
  content: string;
  level?: number;
};

/**
 * Converts any text input to Tana format
 * @param inputText - The text to convert. Can be empty or undefined if text selection fails
 * @returns Formatted Tana text or error message if input is invalid
 */
export function convertToTana(inputText: string | undefined | null): string {
  // Handle empty or invalid input
  if (!inputText) {
    return "No text selected. Please select some text and try again.";
  }

  if (typeof inputText !== 'string') {
    return "Invalid input. Expected text but received " + typeof inputText;
  }

  // Remove any existing Tana headers to prevent duplication
  let cleanedText = inputText.replace(/%%tana%%\n?/g, '');
  
  // Clean up common web artifacts
  cleanedText = cleanedText
    // Remove language artifacts
    .replace(/\s*\\.*?\[language\.\.\.\]\(language\.\.\.\)/g, '')
    // Remove self-referential links like [team:](team:)
    .replace(/\[([^\]]+:)\]\(\1\)/g, '$1')
    // Remove duplicate colons
    .replace(/:{2,}/g, ':')
    // Clean up any remaining [text](text) style artifacts where text is identical
    .replace(/\[([^\]]+)\]\(\1\)/g, '$1')
    // Clean up any remaining [...] style artifacts
    .replace(/\[([^\]]+\.\.\.)\]\([^\)]+\)/g, '$1')
    // Clean up any remaining (...) style artifacts
    .replace(/\([^\)]*\.\.\.\)/g, '')
    .trim();

  // Handle case where text is empty after cleaning
  if (!cleanedText) {
    return "Text is empty after cleaning. Please try with different text.";
  }

  // Start with the Tana Paste identifier
  let tanaOutput = "%%tana%%\n";
  
  try {
    // Split into lines and process each one
    const lines = cleanedText.split('\n');
    let currentIndentLevel = 0;
    let inList = false;
    let listIndentStack: number[] = [];

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trimEnd();
      if (!line.trim()) continue;

      // Process headers
      const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headerMatch) {
        const level = headerMatch[1].length;
        const content = headerMatch[2];
        const indent = "  ".repeat(level - 1);
        tanaOutput += `${indent}- ${content}\n`;
        currentIndentLevel = level - 1;
        continue;
      }

      // Process unordered lists
      const unorderedListMatch = line.match(/^(\s*)[*+-]\s+(.+)$/);
      if (unorderedListMatch) {
        const indentSpaces = unorderedListMatch[1].length;
        const content = unorderedListMatch[2];
        const level = Math.floor(indentSpaces / 2);
        const indent = "  ".repeat(level);
        tanaOutput += `${indent}- ${content}\n`;
        inList = true;
        listIndentStack = [level];
        continue;
      }

      // Process ordered lists
      const orderedListMatch = line.match(/^(\s*)\d+\.\s+(.+)$/);
      if (orderedListMatch) {
        const indentSpaces = orderedListMatch[1].length;
        const content = orderedListMatch[2];
        const level = Math.floor(indentSpaces / 2);
        const indent = "  ".repeat(level);
        tanaOutput += `${indent}- ${content}\n`;
        inList = true;
        listIndentStack = [level];
        continue;
      }

      // Process blockquotes
      const blockquoteMatch = line.match(/^(\s*>+)\s*(.+)$/);
      if (blockquoteMatch) {
        const quoteLevel = blockquoteMatch[1].split('>').length - 1;
        const content = blockquoteMatch[2];
        const indent = "  ".repeat(quoteLevel);
        tanaOutput += `${indent}- ${content}\n`;
        continue;
      }

      // Process task lists
      const taskListMatch = line.match(/^(\s*)-\s+\[([ x])\]\s+(.+)$/);
      if (taskListMatch) {
        const indentSpaces = taskListMatch[1].length;
        const isChecked = taskListMatch[2] === 'x';
        const content = `${isChecked ? '✓ ' : '☐ '}${taskListMatch[3]}`;
        const level = Math.floor(indentSpaces / 2);
        const indent = "  ".repeat(level);
        tanaOutput += `${indent}- ${content}\n`;
        continue;
      }

      // Process definition lists
      const definitionMatch = line.match(/^:\s+(.+)$/);
      if (definitionMatch) {
        const content = definitionMatch[1];
        const indent = "  ".repeat(currentIndentLevel + 1);
        tanaOutput += `${indent}- ${content}\n`;
        continue;
      }

      // Process tables
      if (line.includes('|')) {
        const cells = line.split('|').filter(cell => cell.trim());
        if (cells.length > 0) {
          // Skip table separators (lines with dashes and pipes)
          if (!/^[-|]+$/.test(line.trim())) {
            const indent = "  ".repeat(currentIndentLevel);
            tanaOutput += `${indent}- ${cells.map(cell => cell.trim()).join(' | ')}\n`;
          }
          continue;
        }
      }

      // Process horizontal rules
      if (/^[-*_]{3,}$/.test(line.trim())) {
        tanaOutput += "- ---\n";
        continue;
      }

      // Handle regular paragraphs
      if (!inList) {
        const indent = "  ".repeat(currentIndentLevel);
        tanaOutput += `${indent}- ${line}\n`;
      } else {
        // If it's a continuation of a list item, append to the previous line
        const lastNewlineIndex = tanaOutput.lastIndexOf('\n', tanaOutput.length - 2);
        const upToLastLine = tanaOutput.slice(0, lastNewlineIndex + 1);
        const lastLine = tanaOutput.slice(lastNewlineIndex + 1, -1);
        tanaOutput = upToLastLine + lastLine + ' ' + line + '\n';
      }
    }
    
    return tanaOutput;
  } catch (error) {
    console.error('Error converting text to Tana format:', error);
    return "Error converting text. Please try again with different text.";
  }
}