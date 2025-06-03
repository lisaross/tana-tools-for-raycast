import { BrowserExtension, environment, LaunchType } from '@raycast/api'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

/**
 * Tab information from browser or AppleScript
 */
export interface TabInfo {
  url: string
  tabId?: number
  title?: string
}

/**
 * Options for URL filtering when detecting browser tabs
 */
export interface TabFilterOptions {
  /** Only return URLs that match this pattern (e.g., 'youtube.com/watch') */
  urlPattern?: string
  /** Only return URLs that start with http/https */
  requireValidUrl?: boolean
}

/**
 * Browser constants used across all detection methods
 */
export const SUPPORTED_BROWSERS = ['Google Chrome', 'Chrome', 'Arc', 'Safari']
export const ALL_BROWSERS = [
  'Safari',
  'Firefox',
  'Microsoft Edge',
  'Opera',
  'Brave Browser',
  'Google Chrome',
  'Chrome',
  'Arc',
]

/**
 * Check if an application name corresponds to a supported browser
 */
export function isSupportedBrowser(appName: string): boolean {
  return SUPPORTED_BROWSERS.some((browser) => appName.includes(browser))
}

/**
 * Check if an application name corresponds to any browser (supported or not)
 */
export function isBrowser(appName: string): boolean {
  return ALL_BROWSERS.some((browser) => appName.includes(browser))
}

/**
 * Extract URL from browser using keyboard shortcuts
 * Different browsers require different key combinations
 */
async function extractUrlFromBrowser(browserName: string): Promise<string | null> {
  try {
    if (browserName.includes('Arc')) {
      // Arc supports Cmd+Shift+C to copy URL
      await execAsync(
        `osascript -e 'tell application "System Events" to tell process "${browserName.replace(/"/g, '\\"')}" to keystroke "c" using {command down, shift down}'`,
      )
    } else if (browserName.includes('Chrome') || browserName.includes('Safari')) {
      // Chrome and Safari require Cmd+L to select address bar, then Cmd+C to copy
      await execAsync(
        `osascript -e 'tell application "System Events" to tell process "${browserName.replace(/"/g, '\\"')}" to keystroke "l" using {command down}'`,
      )
      await new Promise((resolve) => setTimeout(resolve, 100))
      await execAsync(
        `osascript -e 'tell application "System Events" to tell process "${browserName.replace(/"/g, '\\"')}" to keystroke "c" using {command down}'`,
      )
    }

    await new Promise((resolve) => setTimeout(resolve, 300))

    const urlResult = await execAsync(`osascript -e 'get the clipboard as string'`)
    return urlResult.stdout.trim()
  } catch {
    return null
  }
}

/**
 * Get previously frontmost application before Raycast
 * This is crucial for commands launched via Raycast search interface
 */
async function getPreviouslyActiveBrowserTab(
  options: TabFilterOptions = {},
): Promise<TabInfo | null> {
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

    // Find the first supported browser in the list (most recently active non-Raycast app)
    for (const app of allApps) {
      if (isSupportedBrowser(app)) {
        const browserUrl = await extractUrlFromBrowser(app)

        if (browserUrl && isValidUrl(browserUrl, options)) {
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
      }
    }

    return null
  } catch (error) {
    console.error('Error getting previously active browser:', error)
    return null
  }
}

/**
 * Get frontmost browser tab using direct frontmost application detection
 * This works well for keyboard shortcuts
 */
async function getDirectFrontmostTab(options: TabFilterOptions = {}): Promise<TabInfo | null> {
  let frontmostApp: string | null = null
  let frontmostUrl: string | null = null

  try {
    // Get the frontmost browser and check if it has a valid URL
    const frontAppResult = await execAsync(
      `osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`,
    )
    const frontApp = frontAppResult.stdout.trim()
    frontmostApp = frontApp

    // Check if frontmost app is a browser but not supported
    if (isBrowser(frontApp) && !isSupportedBrowser(frontApp)) {
      throw new Error(`UNSUPPORTED_BROWSER:${frontApp}`)
    }

    // If frontmost is a supported browser, try to get the URL
    if (isSupportedBrowser(frontApp)) {
      frontmostUrl = await extractUrlFromBrowser(frontApp)
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

  // If we got a valid URL from the frontmost browser, try to enhance it with tab info
  if (frontmostUrl && isValidUrl(frontmostUrl, options)) {
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

  // Fallback: Only use browser extension if we have a supported frontmost browser but couldn't get URL
  if (frontmostApp && isSupportedBrowser(frontmostApp)) {
    return await getBrowserExtensionTab(options)
  } else if (frontmostApp) {
    // We know frontmost app but it's not supported
    throw new Error(`UNSUPPORTED_BROWSER:${frontmostApp}`)
  }

  // If we get here, we couldn't determine the frontmost app at all
  const contextError = options.urlPattern
    ? `Please ensure you have Chrome, Arc, or Safari as the frontmost window with a ${options.urlPattern} page open.`
    : 'Please ensure you have Chrome, Arc, or Safari as the frontmost window with a webpage open.'

  throw new Error(`Could not determine the frontmost application. ${contextError}`)
}

/**
 * Get browser tab using browser extension API only
 */
async function getBrowserExtensionTab(options: TabFilterOptions = {}): Promise<TabInfo | null> {
  try {
    const tabs = await BrowserExtension.getTabs()

    if (!tabs || tabs.length === 0) {
      throw new Error(
        'Could not access browser tabs. Please ensure Raycast has permission to access your browser.',
      )
    }

    const activeTab = tabs.find((tab) => {
      if (!tab.active || !tab.url) return false
      return isValidUrl(tab.url, options)
    })

    if (!activeTab) {
      const errorContext = options.urlPattern
        ? `No active ${options.urlPattern} tab found. Please open the appropriate page and try again.`
        : 'No active tab found. Please open a webpage and try again.'
      throw new Error(errorContext)
    }

    return {
      url: activeTab.url,
      tabId: activeTab.id,
      title: activeTab.title,
    }
  } catch {
    // Browser extension also failed
    const fallbackContext = options.urlPattern
      ? `No active ${options.urlPattern} page found. Please open the appropriate page in Chrome, Arc, or Safari and try again.`
      : 'No active webpage found. Please open a webpage in Chrome, Arc, or Safari and try again.'
    throw new Error(fallbackContext)
  }
}

/**
 * Check if a URL is valid according to the given options
 */
function isValidUrl(url: string, options: TabFilterOptions): boolean {
  // Check basic URL validity if required
  if (options.requireValidUrl !== false) {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return false
    }
  }

  // Check URL pattern if specified
  if (options.urlPattern) {
    return url.includes(options.urlPattern)
  }

  return true
}

/**
 * Get frontmost browser tab using unified approach for all browsers
 * Main entry point that handles different launch types automatically
 */
export async function getFrontmostTab(options: TabFilterOptions = {}): Promise<TabInfo | null> {
  // Check launch type to determine strategy
  const isKeyboardLaunch = environment.launchType === LaunchType.UserInitiated

  // For keyboard shortcuts, use the direct frontmost approach
  if (isKeyboardLaunch) {
    return await getDirectFrontmostTab(options)
  } else {
    // For Raycast search launches, find previously active browser
    const previousTab = await getPreviouslyActiveBrowserTab(options)
    if (previousTab) {
      return previousTab
    }
    // Fallback to browser extension if previous approach fails
    return await getBrowserExtensionTab(options)
  }
}
