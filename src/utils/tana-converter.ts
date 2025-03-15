/**
 * Represents different types of text elements that can be detected
 */
export type TextElement = {
  type: 'text' | 'url' | 'email' | 'lineBreak' | 'listItem';
  content: string;
  isNewSentence?: boolean;
};

/**
 * Converts any text input to Tana format, handling various text elements
 */
export function convertToTana(inputText: string): string {
  // Remove any existing Tana headers to prevent duplication
  const cleanedText = inputText.replace(/%%tana%%\n?/g, '');
  
  // Start with the Tana Paste identifier
  let tanaOutput = "%%tana%%\n";
  
  // First, try to parse as markdown
  if (isMarkdown(cleanedText)) {
    return convertMarkdownToTana(cleanedText);
  }
  
  // If not markdown, process as regular text
  const elements = parseTextElements(cleanedText.trim());
  let currentLevel = 0;
  let paragraphBuffer: TextElement[] = [];
  
  elements.forEach((element) => {
    switch (element.type) {
      case 'lineBreak':
        if (paragraphBuffer.length > 0) {
          const indent = "  ".repeat(currentLevel);
          tanaOutput += `${indent}- ${formatParagraph(paragraphBuffer)}\n`;
          paragraphBuffer = [];
        }
        break;
        
      case 'listItem':
        if (paragraphBuffer.length > 0) {
          const indent = "  ".repeat(currentLevel);
          tanaOutput += `${indent}- ${formatParagraph(paragraphBuffer)}\n`;
          paragraphBuffer = [];
        }
        const listIndent = "  ".repeat(currentLevel);
        tanaOutput += `${listIndent}- ${element.content}\n`;
        break;
        
      case 'url':
      case 'email':
      case 'text':
        if (element.isNewSentence && paragraphBuffer.length > 0) {
          const indent = "  ".repeat(currentLevel);
          tanaOutput += `${indent}- ${formatParagraph(paragraphBuffer)}\n`;
          paragraphBuffer = [];
        }
        paragraphBuffer.push(element);
        break;
    }
  });
  
  if (paragraphBuffer.length > 0) {
    const indent = "  ".repeat(currentLevel);
    tanaOutput += `${indent}- ${formatParagraph(paragraphBuffer)}\n`;
  }
  
  return tanaOutput;
}

/**
 * Checks if the input text appears to be markdown
 */
function isMarkdown(text: string): boolean {
  const markdownIndicators = [
    /^#{1,6}\s+/m,      // Headers
    /^\s*[-*+]\s+/m,    // Unordered lists
    /^\s*\d+\.\s+/m,    // Ordered lists
    /\[.+\]\(.+\)/,     // Links
    /\*\*.+\*\*/,       // Bold
    /_.+_/,             // Italic
    /```[\s\S]+```/,    // Code blocks
    /^\s*>\s+/m,        // Blockquotes
    /\|\s*[-:]+\s*\|/,  // Tables
    /^\s*-{3,}/m,       // Horizontal rules
    /\[\^.+\]:/m,       // Footnotes
  ];
  
  return markdownIndicators.some(indicator => indicator.test(text));
}

/**
 * Parses text into structured elements with improved list and sentence detection
 */
function parseTextElements(text: string): TextElement[] {
  const elements: TextElement[] = [];
  const lines = text.split('\n');
  
  // Common list item indicators
  const listItemIndicators = [
    /^(\d+\.|\*|\-|\+)\s/,  // Numbered lists or bullet points
    /^[A-Za-z]\)\s/,        // Letter lists like a) b) c)
    /^[A-Za-z]\.\s/,        // Letter lists like a. b. c.
    /^[•]\s/,               // Bullet point (exact match)
  ];

  let currentListItemBuffer = '';
  let isInListItem = false;
  
  lines.forEach((line, index) => {
    const trimmedLine = line.trim();
    
    if (trimmedLine === '') {
      if (currentListItemBuffer) {
        elements.push({ type: 'listItem', content: currentListItemBuffer.trim() });
        currentListItemBuffer = '';
        isInListItem = false;
      }
      elements.push({ type: 'lineBreak', content: '' });
      return;
    }
    
    // Check if line starts with a list indicator
    const isNewListItem = listItemIndicators.some(indicator => indicator.test(trimmedLine));
    
    if (isNewListItem) {
      // If we were already in a list item, push the buffered content
      if (currentListItemBuffer) {
        elements.push({ type: 'listItem', content: currentListItemBuffer.trim() });
      }
      
      // Start new list item
      currentListItemBuffer = trimmedLine.replace(/^[•]\s+/, '');
      isInListItem = true;
    } else if (isInListItem) {
      // Continue previous list item
      currentListItemBuffer += ' ' + trimmedLine;
    } else {
      // Regular text processing
      const sentences = trimmedLine.split(/(?<=[.!?])\s+/);
      sentences.forEach((sentence, sentenceIndex) => {
        const words = sentence.split(/\s+/);
        words.forEach((word, wordIndex) => {
          if (isUrl(word)) {
            elements.push({ type: 'url', content: formatUrl(word), isNewSentence: wordIndex === 0 });
          } else if (isEmail(word)) {
            elements.push({ type: 'email', content: formatEmail(word), isNewSentence: wordIndex === 0 });
          } else {
            elements.push({ 
              type: 'text', 
              content: word, 
              isNewSentence: wordIndex === 0 && sentenceIndex > 0
            });
          }
          
          // Add space between words if not the last word
          if (wordIndex < words.length - 1) {
            elements.push({ type: 'text', content: ' ' });
          }
        });
      });
    }
  });
  
  // Handle any remaining list item buffer
  if (currentListItemBuffer) {
    elements.push({ type: 'listItem', content: currentListItemBuffer.trim() });
  }
  
  return elements;
}

/**
 * Converts markdown text to Tana format with proper hierarchy
 */
function convertMarkdownToTana(markdownText: string): string {
  let tanaOutput = "%%tana%%\n";
  const lines = markdownText.trim().split('\n');
  
  let currentLevel = 0;
  let listLevel = 0;
  let inList = false;
  let inBlockquote = false;
  let blockquoteLevel = 0;
  let paragraphBuffer: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    // Skip empty lines but process any buffered content
    if (!trimmedLine) {
      if (paragraphBuffer.length > 0) {
        const indent = "  ".repeat(currentLevel + (inList ? listLevel : 0) + (inBlockquote ? blockquoteLevel : 0));
        tanaOutput += `${indent}- ${paragraphBuffer.join(' ')}\n`;
        paragraphBuffer = [];
      }
      continue;
    }
    
    // Handle headers
    const headerMatch = trimmedLine.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      if (paragraphBuffer.length > 0) {
        const indent = "  ".repeat(currentLevel);
        tanaOutput += `${indent}- ${paragraphBuffer.join(' ')}\n`;
        paragraphBuffer = [];
      }
      
      const level = headerMatch[1].length - 1;
      const content = headerMatch[2];
      const indent = "  ".repeat(level);
      tanaOutput += `${indent}- ${content}\n`;
      currentLevel = level + 1;
      continue;
    }
    
    // Handle lists
    const listMatch = trimmedLine.match(/^(\s*)([-*+]|\d+\.)\s+(.+)$/);
    if (listMatch) {
      if (paragraphBuffer.length > 0) {
        const indent = "  ".repeat(currentLevel);
        tanaOutput += `${indent}- ${paragraphBuffer.join(' ')}\n`;
        paragraphBuffer = [];
      }
      
      const indentLevel = Math.floor(listMatch[1].length / 2);
      const content = listMatch[3];
      const totalIndent = "  ".repeat(currentLevel + indentLevel);
      tanaOutput += `${totalIndent}- ${content}\n`;
      inList = true;
      listLevel = indentLevel;
      continue;
    }
    
    // Handle blockquotes
    const blockquoteMatch = trimmedLine.match(/^(>+)\s*(.+)$/);
    if (blockquoteMatch) {
      if (paragraphBuffer.length > 0) {
        const indent = "  ".repeat(currentLevel);
        tanaOutput += `${indent}- ${paragraphBuffer.join(' ')}\n`;
        paragraphBuffer = [];
      }
      
      const quoteLevel = blockquoteMatch[1].length;
      const content = blockquoteMatch[2];
      const indent = "  ".repeat(currentLevel + quoteLevel);
      tanaOutput += `${indent}- ${content}\n`;
      inBlockquote = true;
      blockquoteLevel = quoteLevel;
      continue;
    }
    
    // Reset list and blockquote state if we're not in a list/blockquote anymore
    if (!listMatch && inList) {
      inList = false;
      listLevel = 0;
    }
    if (!blockquoteMatch && inBlockquote) {
      inBlockquote = false;
      blockquoteLevel = 0;
    }
    
    // Handle regular text and other elements
    paragraphBuffer.push(trimmedLine);
  }
  
  // Process any remaining content
  if (paragraphBuffer.length > 0) {
    const indent = "  ".repeat(currentLevel);
    tanaOutput += `${indent}- ${paragraphBuffer.join(' ')}\n`;
  }
  
  return tanaOutput;
}

/**
 * Formats a URL for Tana
 */
function formatUrl(url: string): string {
  return `[${url}](${url})`;
}

/**
 * Formats an email address for Tana
 */
function formatEmail(email: string): string {
  return `[${email}](mailto:${email})`;
}

/**
 * Formats a paragraph of text elements
 */
function formatParagraph(elements: TextElement[]): string {
  return elements.map(element => element.content).join('');
}

/**
 * Checks if a string is a valid URL
 */
function isUrl(text: string): boolean {
  try {
    new URL(text);
    return true;
  } catch {
    return /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/.test(text);
  }
}

/**
 * Checks if a string is a valid email address
 */
function isEmail(text: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
} 