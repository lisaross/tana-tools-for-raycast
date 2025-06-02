import { Clipboard, showHUD, BrowserExtension, Toast, showToast } from '@raycast/api'
import { convertToTana } from './utils/tana-converter'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

/**
 * Copy Page Content to Tana
 *
 * This module extracts the main content from any webpage, converting it
 * to Tana Paste format while preserving links and avoiding navigation elements.
 *
 * Core Features:
 * - Smart main content detection across different site structures
 * - Removal of navigation, footer, and sidebar elements
 * - Link preservation in Tana format
 * - Clean content formatting with proper hierarchy
 * - Robust error handling with graceful degradation
 *
 * Technical Approach:
 * - Browser extension API to find active tab
 * - Multiple content extraction strategies (main, article, content selectors)
 * - HTML parsing and cleaning to remove unwanted elements
 * - Link conversion to Tana format
 * - Works with Chrome, Arc, and Safari browsers
 */

/**
 * Page information extracted from webpage
 */
interface PageInfo {
  title: string
  url: string
  content: string
  author?: string
  publishDate?: string
}

/**
 * Tab information from browser
 */
interface TabInfo {
  url: string
  tabId?: number
  title?: string
}

/**
 * Get the frontmost browser tab using unified approach for all browsers
 * @returns Object containing URL and tab ID, or null if no tab found
 */
async function getFrontmostTab(): Promise<TabInfo | null> {
  // First, get the frontmost application to enforce frontmost browser requirement
  let frontmostApp: string | null = null
  let frontmostUrl: string | null = null

  try {
    // Get the frontmost browser and check if it has a valid URL
    const frontAppResult = await execFileAsync('osascript', [
      '-e',
      'tell application "System Events" to get name of first application process whose frontmost is true',
    ])
    const frontApp = frontAppResult.stdout.trim()
    frontmostApp = frontApp

    // Define supported browsers
    const knownBrowsers = ['Google Chrome', 'Chrome', 'Arc', 'Safari']
    const isSupportedBrowser = knownBrowsers.some((browser) => frontApp.includes(browser))

    // Check if frontmost app is a browser but not supported
    const allBrowsers = [
      'Safari',
      'Firefox',
      'Microsoft Edge',
      'Opera',
      'Brave Browser',
      'Google Chrome',
      'Chrome',
      'Arc',
    ]
    const isBrowser = allBrowsers.some((browser) => frontApp.includes(browser))

    // If frontmost is an unsupported browser, error immediately
    if (isBrowser && !isSupportedBrowser) {
      throw new Error(`UNSUPPORTED_BROWSER:${frontApp}`)
    }

    // If frontmost is a supported browser, try to get the URL
    if (isSupportedBrowser) {
      try {
        // Different browsers use different shortcuts to copy URL
        if (frontApp.includes('Arc')) {
          // Arc supports Cmd+Shift+C to copy URL
          await execFileAsync('osascript', [
            '-e',
            `tell application "System Events" to tell process "${frontApp.replace(/"/g, '\\"')}" to keystroke "c" using {command down, shift down}`,
          ])
        } else if (frontApp.includes('Chrome') || frontApp.includes('Safari')) {
          // Chrome and Safari require Cmd+L to select address bar, then Cmd+C to copy
          await execFileAsync('osascript', [
            '-e',
            `tell application "System Events" to tell process "${frontApp.replace(/"/g, '\\"')}" to keystroke "l" using {command down}`,
          ])
          await new Promise((resolve) => setTimeout(resolve, 100)) // Short delay
          await execFileAsync('osascript', [
            '-e',
            `tell application "System Events" to tell process "${frontApp.replace(/"/g, '\\"')}" to keystroke "c" using {command down}`,
          ])
        }

        await new Promise((resolve) => setTimeout(resolve, 300))

        const urlResult = await execFileAsync('osascript', ['-e', 'get the clipboard as string'])
        const clipboardUrl = urlResult.stdout.trim()

        // Accept any valid HTTP/HTTPS URL
        if (clipboardUrl?.match(/^https?:\/\/.+/)) {
          frontmostUrl = clipboardUrl
        }
      } catch {
        // AppleScript method failed for URL extraction
      }
    }
  } catch (error) {
    // If we can't determine the frontmost app at all, this is a system issue
    if (error instanceof Error && error.message.startsWith('UNSUPPORTED_BROWSER:')) {
      // Re-throw unsupported browser errors
      throw error
    }
  }

  // If we got a URL from the frontmost browser, try to enhance it with tab info
  if (frontmostUrl) {
    try {
      // Try to get tab info from browser extension (if available)
      const tabs = await BrowserExtension.getTabs()
      if (tabs && tabs.length > 0) {
        const matchingTab = tabs.find((tab) => tab.url === frontmostUrl)
        if (matchingTab?.id) {
          return {
            url: matchingTab.url,
            tabId: matchingTab.id,
            title: matchingTab.title,
          }
        }
      }
    } catch {
      // Browser extension not available or failed, that's okay
    }

    // Return the URL from AppleScript even without tab ID
    return {
      url: frontmostUrl,
      tabId: undefined,
      title: undefined,
    }
  }

  // Fallback: Try browser extension if we have a supported frontmost browser
  if (frontmostApp) {
    const knownBrowsers = ['Google Chrome', 'Chrome', 'Arc', 'Safari']
    const isSupportedBrowser = knownBrowsers.some((browser) => frontmostApp.includes(browser))

    if (isSupportedBrowser) {
      try {
        const tabs = await BrowserExtension.getTabs()

        if (!tabs || tabs.length === 0) {
          throw new Error(
            'Could not access browser tabs. Please ensure Raycast has permission to access your browser.',
          )
        }

        const activeTab = tabs.find((tab) => tab.active && tab.url?.match(/^https?:\/\/.+/))

        if (!activeTab) {
          throw new Error('No active web page tab found. Please open a webpage and try again.')
        }

        return {
          url: activeTab.url,
          tabId: activeTab.id,
          title: activeTab.title,
        }
      } catch {
        throw new Error(
          'No active webpage found. Please open a webpage in Chrome, Arc, or Safari and try again.',
        )
      }
    } else {
      throw new Error(`UNSUPPORTED_BROWSER:${frontmostApp}`)
    }
  }

  throw new Error(
    'Could not determine the frontmost application. Please ensure you have Chrome, Arc, or Safari as the frontmost window with a webpage open.',
  )
}

/**
 * Clean and decode HTML entities from extracted text
 */
function decodeHTMLEntities(text: string): string {
  let decoded = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…')

  // Handle numeric entities
  decoded = decoded.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))

  return decoded
}

/**
 * Extract main content from HTML using multiple strategies
 */
function extractMainContent(html: string): string {
  // Remove script and style tags completely
  let cleanHtml = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '')

  // Remove common navigation and footer elements by tag and class/id patterns
  const unwantedSelectors = [
    // Navigation elements
    /<nav\b[^>]*>[\s\S]*?<\/nav>/gi,
    /<header\b[^>]*>[\s\S]*?<\/header>/gi,
    /<footer\b[^>]*>[\s\S]*?<\/footer>/gi,
    /<aside\b[^>]*>[\s\S]*?<\/aside>/gi,

    // Common class/id patterns for unwanted content
    /<div[^>]*(?:class|id)="[^"]*(?:nav|menu|sidebar|footer|header|banner|advertisement|ad|social|share|comment|related)[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
    /<section[^>]*(?:class|id)="[^"]*(?:nav|menu|sidebar|footer|header|banner|advertisement|ad|social|share|comment|related)[^"]*"[^>]*>[\s\S]*?<\/section>/gi,
  ]

  for (const selector of unwantedSelectors) {
    cleanHtml = cleanHtml.replace(selector, '')
  }

  // Try multiple content extraction strategies in order of preference
  const contentStrategies = [
    // Strategy 1: <main> element
    /<main\b[^>]*>([\s\S]*?)<\/main>/i,

    // Strategy 2: <article> element
    /<article\b[^>]*>([\s\S]*?)<\/article>/i,

    // Strategy 3: Common content class/id patterns
    /<div[^>]*(?:class|id)="[^"]*(?:content|main|post|article|entry)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<section[^>]*(?:class|id)="[^"]*(?:content|main|post|article|entry)[^"]*"[^>]*>([\s\S]*?)<\/section>/i,

    // Strategy 4: Look for the largest content block
    /<div[^>]*class="[^"]*post[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class="[^"]*article[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  ]

  let extractedContent = ''

  for (const strategy of contentStrategies) {
    const match = cleanHtml.match(strategy)
    if (match && match[1]) {
      const content = match[1].trim()
      // Prefer longer content (more likely to be the main content)
      if (content.length > extractedContent.length && content.length > 200) {
        extractedContent = content
      }
    }
  }

  // Fallback: If no specific content area found, try to extract from body
  if (!extractedContent || extractedContent.length < 200) {
    const bodyMatch = cleanHtml.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)
    if (bodyMatch && bodyMatch[1]) {
      extractedContent = bodyMatch[1]
    }
  }

  // If still no content, return the whole cleaned HTML
  if (!extractedContent) {
    extractedContent = cleanHtml
  }

  return extractedContent
}

/**
 * Convert HTML to clean text while preserving links in Tana format
 */
function convertHtmlToTanaText(html: string): string {
  let text = html

  // Convert links to Tana format [text](url) while preserving the link text
  text = text.replace(/<a\s+[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (match, url, linkText) => {
    const cleanUrl = decodeHTMLEntities(url.trim())
    const cleanLinkText = convertHtmlToTanaText(linkText).trim() // Recursively process link text

    if (cleanLinkText && cleanUrl) {
      return `[${cleanLinkText}](${cleanUrl})`
    } else if (cleanUrl) {
      return cleanUrl
    }
    return cleanLinkText || match
  })

  // Convert common HTML elements to text equivalents
  // Headers
  text = text.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h[1-6]>/gi, (match, level, content) => {
    const cleanContent = convertHtmlToTanaText(content).trim()
    const hashes = '#'.repeat(parseInt(level))
    return `\n\n${hashes} ${cleanContent}\n\n`
  })

  // Paragraphs
  text = text.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (match, content) => {
    const cleanContent = convertHtmlToTanaText(content).trim()
    return cleanContent ? `\n\n${cleanContent}\n\n` : ''
  })

  // Lists
  text = text.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (match, content) => {
    return `\n${content}\n`
  })

  text = text.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (match, content) => {
    return `\n${content}\n`
  })

  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (match, content) => {
    const cleanContent = convertHtmlToTanaText(content).trim()
    return cleanContent ? `\n- ${cleanContent}` : ''
  })

  // Blockquotes
  text = text.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (match, content) => {
    const cleanContent = convertHtmlToTanaText(content).trim()
    return cleanContent ? `\n> ${cleanContent}\n` : ''
  })

  // Line breaks
  text = text.replace(/<br\s*\/?>/gi, '\n')

  // Strong/bold
  text = text.replace(/<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, '**$1**')

  // Emphasis/italic
  text = text.replace(/<(?:em|i)[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, '*$1*')

  // Code
  text = text.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '')

  // Decode HTML entities
  text = decodeHTMLEntities(text)

  // Clean up whitespace
  text = text
    .replace(/\n\s*\n\s*\n/g, '\n\n') // Multiple newlines to double newlines
    .replace(/[ \t]+/g, ' ') // Multiple spaces to single space
    .replace(/^\s+|\s+$/g, '') // Trim start and end

  return text
}

/**
 * Extract page information including title and metadata
 */
function extractPageMetadata(html: string): {
  title: string
  author?: string
  publishDate?: string
} {
  // Extract title
  let title = 'Webpage Content'

  const titlePatterns = [
    /<title[^>]*>([\s\S]*?)<\/title>/i,
    /<meta\s+property="og:title"\s+content="([^"]*)"[^>]*>/i,
    /<meta\s+name="title"\s+content="([^"]*)"[^>]*>/i,
    /<h1[^>]*>([\s\S]*?)<\/h1>/i,
  ]

  for (const pattern of titlePatterns) {
    const match = html.match(pattern)
    if (match && match[1]) {
      const extractedTitle = decodeHTMLEntities(match[1].trim())
      if (extractedTitle && extractedTitle.length > 0 && extractedTitle.length < 200) {
        title = extractedTitle
        break
      }
    }
  }

  // Extract author
  let author: string | undefined
  const authorPatterns = [
    /<meta\s+name="author"\s+content="([^"]*)"[^>]*>/i,
    /<meta\s+property="article:author"\s+content="([^"]*)"[^>]*>/i,
    /<span[^>]*(?:class|id)="[^"]*author[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
  ]

  for (const pattern of authorPatterns) {
    const match = html.match(pattern)
    if (match && match[1]) {
      const extractedAuthor = decodeHTMLEntities(match[1].trim())
      if (extractedAuthor && extractedAuthor.length > 0 && extractedAuthor.length < 100) {
        author = extractedAuthor
        break
      }
    }
  }

  // Extract publish date
  let publishDate: string | undefined
  const datePatterns = [
    /<meta\s+property="article:published_time"\s+content="([^"]*)"[^>]*>/i,
    /<meta\s+name="publish_date"\s+content="([^"]*)"[^>]*>/i,
    /<time[^>]*datetime="([^"]*)"[^>]*>/i,
  ]

  for (const pattern of datePatterns) {
    const match = html.match(pattern)
    if (match && match[1]) {
      const extractedDate = match[1].trim()
      if (extractedDate) {
        publishDate = extractedDate
        break
      }
    }
  }

  return { title, author, publishDate }
}

/**
 * Fetch and extract main content from a webpage
 */
async function extractPageContent(url: string): Promise<PageInfo> {
  try {
    const userAgent =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

    const htmlResult = await execFileAsync(
      'curl',
      [
        '-s', // Silent mode
        '-L', // Follow redirects
        '-H',
        `User-Agent: ${userAgent}`,
        '--max-time',
        '30', // 30 second timeout
        url,
      ],
      {
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
        timeout: 30000, // 30 second timeout
      },
    )

    const html = htmlResult.stdout

    if (!html || html.length < 100) {
      throw new Error('unable to extract main content')
    }

    // Extract metadata
    const { title, author, publishDate } = extractPageMetadata(html)

    // Extract and convert main content
    const rawContent = extractMainContent(html)
    const cleanContent = convertHtmlToTanaText(rawContent)

    if (!cleanContent || cleanContent.trim().length < 50) {
      throw new Error('unable to extract main content')
    }

    return {
      title,
      url,
      content: cleanContent.trim(),
      author,
      publishDate,
    }
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('unable to extract main content')
  }
}

/**
 * Format page content for Tana
 */
function formatPageForTana(pageInfo: PageInfo): string {
  let tanaContent = `# ${pageInfo.title}\n\n`

  // Add metadata fields
  tanaContent += `URL::${pageInfo.url}\n`

  if (pageInfo.author) {
    tanaContent += `Author::${pageInfo.author}\n`
  }

  if (pageInfo.publishDate) {
    tanaContent += `Published::${pageInfo.publishDate}\n`
  }

  // Add the main content
  tanaContent += `\n${pageInfo.content}`

  return tanaContent
}

/**
 * Show user-friendly error messages
 */
async function showUserFriendlyError(error: unknown): Promise<void> {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'

  if (errorMessage.startsWith('UNSUPPORTED_BROWSER:')) {
    const browserName = errorMessage.replace('UNSUPPORTED_BROWSER:', '')
    await showToast({
      style: Toast.Style.Failure,
      title: '🌐 Unsupported Browser',
      message: `${browserName} is not supported. Please use Chrome, Arc, or Safari instead.`,
    })
  } else if (errorMessage.includes('Could not access browser tabs')) {
    await showToast({
      style: Toast.Style.Failure,
      title: '🔗 Browser Access Issue',
      message:
        'Could not access browser tabs. Please ensure Raycast has permission to access your browser.',
    })
  } else if (
    errorMessage.includes('No active web page tab found') ||
    errorMessage.includes('No active webpage found')
  ) {
    await showToast({
      style: Toast.Style.Failure,
      title: '📄 No Webpage Found',
      message: "Open a webpage in Chrome, Arc, or Safari and make sure it's the active tab",
    })
  } else if (errorMessage.includes('unable to extract main content')) {
    await showToast({
      style: Toast.Style.Failure,
      title: '📄 Content Extraction Failed',
      message:
        'Unable to extract main content from this page. The page may have unusual structure or be protected.',
    })
  } else if (errorMessage.includes('frontmost browser window')) {
    await showToast({
      style: Toast.Style.Failure,
      title: '🖥️ Supported Browser Not Active',
      message: 'Make sure Chrome, Arc, or Safari is the frontmost window with a webpage open',
    })
  } else {
    await showToast({
      style: Toast.Style.Failure,
      title: '❌ Something Went Wrong',
      message: errorMessage.length > 100 ? errorMessage.substring(0, 100) + '...' : errorMessage,
    })
  }
}

// Main command entry point
export default async function Command() {
  try {
    await showToast({
      style: Toast.Style.Animated,
      title: 'Extracting Page Content',
    })

    // Get the active tab
    const activeTab = await getFrontmostTab()

    if (!activeTab) {
      throw new Error(
        'No active webpage found. Please ensure you have a webpage open in Chrome, Arc, or Safari.',
      )
    }

    // Extract page content
    const pageInfo = await extractPageContent(activeTab.url)

    // Format for Tana and copy to clipboard
    const tanaMarkdown = formatPageForTana(pageInfo)
    const tanaFormat = convertToTana(tanaMarkdown)
    await Clipboard.copy(tanaFormat)

    // Open Tana automatically
    try {
      await execFileAsync('open', ['tana://'])
      await showHUD('Page content copied to clipboard in Tana format. Opening Tana... ✨')
    } catch (error) {
      console.error('Error opening Tana:', error)
      await showHUD('Page content copied to clipboard in Tana format ✨')
    }
  } catch (error) {
    await showUserFriendlyError(error)
  }
}
