import { showHUD, Clipboard, BrowserExtension } from '@raycast/api'
import { exec } from 'child_process'
import { promisify } from 'util'
import os from 'os'
import TurndownService from 'turndown'
import { convertToTana } from './utils/tana-converter'

const execAsync = promisify(exec)

export default async function Command() {
  try {
    let pageTitle = ''
    let pageHtml = ''
    let url = ''
    const tabs = await BrowserExtension.getTabs()
    const activeTab = tabs?.find((tab) => tab.active)
    if (!activeTab) {
      await showHUD('No active browser tab found.')
      return
    }
    url = activeTab.url || ''
    pageTitle = activeTab.title || 'Untitled Page'
    try {
      pageHtml = await BrowserExtension.getContent({
        cssSelector: 'main',
        format: 'html',
        tabId: activeTab.id,
      })
    } catch {
      try {
        pageHtml = await BrowserExtension.getContent({
          cssSelector: 'article',
          format: 'html',
          tabId: activeTab.id,
        })
      } catch {
        try {
          pageHtml = await BrowserExtension.getContent({
            cssSelector: 'body',
            format: 'html',
            tabId: activeTab.id,
          })
        } catch (error2) {
          console.error('Error getting page HTML:', error2)
          await showHUD('Unable to get page HTML. Please try again.')
          return
        }
      }
    }

    if (!pageHtml) {
      await showHUD('Unable to extract main content.')
      return
    }

    // Use Turndown to convert HTML to Markdown, but ignore images
    const turndownService = new TurndownService()
    turndownService.addRule('no-images', {
      filter: 'img',
      replacement: () => '',
    })
    const markdown = turndownService.turndown(pageHtml)

    // Indent markdown content while preserving structure
    const indentedMarkdown = markdown
      .split('\n\n') // Split by paragraphs instead of lines
      .filter((paragraph) => paragraph.trim() !== '')
      .map((paragraph) => `  - ${paragraph.replace(/\n/g, ' ')}`) // Join lines within paragraphs
      .join('\n')

    // Compose Tana input: root node, URL, then the indented main content
    const tanaInput = `- ${pageTitle} #swipe\n  - URL::${url}\n${indentedMarkdown}`
    const tanaPaste = convertToTana(tanaInput)
    await Clipboard.copy(tanaPaste)
    await showHUD('Copied page content to Tana Paste!')

    // Cross-platform open for tana://
    const opener =
      os.platform() === 'darwin' ? 'open' : os.platform() === 'win32' ? 'start' : 'xdg-open'
    await execAsync(`${opener} tana://`)
  } catch (error) {
    console.error(error)
    await showHUD('Error: ' + (error as Error).message)
  }
}
