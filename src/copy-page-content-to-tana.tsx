import { Clipboard, showHUD, BrowserExtension, Toast, showToast, environment, LaunchType } from '@raycast/api'
import { convertToTana } from './utils/tana-converter'
import { exec, execFile } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)
const execFileAsync = promisify(execFile)

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
 * Tab information from browser or AppleScript
 */
interface TabInfo {
  url: string
  tabId?: number
  title?: string
}

/**
 * Decode HTML entities to their text equivalents
 * @param text Text containing HTML entities
 * @returns Decoded text
 */
function decodeHTMLEntities(text: string): string {
  // Replace all encoded entities using static patterns to prevent ReDoS
  let decoded = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')

  // Additionally handle numeric entities like &#39;
  decoded = decoded.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))

  return decoded
}

/**
 * Get previously frontmost application before Raycast
 * This is crucial for commands launched via Raycast search interface
 * @returns Object containing URL and tab ID, or null if no tab found
 */
async function getPreviouslyActiveBrowserTab(): Promise<TabInfo | null> {
  try {
    // Get list of all application processes, excluding Raycast
    const processListResult = await execAsync(`
      osascript -e '
      tell application "System Events"
        set allProcesses to every application process
        set appList to {}
        repeat with proc in allProcesses
          if name of proc is not "Raycast" and name of proc is not "System Events" then
            set end of appList to name of proc
          end if
        end repeat
        return appList
      end tell'
    `)
    
    const allApps = processListResult.stdout.trim().split(', ')
    
    // Define supported browsers in order of preference
    const supportedBrowsers = ['Google Chrome', 'Chrome', 'Arc', 'Safari']
    
    // Find the first supported browser in the list (most recently active non-Raycast app)
    for (const app of allApps) {
      if (supportedBrowsers.some(browser => app.includes(browser))) {
        // Found a supported browser - try to get URL from it
        try {
          let browserUrl: string | null = null
          
          if (app.includes('Arc')) {
            // Arc supports Cmd+Shift+C to copy URL
            await execAsync(
              `osascript -e 'tell application "System Events" to tell process "${app.replace(/"/g, '\\"')}" to keystroke "c" using {command down, shift down}'`,
            )
          } else if (app.includes('Chrome') || app.includes('Safari')) {
            // Chrome and Safari require Cmd+L to select address bar, then Cmd+C to copy
            await execAsync(
              `osascript -e 'tell application "System Events" to tell process "${app.replace(/"/g, '\\"')}" to keystroke "l" using {command down}'`,
            )
            await new Promise((resolve) => setTimeout(resolve, 100))
            await execAsync(
              `osascript -e 'tell application "System Events" to tell process "${app.replace(/"/g, '\\"')}" to keystroke "c" using {command down}'`,
            )
          }

          await new Promise((resolve) => setTimeout(resolve, 300))

          const urlResult = await execAsync(`osascript -e 'get the clipboard as string'`)
          browserUrl = urlResult.stdout.trim()

          if (browserUrl?.startsWith('http://') || browserUrl?.startsWith('https://')) {
            // Try to enhance with browser extension info
            try {
              const tabs = await BrowserExtension.getTabs()
              if (tabs && tabs.length > 0) {
                const matchingTab = tabs.find((tab) => tab.url === browserUrl)
                if (matchingTab?.id) {
                  return {
                    url: matchingTab.url,
                    tabId: matchingTab.id,
                    title: matchingTab.title,
                  }
                }
              }
            } catch {
              // Browser extension not available, that's okay
            }

            return {
              url: browserUrl,
              tabId: undefined,
              title: undefined,
            }
          }
        } catch {
          // Failed to get URL from this browser, continue to next
          continue
        }
      }
    }
    
    return null
  } catch (error) {
    console.error('Error getting previously active browser:', error)
    return null
  }
}

/**
 * Get frontmost tab using unified approach for all browsers
 * @returns Object containing URL and tab ID, or null if no tab found
 */
async function getFrontmostTab(): Promise<TabInfo | null> {
  // Check launch type to determine strategy
  const isKeyboardLaunch = environment.launchType === LaunchType.UserInitiated
  
  // For keyboard shortcuts, use the direct frontmost approach
  if (isKeyboardLaunch) {
    return await getDirectFrontmostTab()
  } else {
    // For Raycast search launches, find previously active browser
    const previousTab = await getPreviouslyActiveBrowserTab()
    if (previousTab) {
      return previousTab
    }
    // Fallback to browser extension if previous approach fails
    return await getBrowserExtensionTab()
  }
}

/**
 * Get frontmost tab using direct frontmost application detection
 * This works well for keyboard shortcuts
 */
async function getDirectFrontmostTab(): Promise<TabInfo | null> {
  // First, get the frontmost application to enforce frontmost browser requirement
  let frontmostApp: string | null = null
  let frontmostUrl: string | null = null

  try {
    // Get the frontmost browser and check if it has a webpage
    const frontAppResult = await execAsync(
      `osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`,
    )
    const frontApp = frontAppResult.stdout.trim()
    frontmostApp = frontApp

    // Define supported and all browsers
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

    // If frontmost is an unsupported browser, error immediately - don't fall back
    if (isBrowser && !isSupportedBrowser) {
      throw new Error(`UNSUPPORTED_BROWSER:${frontApp}`)
    }

    // If frontmost is a supported browser, try to get the URL
    if (isSupportedBrowser) {
      try {
        // Different browsers use different shortcuts to copy URL
        if (frontApp.includes('Arc')) {
          // Arc supports Cmd+Shift+C to copy URL
          await execAsync(
            `osascript -e 'tell application "System Events" to tell process "${frontApp.replace(/"/g, '\\"')}" to keystroke "c" using {command down, shift down}'`,
          )
        } else if (frontApp.includes('Chrome') || frontApp.includes('Safari')) {
          // Chrome and Safari require Cmd+L to select address bar, then Cmd+C to copy
          await execAsync(
            `osascript -e 'tell application "System Events" to tell process "${frontApp.replace(/"/g, '\\"')}" to keystroke "l" using {command down}'`,
          )
          await new Promise((resolve) => setTimeout(resolve, 100)) // Short delay
          await execAsync(
            `osascript -e 'tell application "System Events" to tell process "${frontApp.replace(/"/g, '\\"')}" to keystroke "c" using {command down}'`,
          )
        }

        await new Promise((resolve) => setTimeout(resolve, 300))

        const urlResult = await execAsync(`osascript -e 'get the clipboard as string'`)
        const clipboardUrl = urlResult.stdout.trim()

        if (clipboardUrl?.startsWith('http://') || clipboardUrl?.startsWith('https://')) {
          frontmostUrl = clipboardUrl
        }
      } catch {
        // AppleScript method failed for URL extraction, but we know it's a supported browser
        // Fall back to browser extension API only for this supported browser
      }
    }
  } catch (error) {
    // If we can't determine the frontmost app at all, this is a system issue
    // Only in this case do we fall back to browser extension
    if (error instanceof Error && error.message.startsWith('UNSUPPORTED_BROWSER:')) {
      // Re-throw unsupported browser errors - don't fall back
      throw error
    }
    // For other errors (like can't run AppleScript), continue to fallback
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

    // Return the URL from AppleScript even without tab ID (web scraping will still work)
    return {
      url: frontmostUrl,
      tabId: undefined, // No tab ID available, but web scraping doesn't need it
      title: undefined,
    }
  }

  // Fallback: Only use browser extension if we have a supported frontmost browser but couldn't get URL
  // If frontmostApp is set and is a supported browser, try browser extension as last resort
  if (frontmostApp) {
    const knownBrowsers = ['Google Chrome', 'Chrome', 'Arc', 'Safari']
    const isSupportedBrowser = knownBrowsers.some((browser) => frontmostApp.includes(browser))

    if (isSupportedBrowser) {
      return await getBrowserExtensionTab()
    } else {
      // We know frontmost app but it's not supported - this should have been caught earlier
      throw new Error(`UNSUPPORTED_BROWSER:${frontmostApp}`)
    }
  }

  // If we get here, we couldn't determine the frontmost app at all
  throw new Error(
    'Could not determine the frontmost application. Please ensure you have Chrome, Arc, or Safari as the frontmost window with a webpage open.',
  )
}

/**
 * Get browser tab using browser extension API only
 */
async function getBrowserExtensionTab(): Promise<TabInfo | null> {
  try {
    const tabs = await BrowserExtension.getTabs()

    if (!tabs || tabs.length === 0) {
      throw new Error(
        'Could not access browser tabs. Please ensure Raycast has permission to access your browser.',
      )
    }

    const activeTab = tabs.find((tab) => tab.active && tab.url)

    if (!activeTab) {
      throw new Error('No active tab found. Please open a webpage and try again.')
    }

    return {
      url: activeTab.url,
      tabId: activeTab.id,
      title: activeTab.title,
    }
  } catch {
    // Browser extension also failed
    throw new Error(
      'No active webpage found. Please open a webpage in Chrome, Arc, or Safari and try again.',
    )
  }
}

/**
 * Extracts page information from the active tab
 */
async function extractPageInfo(): Promise<PageInfo> {
  try {
    // Get the frontmost tab with better selection logic
    const activeTab = await getFrontmostTab()

    if (!activeTab) {
      throw new Error(
        'No tab found. Please ensure you have a webpage open in Chrome, Arc, or Safari as the frontmost window.',
      )
    }

    // Use web scraping for all metadata
    try {
      const webScrapingResult = await extractPageViaWebScraping(activeTab.url)
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

    // Show a persistent error toast with more details
    await showToast({
      style: Toast.Style.Failure,
      title: 'Failed to extract page information',
      message: errorMessage,
    })
    throw error
  }
}

/**
 * Safely format content for Tana field to prevent it from being split into separate nodes
 */
function formatContentForTanaField(content: string): string {
  return (
    content
      // Remove hashtags to prevent them from becoming Tana supertags
      .replace(/#\w+\b/g, '')
      // Replace all types of line breaks with spaces
      .replace(/\r\n/g, ' ') // Windows line endings
      .replace(/\r/g, ' ') // Mac line endings
      .replace(/\n/g, ' ') // Unix line endings
      // Replace multiple spaces with single space
      .replace(/\s+/g, ' ')
      // Remove any characters that might interfere with Tana parsing
      .replace(/::+/g, ':') // Multiple colons could interfere with field syntax
      .replace(/^\s+|\s+$/g, '') // Trim leading/trailing whitespace
      // Escape any remaining special characters that might cause issues
      .replace(/\t/g, ' ') // Replace tabs with spaces
      .trim()
  )
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
    await showToast({
      style: Toast.Style.Animated,
      title: 'Processing Webpage...',
      message: 'Extracting content → Converting to Tana → Opening Tana',
    })

    // Extract page information from the active tab
    const pageInfo = await extractPageInfo()

    // Format and copy to clipboard
    const markdownFormat = formatForTanaMarkdown(pageInfo)
    const tanaFormat = convertToTana(markdownFormat)
    await Clipboard.copy(tanaFormat)

    // Create success message
    const message = 'Webpage information copied to clipboard in Tana format'

    // Open Tana automatically like other commands
    try {
      await execAsync('open tana://')
      await showHUD(`${message}. Opening Tana... ✨`)
    } catch (error) {
      console.error('Error opening Tana:', error)
      await showHUD(`${message} (but couldn't open Tana) ✨`)
    }
  } catch (error) {
    await showUserFriendlyError(error)
  }
}

/**
 * Clean and decode HTML entities from extracted text
 * @param text Raw extracted text
 * @param options Cleaning options
 * @returns Cleaned text
 */
function cleanExtractedText(
  text: string,
  options: {
    removeHashtags?: boolean
    preserveNewlines?: boolean
    maxLength?: number
  } = {},
): string {
  let cleaned = text
    .replace(/\\u0026/g, '&')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')

  if (options.preserveNewlines) {
    cleaned = cleaned.replace(/\\n/g, '\n')
  } else {
    cleaned = cleaned.replace(/\\n/g, ' ')
  }

  cleaned = cleaned.replace(/\\t/g, ' ')

  if (options.removeHashtags) {
    // Remove hashtags to prevent them from becoming Tana supertags
    cleaned = cleaned.replace(/#\w+\b/g, '')
  }

  // Clean up any double spaces
  cleaned = cleaned.replace(/\s+/g, ' ').trim()

  return cleaned
}

/**
 * Extract page title from HTML content
 * @param html HTML content from webpage
 * @returns Extracted and cleaned title
 */
function extractTitleFromHtml(html: string): string {
  const titlePatterns = [
    /<title>([^<]+)<\/title>/i,
    /<meta property="og:title" content="([^"]+)"/i,
    /<meta name="twitter:title" content="([^"]+)"/i,
    /<h1[^>]*>([^<]+)<\/h1>/i,
    /<meta property="title" content="([^"]+)"/i,
  ]

  for (const pattern of titlePatterns) {
    const match = html.match(pattern)
    if (match) {
      const [, extractedTitle] = match
      if (extractedTitle) {
        const cleanedTitle = cleanExtractedText(extractedTitle).replace(/^\(\d+\)\s*/, '') // Remove notification count

        if (cleanedTitle && cleanedTitle.length > 0 && cleanedTitle.length < 300) {
          return cleanedTitle
        }
      }
    }
  }

  return 'Webpage'
}

/**
 * Extract page description from HTML content
 * @param html HTML content from webpage
 * @returns Extracted and cleaned description
 */
function extractDescriptionFromHtml(html: string): string {
  const descriptionPatterns = [
    /<meta name="description" content="([^"]+)"/i,
    /<meta property="og:description" content="([^"]+)"/i,
    /<meta name="twitter:description" content="([^"]+)"/i,
    /<meta property="description" content="([^"]+)"/i,
    /<meta name="summary" content="([^"]+)"/i,
  ]

  for (const pattern of descriptionPatterns) {
    const match = html.match(pattern)
    if (match) {
      const [, extractedDescription] = match
      if (extractedDescription) {
        const cleanedDescription = cleanExtractedText(extractedDescription, {
          removeHashtags: true,
          preserveNewlines: true,
        })

        if (
          cleanedDescription &&
          cleanedDescription.length > 10 &&
          cleanedDescription.length < 5000
        ) {
          return cleanedDescription
        }
      }
    }
  }

  return 'Description not available'
}

/**
 * Extract author information from HTML content
 * @param html HTML content from webpage
 * @returns Author name or undefined if not found
 */
function extractAuthorFromHtml(html: string): string | undefined {
  const authorPatterns = [
    /<meta name="author" content="([^"]+)"/i,
    /<meta property="article:author" content="([^"]+)"/i,
    /<meta name="twitter:creator" content="([^"]+)"/i,
    /<meta property="og:author" content="([^"]+)"/i,
    /<meta name="creator" content="([^"]+)"/i,
  ]

  for (const pattern of authorPatterns) {
    const match = html.match(pattern)
    if (match) {
      const [, extractedAuthor] = match
      if (extractedAuthor) {
        const cleanedAuthor = cleanExtractedText(extractedAuthor)

        if (cleanedAuthor && cleanedAuthor.length > 0 && cleanedAuthor.length < 100) {
          return cleanedAuthor
        }
      }
    }
  }

  return undefined
}

async function extractPageViaWebScraping(pageUrl: string): Promise<{
  title: string
  description: string
  author?: string
} | null> {
  try {
    // Use execFile instead of shell execution to prevent command injection
    // Pass arguments separately instead of interpolating into command string
    const userAgent =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

    const htmlResult = await execFileAsync(
      'curl',
      [
        '-s', // Silent mode
        '-L', // Follow redirects
        '-H',
        `User-Agent: ${userAgent}`, // Set user agent header
        pageUrl, // URL as argument (not interpolated into shell command)
      ],
      {
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer to handle large pages
        timeout: 30000, // 30 second timeout
      },
    )
    const html = htmlResult.stdout

    if (!html || html.length < 100) {
      throw new Error('Failed to fetch page HTML or content too short')
    }

    // Extract page information using helper functions
    const title = extractTitleFromHtml(html)
    const description = extractDescriptionFromHtml(html)
    const author = extractAuthorFromHtml(html)

    // Return all extracted data
    return {
      title,
      description,
      author,
    }
  } catch {
    return null
  }
}

/**
 * Show user-friendly error messages with specific solutions
 */
async function showUserFriendlyError(error: unknown): Promise<void> {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'

  // Check for specific error patterns and show helpful messages
  // Check for browser support issues first (more specific than generic page errors)
  if (errorMessage.startsWith('UNSUPPORTED_BROWSER:')) {
    const browserName = errorMessage.replace('UNSUPPORTED_BROWSER:', '')
    await showToast({
      style: Toast.Style.Failure,
      title: '🌐 Unsupported Browser',
      message: `${browserName} is not supported. Please use Chrome, Arc, or Safari instead.`,
    })
  } else if (
    errorMessage.includes('Chrome only') ||
    errorMessage.includes('Chrome and Arc only') ||
    errorMessage.includes('Chrome, Arc, and Safari')
  ) {
    await showToast({
      style: Toast.Style.Failure,
      title: '🌐 Supported Browser Required',
      message:
        'This feature only works with Chrome, Arc, or Safari. Please switch to a supported browser.',
    })
  } else if (errorMessage.includes('Could not access browser tabs')) {
    await showToast({
      style: Toast.Style.Failure,
      title: '🔗 Browser Access Issue',
      message:
        'Could not access browser tabs. Please ensure Raycast has permission to access your browser.',
    })
  } else if (
    errorMessage.includes('No tab found') ||
    errorMessage.includes('No active webpage found')
  ) {
    await showToast({
      style: Toast.Style.Failure,
      title: '📄 No Webpage Found',
      message: "Open a webpage in Chrome, Arc, or Safari and make sure it's the active tab",
    })
  } else if (errorMessage.includes('frontmost browser window')) {
    await showToast({
      style: Toast.Style.Failure,
      title: '🖥️ Supported Browser Not Active',
      message: 'Make sure Chrome, Arc, or Safari is the frontmost window with a webpage open',
    })
  } else {
    // Generic error fallback
    await showToast({
      style: Toast.Style.Failure,
      title: '❌ Something Went Wrong',
      message: errorMessage.length > 100 ? errorMessage.substring(0, 100) + '...' : errorMessage,
    })
  }
}
