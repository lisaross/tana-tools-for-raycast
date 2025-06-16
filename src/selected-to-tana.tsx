import { showHUD, getSelectedText, Clipboard, BrowserExtension } from '@raycast/api'
import { formatForTana, withTimeout } from './utils/page-content-extractor'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)


/**
 * Raycast command that converts currently selected text to Tana format
 * Gets the selected text from the system, optionally includes browser context (URL and page title),
 * converts it to Tana format, copies to clipboard, and opens the Tana application
 */
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

    // Check if we can get browser context from the focused window's active tab
    let pageTitle = ''
    let pageUrl = ''
    let isInBrowser = false
    
    try {
      // Step 1: Get title from focused tab to identify it
      const focusedTabTitle = await withTimeout(
        BrowserExtension.getContent({
          format: 'text',
          cssSelector: 'title',
        }),
        3000,
        'Getting focused tab title',
      )

      if (focusedTabTitle) {
        // Step 2: Get all tabs and find the one that matches our focused tab
        const tabs = await withTimeout(BrowserExtension.getTabs(), 3000, 'Getting tabs for metadata')
        
        if (tabs) {
          // Find the tab that matches our focused tab title
          let targetTab = tabs.find(tab => tab.title === focusedTabTitle)
          
          if (!targetTab) {
            // Fallback: try partial match
            targetTab = tabs.find(tab => 
              tab.title && focusedTabTitle && 
              (tab.title.includes(focusedTabTitle.substring(0, 10)) || 
               focusedTabTitle.includes(tab.title.substring(0, 10)))
            )
          }
          
          if (targetTab && targetTab.url?.startsWith('http')) {
            isInBrowser = true
            pageTitle = focusedTabTitle
            pageUrl = targetTab.url
          }
        }
      }
    } catch {
      /* ignore error - not in browser or no access */
    }

    // Format for Tana based on context
    const tanaOutput = isInBrowser && pageTitle 
      ? formatForTana({
          title: pageTitle,
          url: pageUrl,
          content: selectedText,
          useSwipeTag: true,
        })
      : formatForTana({
          lines: selectedText.split('\n'),
        })

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
