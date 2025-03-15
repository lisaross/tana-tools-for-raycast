import { Form, ActionPanel, Action, showHUD, Clipboard } from "@raycast/api";
import { useState } from "react";
import { convertToTana } from "./utils/tana-converter";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

interface FormValues {
  text: string;
}

export default function Command() {
  const [text, setText] = useState<string>("");

  /**
   * Initializes the form with clipboard content
   */
  const loadClipboardContent = async () => {
    try {
      const clipboardText = await Clipboard.readText();
      if (clipboardText) {
        setText(clipboardText);
      }
    } catch (error) {
      console.error("Error reading clipboard:", error);
    }
  };

  /**
   * Handles the form submission
   */
  const handleSubmit = async (values: FormValues) => {
    try {
      if (!values.text.trim()) {
        await showHUD("Please enter some text");
        return;
      }

      // Convert to Tana format
      // Note: values.text contains the raw markdown, not the rendered HTML
      const tanaOutput = convertToTana(values.text);
      
      // Copy to clipboard
      await Clipboard.copy(tanaOutput);
      
      // Open Tana
      try {
        await execAsync('open tana://');
        await showHUD("Tana format copied to clipboard. Opening Tana... ✨");
      } catch (error) {
        console.error("Error opening Tana:", error);
        await showHUD("Tana format copied to clipboard (but couldn't open Tana) ✨");
      }
    } catch (error) {
      console.error("Error converting text:", error);
      await showHUD("Failed to convert text");
    }
  };

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Convert and Open in Tana" onSubmit={handleSubmit} />
          <Action
            title="Load Clipboard Content"
            shortcut={{ modifiers: ["cmd"], key: "l" }}
            onAction={loadClipboardContent}
          />
        </ActionPanel>
      }
    >
      <Form.TextArea
        id="text"
        title="Text to Convert"
        placeholder="Paste or type your text here..."
        value={text}
        onChange={setText}
        // Don't enable markdown preview as we want to preserve the raw markdown
        enableMarkdown={false}
      />
    </Form>
  );
} 