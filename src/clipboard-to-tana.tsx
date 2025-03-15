import { Clipboard, showHUD } from "@raycast/api";

export default async function Command() {
  try {
    // Get clipboard content
    const clipboardText = await Clipboard.readText();
    
    if (!clipboardText) {
      await showHUD("No text in clipboard");
      return;
    }

    // Convert to Tana format
    const tanaOutput = convertMarkdownToTana(clipboardText);
    
    // Copy back to clipboard
    await Clipboard.copy(tanaOutput);
    
    // Show success message
    await showHUD("Converted to Tana format");
  } catch (error) {
    await showHUD("Failed to convert text");
  }
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