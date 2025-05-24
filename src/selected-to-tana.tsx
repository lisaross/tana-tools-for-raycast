import { showHUD, getSelectedText, Clipboard, BrowserExtension } from '@raycast/api'
import { convertToTana } from './utils/tana-converter'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export default async function Command() {
  try {
    // Get selected text
    let selectedText: string | undefined

    try {
      selectedText = await getSelectedText()
    } catch (error) {
      console.error('Error getting selected text:', error)
      await showHUD('Unable to get selected text. Please ensure text is selected and try again.')
      return
    }

    if (!selectedText) {
      await showHUD('No text is currently selected. Please select some text and try again.')
      return
    }

    // Try to get the active browser tab URL
    let urlField = ''
    let pageTitle = ''
    try {
      const tabs = await BrowserExtension.getTabs()
      const activeTab = tabs?.find((tab) => tab.active && tab.url?.startsWith('http'))
      if (activeTab && activeTab.url) {
        urlField = `\nURL::${activeTab.url}`
        // Try to get the page title
        try {
          pageTitle = await BrowserExtension.getContent({
            cssSelector: 'title',
            format: 'text',
            tabId: activeTab.id,
          })
        } catch { /* ignore error */ }
      }
    } catch { /* ignore error */ }

    // Format output: if pageTitle, use as parent node
    let textWithUrl = selectedText + urlField
    if (pageTitle) {
      // Split selectedText into lines and indent each
      const selectedLines = selectedText.split('\n').map((line) => '  ' + line)
      // Place URL as the first child if present
      const urlLine = urlField ? '  ' + urlField.trim() : ''
      // Combine URL and selected text lines
      const indented = [urlLine, ...selectedLines].filter(Boolean).join('\n')
      textWithUrl = `# ${pageTitle} #swipe\n${indented}`
    }

    // Convert to Tana format
    const tanaOutput = convertToTana(textWithUrl)

    // Copy to clipboard
    await Clipboard.copy(tanaOutput)

    // Open Tana
    try {
      await execAsync('open tana://')
      await showHUD('Selected text converted and copied. Opening Tana... ✨')
    } catch (error) {
      console.error('Error opening Tana:', error)
      await showHUD("Selected text converted and copied (but couldn't open Tana) ✨")
    }
  } catch (error) {
    console.error('Error processing text:', error)
    await showHUD('Failed to process selected text. Please try selecting the text again.')
  }
}
