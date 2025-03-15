import React, { useState } from "react";
import { ActionPanel, Action, Form, showToast, Toast, getPreferenceValues } from "@raycast/api";

interface Preferences {
  defaultIndentation: string;
}

export default function Command() {
  const preferences = getPreferenceValues<Preferences>();
  const [markdown, setMarkdown] = useState("");
  const [converted, setConverted] = useState("");

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

  const handleSubmit = (values: { markdown: string }) => {
    const convertedText = convertMarkdownToTana(values.markdown);
    setConverted(convertedText);
  };

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(converted);
    await showToast({
      style: Toast.Style.Success,
      title: "Copied to clipboard",
    });
  };

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm onSubmit={handleSubmit} />
          <Action title="Copy to Clipboard" onAction={copyToClipboard} />
        </ActionPanel>
      }
    >
      <Form.TextArea
        id="markdown"
        title="Markdown"
        placeholder="Paste your Markdown here..."
        value={markdown}
        onChange={setMarkdown}
      />
      {converted && (
        <Form.TextArea
          id="converted"
          title="Converted Tana Format"
          value={converted}
          onChange={setConverted}
        />
      )}
    </Form>
  );
} 