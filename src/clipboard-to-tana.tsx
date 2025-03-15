import { Clipboard, showHUD } from "@raycast/api";

/**
 * Represents different types of text elements that can be detected
 */
type TextElement = {
  type: 'text' | 'url' | 'email' | 'lineBreak' | 'listItem';
  content: string;
  isNewSentence?: boolean;
};

export default async function Command() {
  try {
    // Get clipboard content
    const clipboardText = await Clipboard.readText();
    
    if (!clipboardText) {
      await showHUD("No text in clipboard");
      return;
    }

    // Convert to Tana format
    const tanaOutput = convertToTana(clipboardText);
    
    // Copy back to clipboard
    await Clipboard.copy(tanaOutput);
    
    // Show success message
    await showHUD("Converted to Tana format");
  } catch (error) {
    console.error('Error processing text:', error);
    await showHUD("Failed to convert text");
  }
}

/**
 * Converts any text input to Tana format, handling various text elements
 */
function convertToTana(inputText: string): string {
  // Start with the Tana Paste identifier
  let tanaOutput = "%%tana%%\n";
  
  // First, try to parse as markdown
  if (isMarkdown(inputText)) {
    return convertMarkdownToTana(inputText);
  }
  
  // If not markdown, process as regular text
  const elements = parseTextElements(inputText.trim());
  let currentLevel = 0;
  let paragraphBuffer: TextElement[] = [];
  
  elements.forEach((element, index) => {
    switch (element.type) {
      case 'lineBreak':
        if (paragraphBuffer.length > 0) {
          const indent = "  ".repeat(currentLevel);
          tanaOutput += `${indent}- ${formatParagraph(paragraphBuffer)}\n`;
          paragraphBuffer = [];
        }
        break;
        
      case 'listItem':
        // Process any buffered paragraph before the list item
        if (paragraphBuffer.length > 0) {
          const indent = "  ".repeat(currentLevel);
          tanaOutput += `${indent}- ${formatParagraph(paragraphBuffer)}\n`;
          paragraphBuffer = [];
        }
        // Add the list item with proper indentation
        const listIndent = "  ".repeat(currentLevel);
        tanaOutput += `${listIndent}- ${element.content}\n`;
        break;
        
      case 'url':
      case 'email':
      case 'text':
        // If this is a new sentence and we have content, create a new node
        if (element.isNewSentence && paragraphBuffer.length > 0) {
          const indent = "  ".repeat(currentLevel);
          tanaOutput += `${indent}- ${formatParagraph(paragraphBuffer)}\n`;
          paragraphBuffer = [];
        }
        paragraphBuffer.push(element);
        break;
    }
  });
  
  // Process any remaining paragraph
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
            elements.push({ type: 'url', content: word, isNewSentence: wordIndex === 0 });
          } else if (isEmail(word)) {
            elements.push({ type: 'email', content: word, isNewSentence: wordIndex === 0 });
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

function convertMarkdownToTana(markdownText: string): string {
  // Start with the Tana Paste identifier
  let tanaOutput = "%%tana%%\n";
  
  // Split into lines
  const lines = markdownText.trim().split('\n');
  
  // Track the current heading level and content
  let currentLevel = 0;
  let paragraphBuffer: string[] = [];
  let isInList = false;
  let hadTextAfterHeading = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check for headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    
    // Check for bullet or numbered lists
    const listMatch = line.match(/^(\s*)([\*\-\+]|\d+\.)\s+(.+)$/);
    
    if (headingMatch) {
      // Process any buffered paragraph
      if (paragraphBuffer.length > 0) {
        const indent = "  ".repeat(currentLevel);
        tanaOutput += `${indent}- ${paragraphBuffer.join(" ")}\n`;
        paragraphBuffer = [];
      }
      
      const level = headingMatch[1].length;
      const headingText = headingMatch[2];
      
      // Add heading as a node with heading style
      const indent = "  ".repeat(level - 1);
      tanaOutput += `${indent}- !! ${headingText}\n`;
      
      currentLevel = level;
      isInList = false;
      hadTextAfterHeading = false;
      
    } else if (listMatch) {
      // Process any buffered paragraph before starting a list
      if (paragraphBuffer.length > 0 && !isInList) {
        const indent = "  ".repeat(currentLevel);
        tanaOutput += `${indent}- ${paragraphBuffer.join(" ")}\n`;
        paragraphBuffer = [];
        hadTextAfterHeading = true;
      }
      
      // Extract list content
      const leadingSpace = listMatch[1];
      const listContent = listMatch[3];
      
      // Calculate list level based on indentation
      const listIndentLevel = leadingSpace.replace(/\t/g, "  ").length / 2;
      
      // Determine total indentation level
      const totalIndentLevel = !hadTextAfterHeading && listIndentLevel === 0
        ? currentLevel
        : currentLevel + listIndentLevel + 1;
        
      const indent = "  ".repeat(totalIndentLevel);
      
      // Add as a node
      tanaOutput += `${indent}- ${listContent}\n`;
      isInList = true;
      
    } else if (line.trim() === "") {
      // Empty line - flush paragraph buffer
      if (paragraphBuffer.length > 0) {
        const indent = "  ".repeat(currentLevel);
        tanaOutput += `${indent}- ${paragraphBuffer.join(" ")}\n`;
        paragraphBuffer = [];
        hadTextAfterHeading = true;
      }
      isInList = false;
      
    } else {
      // Regular text handling
      if (!isInList) {
        if (paragraphBuffer.length > 0) {
          paragraphBuffer.push(line);
        } else {
          paragraphBuffer = [line];
        }
        hadTextAfterHeading = true;
      } else {
        // Handle continuation of list items or new paragraphs
        if (line.startsWith("    ") && !line.match(/^\s*([\*\-\+]|\d+\.)\s+/)) {
          const totalIndentLevel = !hadTextAfterHeading
            ? currentLevel
            : currentLevel + 1;
          const indent = "  ".repeat(totalIndentLevel);
          tanaOutput += `${indent}- ${line.trim()}\n`;
        } else {
          const indent = "  ".repeat(currentLevel);
          tanaOutput += `${indent}- ${line.trim()}\n`;
        }
      }
    }
  }
  
  // Process any remaining paragraph
  if (paragraphBuffer.length > 0) {
    const indent = "  ".repeat(currentLevel);
    tanaOutput += `${indent}- ${paragraphBuffer.join(" ")}\n`;
  }
  
  return tanaOutput;
} 