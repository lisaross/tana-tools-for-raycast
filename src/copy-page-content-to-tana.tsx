import { getFrontmostTab } from './utils/browser-detection'
import {
  extractPageMetadata,
  decodeHTMLEntities,
  formatContentForTanaField,
} from './utils/web-scraping'
import {
  showProcessingToast,
  copyToTanaAndOpen,
  showContextualError,
  ERROR_CONTEXTS,
} from './utils/raycast-integration'

/**
 * Page Content to Tana Converter
 *
 * This module extracts webpage metadata and content, converting them
 * to Tana Paste format. It uses the browser extension API to get the active
 * tab and web scraping for reliable metadata extraction.
 *
 * Core Features:
 * - Direct browser tab detection via Raycast browser extension API
 * - Web scraping for page metadata (title, description, URL)
 * - Robust error handling with graceful degradation
 * - Clean conversion to Tana Paste format
 *
 * Technical Approach:
 * - Primary: Browser extension API to find active tab
 * - Metadata: curl + regex parsing of page's HTML content
 * - Works with Chrome, Arc, and Safari browsers (Arc: Cmd+Shift+C, Chrome/Safari: Cmd+L+Cmd+C for URL copying)
 */

/**
 * Page information extracted from webpage
 */
interface PageInfo {
  title: string
  url: string
  description: string
  author?: string
}

/**
 * Extracts page information from the active tab
 */
async function extractPageInfo(): Promise<PageInfo> {
  try {
    // Get the frontmost tab with automatic launch type detection
    const activeTab = await getFrontmostTab({ requireValidUrl: true })

    if (!activeTab) {
      throw new Error(
        'No tab found. Please ensure you have a webpage open in Chrome, Arc, or Safari as the frontmost window.',
      )
    }

    // Use web scraping for all metadata
    try {
      const webScrapingResult = await extractPageMetadata(activeTab.url)
      if (webScrapingResult) {
        // Use all data from web scraping for consistency and reliability
        const result = {
          title: decodeHTMLEntities(webScrapingResult.title.trim()),
          url: activeTab.url,
          description: webScrapingResult.description,
          author: webScrapingResult.author,
        }

        return result
      }
    } catch {
      // Web scraping failed, continue to fallback
    }

    // Final fallback result (only reached if web scraping failed)
    const fallbackTitle = activeTab.title || 'Webpage'
    const result = {
      title: decodeHTMLEntities(fallbackTitle.trim()),
      url: activeTab.url,
      description: 'Description not available',
      author: undefined,
    }

    // Return complete PageInfo
    return result
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    console.error('❌ Page info extraction failed:', errorMessage)
    throw error
  }
}

/**
 * Formats page information for Tana in Markdown format
 * that can be processed by our existing Tana converter
 */
function formatForTanaMarkdown(pageInfo: PageInfo): string {
  // Create a Markdown representation that our tana-converter can process
  let markdown = `# ${pageInfo.title} #webpage\n`
  markdown += `URL::${pageInfo.url}\n`

  // Add author if available
  if (pageInfo.author) {
    markdown += `Author::${pageInfo.author}\n`
  }

  // Keep the entire description in the Description field (don't split into separate nodes)
  const safeDescription = formatContentForTanaField(pageInfo.description)
  markdown += `Description::${safeDescription}\n`

  return markdown
}

// Main command entry point
export default async function Command() {
  try {
    // Show improved HUD to indicate processing has started
    await showProcessingToast('Processing Webpage...', [
      'Extracting content',
      'Converting to Tana',
      'Opening Tana',
    ])

    // Extract page information from the active tab
    const pageInfo = await extractPageInfo()

    // Format and copy to clipboard, then open Tana
    const markdownFormat = formatForTanaMarkdown(pageInfo)
    const message = 'Webpage information copied to clipboard in Tana format'
    await copyToTanaAndOpen(markdownFormat, message)
  } catch (error) {
    await showContextualError(error, ERROR_CONTEXTS.WEBPAGE)
  }
}
