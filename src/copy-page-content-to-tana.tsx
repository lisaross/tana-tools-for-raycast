import { showHUD, Clipboard, BrowserExtension } from '@raycast/api'
import { exec } from 'child_process'
import { promisify } from 'util'
import { load } from 'cheerio'
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

    // Use Cheerio to select the main content
    const $ = load(pageHtml)
    const mainElemHtml = $('main').html() || $('article').html() || $('body').html() || ''
    if (!mainElemHtml) {
      await showHUD('Unable to extract main content.')
      return
    }

    // Use Turndown to convert HTML to Markdown, but ignore images
    const turndownService = new TurndownService()
    turndownService.addRule('no-images', {
      filter: 'img',
      replacement: () => '',
    })
    const markdown = turndownService.turndown(mainElemHtml)

    // Indent all markdown lines as children of the root node
    const indentedMarkdown = markdown
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => `  - ${line}`)
      .join('\n')

    // Compose Tana input: root node, URL, then the indented main content
    const tanaInput = `- ${pageTitle} #swipe\n  - URL::${url}\n${indentedMarkdown}`
    const tanaPaste = convertToTana(tanaInput)
    await Clipboard.copy(tanaPaste)
    await showHUD('Copied page content to Tana Paste!')
    await execAsync('open tana://')
  } catch (error) {
    console.error(error)
    await showHUD('Error: ' + (error as Error).message)
  }
}
