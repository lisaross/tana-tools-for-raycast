import { Clipboard, showHUD, BrowserExtension, Toast, showToast } from '@raycast/api'
import { convertToTana } from './utils/tana-converter'
import { YoutubeTranscript } from 'youtube-transcript'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

/**
 * YouTube to Tana Converter with Enhanced Browser Compatibility
 *
 * This module extracts YouTube video metadata and transcripts, converting them
 * to Tana Paste format. It includes specialized compatibility handling for
 * Firefox-based browsers, particularly Zen Browser.
 *
 * Compatibility Features:
 * - Multiple fallback CSS selectors for different browser DOM structures
 * - Retry mechanisms with configurable delays for content loading
 * - Browser-specific timing adjustments for Firefox/Zen Browser
 * - Robust error handling with graceful degradation
 * - Support for both expanded and collapsed description content
 *
 * Browser Support:
 * - Chrome/Chromium: Primary selectors with fast extraction
 * - Safari: Primary selectors with standard timing
 * - Firefox: Enhanced selectors with retry logic
 * - Zen Browser: Specialized Firefox optimizations with extended delays
 *
 * Technical Notes:
 * - Zen Browser often requires additional time for DOM content to fully render
 * - Firefox-based browsers may use different CSS class structures
 * - Description expansion buttons may have different selectors in Firefox
 * - Retry logic helps handle asynchronous content loading differences
 */

interface VideoInfo {
  title: string
  channelName: string
  channelUrl: string
  url: string
  videoId: string
  description: string
  transcript?: string // Make transcript optional
}

/**
 * Browser detection utility
 */
interface BrowserInfo {
  isFirefox: boolean
  isZen: boolean
  userAgent: string
}

/**
 * Detect browser type from user agent
 */
async function detectBrowser(): Promise<BrowserInfo> {
  try {
    const tabs = await BrowserExtension.getTabs()
    const activeTab = tabs.find((tab) => tab.active)

    if (!activeTab?.id) {
      return { isFirefox: false, isZen: false, userAgent: '' }
    }

    // Try to get user agent from browser - this is a fallback approach
    // Since we can't directly access navigator from Raycast, we'll use heuristics
    // based on the browser behavior and available content selectors

    const userAgent = ''
    const isFirefox = false // We'll detect this through selector availability
    const isZen = false // We'll detect this through selector availability

    return { isFirefox, isZen, userAgent }
  } catch {
    return { isFirefox: false, isZen: false, userAgent: '' }
  }
}

/**
 * Get browser-specific CSS selectors
 */
function getBrowserSpecificSelectors(_browserInfo: BrowserInfo) {
  // Firefox/Zen Browser often has different timing and CSS rendering
  // We'll provide multiple fallback selectors for each element

  return {
    title: [
      // Primary selectors (work in most browsers)
      'h1.ytd-video-primary-info-renderer',
      'h1.ytd-videoPrimaryInfoRenderer',
      // Firefox/Zen fallbacks
      'h1[class*="video-primary-info"] yt-formatted-string',
      'h1[class*="videoPrimaryInfo"] yt-formatted-string',
      // Additional fallbacks
      '.ytd-video-primary-info-renderer h1',
      '.content.ytd-video-primary-info-renderer h1',
      'h1 yt-formatted-string[class*="title"]',
      // Zen Browser specific attempts
      'h1 yt-formatted-string',
      'h1[class*="title"]',
      'ytd-video-primary-info-renderer h1',
      '.title h1',
      'h1[role="heading"]',
      // Last resort - very broad selectors
      'h1',
      '[class*="title"] h1',
      'main h1',
      '#primary h1',
    ],

    channel: [
      // Primary selectors
      '#channel-name yt-formatted-string a',
      '#owner-name a',
      // Firefox/Zen fallbacks
      '[id*="channel-name"] a',
      '[id*="owner"] a yt-formatted-string',
      // Additional fallbacks
      '.ytd-channel-name a',
      '.ytd-video-owner-renderer a',
      'a[href*="/channel/"]',
      'a[href*="/@"]',
      // Zen Browser specific attempts
      '#channel-name a',
      '.channel-name a',
      '[class*="channel"] a',
      '[class*="owner"] a',
      'ytd-channel-name a',
      'ytd-video-owner-renderer a',
      // Very broad fallbacks
      'a[href*="/c/"]',
      'a[href*="youtube.com/channel"]',
      'a[href*="youtube.com/@"]',
    ],

    description: [
      // Primary selectors - expanded content
      'ytd-text-inline-expander yt-attributed-string',
      'ytd-text-inline-expander yt-formatted-string',
      'ytd-text-inline-expander #snippet-text',
      'ytd-text-inline-expander #plain-snippet-text',
      // Firefox/Zen fallbacks
      '[class*="text-inline-expander"] [class*="attributed-string"]',
      '[class*="expandable"] [class*="snippet"]',
      // Collapsed content fallbacks
      '.ytd-expandable-video-description-body-renderer',
      '#snippet-text',
      '#plain-snippet-text',
      // Metadata fallbacks
      '.ytd-video-secondary-info-renderer [class*="description"]',
      '[class*="description-text"]',
      // Zen Browser specific attempts
      'ytd-expandable-video-description-body-renderer',
      '[class*="description"] yt-formatted-string',
      '[class*="expandable"] yt-formatted-string',
      '.description-text',
      '[class*="video-description"]',
      // Very broad fallbacks for description
      '#description',
      '.description',
      '[class*="meta"] [class*="description"]',
      '#secondary [class*="description"]',
    ],
  }
}

/**
 * Robust content extraction with multiple selector fallbacks
 */
async function extractContentWithFallbacks(
  tabId: number,
  selectors: string[],
  format: 'text' | 'html' = 'text',
): Promise<string | null> {
  console.log(`Trying to extract content with ${selectors.length} selectors in format: ${format}`)

  for (let i = 0; i < selectors.length; i += 1) {
    const selector = selectors[i]
    try {
      console.log(`Attempting selector ${i + 1}/${selectors.length}: "${selector}"`)

      const content = await BrowserExtension.getContent({
        cssSelector: selector,
        format,
        tabId,
      })

      if (content && content.trim()) {
        console.log(
          `✅ Success with selector "${selector}": Found content (${content.length} chars)`,
        )
        return content.trim()
      } else {
        console.log(`❌ Selector "${selector}" returned empty content`)
      }
    } catch (error) {
      // Continue to next selector if this one fails
      console.log(
        `❌ Selector "${selector}" failed:`,
        error instanceof Error ? error.message : 'Unknown error',
      )
    }
  }

  console.log('❌ All selectors failed to find content')
  return null
}

/**
 * Enhanced content extraction with delay for Firefox-based browsers
 * Zen Browser sometimes needs more time for content to fully render
 */
async function extractContentWithDelay(
  tabId: number,
  selectors: string[],
  format: 'text' | 'html' = 'text',
  maxRetries: number = 3,
  delayMs: number = 1000,
): Promise<string | null> {
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    const content = await extractContentWithFallbacks(tabId, selectors, format)

    if (content) {
      return content
    }

    // If no content found and we have retries left, wait and try again
    if (attempt < maxRetries - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }

  return null
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
 * Get YouTube URL from frontmost browser window using AppleScript (fallback for unsupported browsers)
 */
async function getYouTubeUrlFromAppleScript(): Promise<{ url: string; title?: string } | null> {
  try {
    console.log('🍎 Trying AppleScript fallback for unsupported browser...')

    // First, let's get the frontmost app and ensure we ONLY work with it
    console.log('🔍 Getting frontmost app (must be the active window)...')

    const frontAppResult = await execAsync(
      `osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`,
    )
    const frontApp = frontAppResult.stdout.trim()
    console.log(`📱 Frontmost app: "${frontApp}"`)

    // STRICT CHECK: Only proceed if the frontmost app is a browser we want to work with
    const isSupportedBrowser =
      frontApp.toLowerCase().includes('zen') ||
      frontApp.toLowerCase().includes('firefox') ||
      frontApp.toLowerCase().includes('chrome') ||
      frontApp.toLowerCase().includes('safari') ||
      frontApp.toLowerCase().includes('arc')

    if (!isSupportedBrowser) {
      console.log(`❌ Frontmost app "${frontApp}" is not a supported browser - stopping here`)
      return null
    }

    // Normalize app name for better logging
    let browserName = frontApp
    if (frontApp.toLowerCase().includes('zen')) {
      browserName = 'Zen Browser'
    } else if (frontApp.toLowerCase().includes('firefox')) {
      browserName = 'Firefox'
    } else if (frontApp.toLowerCase().includes('chrome')) {
      browserName = frontApp
    } else if (frontApp.toLowerCase().includes('safari')) {
      browserName = 'Safari'
    } else if (frontApp.toLowerCase().includes('arc')) {
      browserName = 'Arc'
    }

    console.log(`🎯 Working with frontmost app: ${browserName}`)

    // IMPORTANT: Verify this app is actually frontmost and has focus
    try {
      const frontmostCheck = await execAsync(
        `osascript -e 'tell application "System Events" to tell process "${frontApp}" to get frontmost'`,
      )
      const isFrontmost = frontmostCheck.stdout.trim() === 'true'

      if (!isFrontmost) {
        console.log(`❌ Browser "${frontApp}" is not actually frontmost - aborting`)
        return null
      }
    } catch {
      console.log(`❌ Could not verify frontmost status for "${frontApp}" - aborting`)
      return null
    }

    // Try direct AppleScript access first for supported browsers (FRONTMOST WINDOW ONLY)
    try {
      if (browserName === 'Safari') {
        const urlResult = await execAsync(
          `osascript -e 'tell application "Safari" to get URL of front document'`,
        )
        const url = urlResult.stdout.trim()
        if (url && url.includes('youtube.com/watch')) {
          console.log(`✅ Got Safari URL from frontmost window: ${url.substring(0, 60)}...`)
          return { url, title: undefined }
        }
      } else if (browserName.toLowerCase().includes('chrome')) {
        const urlResult = await execAsync(
          `osascript -e 'tell application "${browserName}" to get URL of active tab of front window'`,
        )
        const url = urlResult.stdout.trim()
        if (url && url.includes('youtube.com/watch')) {
          console.log(`✅ Got Chrome URL from frontmost window: ${url.substring(0, 60)}...`)
          return { url, title: undefined }
        } else if (browserName === 'Arc') {
          const urlResult = await execAsync(
            `osascript -e 'tell application "Arc" to get URL of active tab of front window'`,
          )
          const url = urlResult.stdout.trim()
          if (url && url.includes('youtube.com/watch')) {
            console.log(`✅ Got Arc URL from frontmost window: ${url.substring(0, 60)}...`)
            return { url, title: undefined }
          }
        }
      }
    } catch (error) {
      console.log('Direct browser access failed for frontmost window:', error)
    }

    // For browsers that don't support direct access (like Zen Browser),
    // check if there's already a YouTube URL in the clipboard
    console.log('📋 Checking current clipboard for YouTube URL...')
    try {
      const clipboardResult = await execAsync(`osascript -e 'get the clipboard as string'`)
      const clipboardUrl = clipboardResult.stdout.trim()

      // Be more strict about URL detection - must start with http and be a proper YouTube URL
      if (
        clipboardUrl &&
        clipboardUrl.startsWith('http') &&
        clipboardUrl.includes('youtube.com/watch') &&
        !clipboardUrl.includes('\n') && // Not multi-line content
        !clipboardUrl.includes('%%tana%%') && // Not Tana-formatted content
        clipboardUrl.length < 500
      ) {
        // Reasonable URL length
        console.log(`✅ Found YouTube URL in clipboard: ${clipboardUrl.substring(0, 60)}...`)
        return { url: clipboardUrl, title: undefined }
      } else {
        console.log(
          `📋 Clipboard content doesn't contain valid YouTube URL: "${clipboardUrl.substring(0, 50)}..."`,
        )
      }
    } catch {
      console.log('Could not read clipboard')
    }

    // STRICT FOCUS: Ensure we're only working with the frontmost window
    console.log('⚠️ STRICT MODE: Only working with absolute frontmost window')

    // Double-check that our target browser is still frontmost before keyboard actions
    try {
      const stillFrontmostResult = await execAsync(
        `osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`,
      )
      const stillFrontmost = stillFrontmostResult.stdout.trim()

      if (stillFrontmost !== frontApp) {
        console.log(
          `❌ Focus changed! Expected "${frontApp}" but now "${stillFrontmost}" is frontmost - aborting`,
        )
        return null
      }
    } catch {
      console.log('❌ Could not verify frontmost status before keyboard actions - aborting')
      return null
    }

    // Try keyboard shortcut to copy current page URL (works in some browsers)
    console.log('⌨️ Trying Cmd+Shift+C to copy current page URL from frontmost window...')
    try {
      // Make sure the browser is active (redundant but safe)
      await execAsync(
        `osascript -e 'tell application "System Events" to tell process "${frontApp}" to set frontmost to true'`,
      )
      await new Promise((resolve) => setTimeout(resolve, 300))

      // Final check before keyboard action
      const finalFrontmostResult = await execAsync(
        `osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`,
      )
      const finalFrontmost = finalFrontmostResult.stdout.trim()

      if (finalFrontmost !== frontApp) {
        console.log(
          `❌ Focus lost before keyboard action! Expected "${frontApp}" but got "${finalFrontmost}" - aborting`,
        )
        return null
      }

      // Try Cmd+Shift+C (copies current page URL in many browsers)
      await execAsync(
        `osascript -e 'tell application "System Events" to tell process "${frontApp}" to keystroke "c" using {command down, shift down}'`,
      )
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // Check clipboard again
      const urlResult = await execAsync(`osascript -e 'get the clipboard as string'`)
      const url = urlResult.stdout.trim()

      console.log(`📋 After Cmd+Shift+C, clipboard: "${url.substring(0, 100)}..."`)

      if (
        url &&
        url.startsWith('http') &&
        url.includes('youtube.com/watch') &&
        !url.includes('\n') &&
        !url.includes('%%tana%%') &&
        url.length < 500
      ) {
        console.log(
          `✅ Got YouTube URL via Cmd+Shift+C from frontmost window: ${url.substring(0, 60)}...`,
        )
        return { url, title: undefined }
      }
    } catch (error) {
      console.log('Cmd+Shift+C method failed:', error)
    }

    // Try alternative keyboard method with different timing (FRONTMOST WINDOW ONLY)
    console.log('⌨️ Trying alternative keyboard method (Cmd+L then Cmd+C) on frontmost window...')
    try {
      // One more frontmost check
      const lastFrontmostResult = await execAsync(
        `osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`,
      )
      const lastFrontmost = lastFrontmostResult.stdout.trim()

      if (lastFrontmost !== frontApp) {
        console.log(
          `❌ Focus changed before alternative method! Expected "${frontApp}" but got "${lastFrontmost}" - aborting`,
        )
        return null
      }

      // Make sure browser is active
      await execAsync(
        `osascript -e 'tell application "System Events" to tell process "${frontApp}" to set frontmost to true'`,
      )
      await new Promise((resolve) => setTimeout(resolve, 800))

      // Focus address bar with longer delay
      await execAsync(
        `osascript -e 'tell application "System Events" to tell process "${frontApp}" to keystroke "l" using command down'`,
      )
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // Copy URL
      await execAsync(
        `osascript -e 'tell application "System Events" to tell process "${frontApp}" to keystroke "c" using command down'`,
      )
      await new Promise((resolve) => setTimeout(resolve, 500))

      // Check clipboard
      const urlResult = await execAsync(`osascript -e 'get the clipboard as string'`)
      const url = urlResult.stdout.trim()

      console.log(`📋 After alternative method, clipboard: "${url.substring(0, 100)}..."`)

      if (
        url &&
        url.startsWith('http') &&
        url.includes('youtube.com/watch') &&
        !url.includes('\n') &&
        !url.includes('%%tana%%') &&
        url.length < 500
      ) {
        console.log(
          `✅ Got YouTube URL via alternative method from frontmost window: ${url.substring(0, 60)}...`,
        )
        return { url, title: undefined }
      }
    } catch (error) {
      console.log('Alternative keyboard method failed:', error)
    }

    console.log('❌ No YouTube URL found via AppleScript methods from frontmost window')
    return null
  } catch (error) {
    console.log('❌ AppleScript fallback failed:', error instanceof Error ? error.message : error)
    return null
  }
}

/**
 * Get the frontmost YouTube tab (always uses frontmost window approach)
 */
async function getFrontmostYouTubeTab() {
  try {
    console.log('🎯 Using unified frontmost window approach for all browsers...')

    // Always use AppleScript to get URL from the absolute frontmost window
    const appleScriptResult = await getYouTubeUrlFromAppleScript()

    if (!appleScriptResult) {
      throw new Error(
        'Could not get YouTube URL from frontmost window. Please ensure you have a YouTube video open in the frontmost browser window and try again.',
      )
    }

    // Create a unified tab object
    const frontmostTab = {
      id: 0, // We'll handle this as a special case - means "use web scraping only"
      url: appleScriptResult.url,
      title: appleScriptResult.title || 'YouTube Video',
      active: true,
    }

    console.log(`🎯 Got YouTube URL from frontmost window:`, {
      url: frontmostTab.url.substring(0, 100) + '...',
      title: frontmostTab.title?.substring(0, 50) + '...',
    })

    return frontmostTab
  } catch (error) {
    console.error('❌ Failed to get YouTube URL from frontmost window:', error)
    throw error
  }
}

/**
 * Extracts video information from the active YouTube tab
 */
async function extractVideoInfo(): Promise<VideoInfo> {
  try {
    console.log('🔍 Starting video info extraction...')

    // Get the frontmost YouTube tab with better selection logic
    const activeTab = await getFrontmostYouTubeTab()

    // Extract the video ID from URL
    const urlObj = new URL(activeTab.url)
    const videoId = urlObj.searchParams.get('v')
    console.log(`🆔 Video ID extracted: ${videoId}`)

    if (!videoId) {
      throw new Error('Could not extract video ID from the URL.')
    }

    // Detect browser and get appropriate selectors
    const browserInfo = await detectBrowser()
    const selectors = getBrowserSpecificSelectors(browserInfo)
    console.log(`🌐 Browser detection complete, selector counts:`, {
      title: selectors.title.length,
      channel: selectors.channel.length,
      description: selectors.description.length,
    })

    // Check if we have browser extension access (but this is now optional)
    const hasBrowserExtension = activeTab.id !== 0
    
    let title: string
    let channelName: string = 'Unknown Channel'
    let channelUrl: string
    let description: string

    console.log(`🎯 Using unified extraction approach. Browser extension available: ${hasBrowserExtension}`)
    
    // Get title - use browser extension if available, otherwise use AppleScript
    if (hasBrowserExtension) {
      console.log('📝 Extracting title via browser extension...')
      const extractedTitle = await extractContentWithDelay(
        activeTab.id,
        selectors.title,
        'text',
        2,
        500,
      )

      if (!extractedTitle) {
        console.log('⚠️ Browser extension title extraction failed, using AppleScript title')
        title = activeTab.title || 'YouTube Video'
      } else {
        title = extractedTitle
        console.log(`✅ Title extracted via browser extension: "${title.substring(0, 50)}..."`)
      }
    } else {
      // Use AppleScript to get enhanced title info
      title = activeTab.title || 'YouTube Video'
      
      try {
        console.log('🔍 Trying to get enhanced page title via AppleScript...')
        
        const frontAppResult = await execAsync(
          `osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`,
        )
        const frontApp = frontAppResult.stdout.trim()

        // Try to get the window/document title for better title extraction
        let pageTitle = ''
        if (frontApp.toLowerCase().includes('zen') || frontApp.toLowerCase().includes('firefox')) {
          try {
            const titleResult = await execAsync(
              `osascript -e 'tell application "System Events" to tell process "${frontApp}" to get title of front window'`,
            )
            pageTitle = titleResult.stdout.trim()
          } catch (error) {
            console.log('Could not get window title:', error)
          }
        } else if (frontApp.toLowerCase().includes('chrome') || frontApp.toLowerCase().includes('arc')) {
          try {
            const titleResult = await execAsync(
              `osascript -e 'tell application "${frontApp}" to get title of active tab of front window'`,
            )
            pageTitle = titleResult.stdout.trim()
          } catch (error) {
            console.log('Could not get Chrome/Arc tab title:', error)
          }
        } else if (frontApp.toLowerCase().includes('safari')) {
          try {
            const titleResult = await execAsync(
              `osascript -e 'tell application "Safari" to get name of front document'`,
            )
            pageTitle = titleResult.stdout.trim()
          } catch (error) {
            console.log('Could not get Safari document title:', error)
          }
        }

        if (pageTitle && pageTitle.length > 0) {
          console.log(`📰 Got enhanced page title: "${pageTitle.substring(0, 100)}..."`)

          // Clean up the page title
          let cleanTitle = pageTitle
          cleanTitle = cleanTitle.replace(' - YouTube', '')
          cleanTitle = cleanTitle.replace(/^\(\d+\)\s*/, '') // Remove notification count
          
          title = cleanTitle.trim()
          console.log(`✅ Enhanced title: "${title.substring(0, 50)}..."`)
        }
      } catch (error) {
        console.log('⚠️ Could not enhance title via AppleScript:', error)
      }
    }

    // ALWAYS use web scraping for channel info - it's the most reliable method for all browsers
    console.log('🌐 Using web scraping for channel information...')
    try {
      const webScrapingResult = await extractChannelViaWebScraping(activeTab.url)
      if (webScrapingResult) {
        channelName = webScrapingResult.channelName
        channelUrl = webScrapingResult.channelUrl
        console.log(`✅ Web scraping successful: "${channelName}" -> ${channelUrl}`)
        
        // Use description from web scraping if available
        if (webScrapingResult.description) {
          description = webScrapingResult.description
          console.log(`📄 Description extracted via web scraping: "${description.substring(0, 100)}..."`)
        } else {
          description = 'Description not available'
        }
      } else {
        console.log('⚠️ Web scraping failed, using fallback values')
        channelName = 'Unknown Channel'
        channelUrl = 'https://www.youtube.com'
        description = 'Description not available'
      }
    } catch (error) {
      console.log('⚠️ Web scraping error:', error)
      channelName = 'Unknown Channel'
      channelUrl = 'https://www.youtube.com'
      description = 'Description not available'
    }

    // Extract description via browser extension if available (this is optional bonus info)
    if (hasBrowserExtension) {
      console.log('📄 Trying to enhance description via browser extension...')
      const extractedDescription = await extractContentWithDelay(
        activeTab.id,
        selectors.description,
        'text',
        2,
        500,
      )

      if (extractedDescription) {
        console.log(`✅ Enhanced description via browser extension: "${extractedDescription.substring(0, 100)}..."`)
        
        description = decodeHTMLEntities(
          extractedDescription
            .replace(/Show more$/, '')
            .replace(/Show less$/, '')
            .replace(/^\s*\.{3}\s*/, '')
            .replace(/\s*\.{3}$/, '')
            .replace(/^\s*Show more\s*\n?/, '')
            .replace(/\n?\s*Show less\s*$/, '')
            .replace(/^\s+|\s+$/g, '')
            .trim(),
        )
      } else if (!description || description === 'Description not available') {
        console.log('⚠️ Browser extension description extraction failed, keeping web scraping result')
      }
    }

    const result = {
      title: decodeHTMLEntities(title.trim()),
      channelName: channelName,
      channelUrl: channelUrl,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      videoId: videoId,
      description: description,
    }

    console.log('✅ Video info extraction completed successfully:', {
      title: result.title.substring(0, 50) + '...',
      channel: result.channelName,
      videoId: result.videoId,
      descriptionLength: result.description.length,
    })

    // Return complete VideoInfo
    return result
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    console.error('❌ Video info extraction failed:', errorMessage)

    // Show a persistent error toast with more details
    await showToast({
      style: Toast.Style.Failure,
      title: 'Failed to extract video information',
      message: errorMessage,
    })
    throw error
  }
}

/**
 * Validates transcript quality to ensure it's substantial enough to be useful
 */
function validateTranscriptQuality(transcript: string, videoId: string): boolean {
  if (!transcript || transcript.trim().length === 0) {
    console.log(`Transcript validation failed for ${videoId}: Empty transcript`)
    return false
  }

  // Check if transcript is too short (likely incomplete)
  const minLength = 50 // Minimum 50 characters for a meaningful transcript
  if (transcript.trim().length < minLength) {
    console.log(
      `Transcript validation failed for ${videoId}: Too short (${transcript.length} chars)`,
    )
    return false
  }

  // Check if transcript contains meaningful words (not just punctuation/numbers)
  const wordCount = transcript
    .trim()
    .split(/\s+/)
    .filter((word) => /[a-zA-Z]/.test(word)).length
  if (wordCount < 10) {
    console.log(
      `Transcript validation failed for ${videoId}: Too few meaningful words (${wordCount})`,
    )
    return false
  }

  // Check for common error patterns
  const errorPatterns = [
    /transcript\s+not\s+available/i,
    /no\s+captions\s+available/i,
    /transcript\s+disabled/i,
    /automatic\s+captions\s+not\s+available/i,
  ]

  for (const pattern of errorPatterns) {
    if (pattern.test(transcript)) {
      console.log(`Transcript validation failed for ${videoId}: Contains error pattern`)
      return false
    }
  }

  console.log(
    `Transcript validation passed for ${videoId}: ${transcript.length} chars, ${wordCount} words`,
  )
  return true
}

/**
 * Extracts the transcript from a YouTube video with retry logic
 */
async function extractTranscript(videoId: string): Promise<string> {
  const maxRetries = 3
  const baseDelay = 2000 // 2 seconds

  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    try {
      console.log(`Transcript extraction attempt ${attempt + 1}/${maxRetries} for video ${videoId}`)

      // Fetch transcript using the youtube-transcript library
      const transcriptData = await YoutubeTranscript.fetchTranscript(videoId, {
        // Add timeout and other options to make it more reliable
        lang: 'en', // Try English first
      })

      if (!transcriptData || transcriptData.length === 0) {
        throw new Error('No transcript data returned from API')
      }

      // Format the transcript segments - create clean, continuous text
      let formattedTranscript = ''
      let lastTime = -1
      const paragraphBreakThreshold = 10 // Increased threshold for cleaner paragraph breaks

      for (const segment of transcriptData) {
        // Check if we need a paragraph break (if there's a significant time gap)
        const currentTime = Math.floor(segment.offset / 1000)

        if (lastTime !== -1 && currentTime - lastTime > paragraphBreakThreshold) {
          // Use a consistent paragraph separator that we can easily handle later
          formattedTranscript += ' [PARAGRAPH_BREAK] '
        } else if (formattedTranscript) {
          formattedTranscript += ' '
        }

        // Add the text - strip any hashtags and clean up
        const cleanedText = decodeHTMLEntities(segment.text)
          .replace(/#\w+\b/g, '')
          .replace(/\s+/g, ' ') // Normalize whitespace
          .trim()
        if (cleanedText) {
          formattedTranscript += cleanedText
        }
        lastTime = currentTime
      }

      // Clean up the final transcript and convert paragraph breaks to double spaces
      const finalTranscript = formattedTranscript
        .replace(/\s*\[PARAGRAPH_BREAK\]\s*/g, '  ') // Convert to double spaces for paragraph separation
        .replace(/\s+/g, ' ') // Normalize all whitespace to single spaces
        .trim()

      if (!finalTranscript) {
        throw new Error('Transcript was empty after processing')
      }

      // Validate transcript quality
      if (!validateTranscriptQuality(finalTranscript, videoId)) {
        throw new Error(
          'Transcript quality validation failed - transcript may be incomplete or invalid',
        )
      }

      console.log(`Successfully extracted transcript on attempt ${attempt + 1}`)
      return finalTranscript
    } catch (error) {
      const isLastAttempt = attempt === maxRetries - 1
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      console.error(`Transcript extraction attempt ${attempt + 1} failed:`, errorMessage)

      if (isLastAttempt) {
        // On the final attempt, throw a more specific error
        if (
          errorMessage.includes('Transcript is disabled') ||
          errorMessage.includes('No transcript available')
        ) {
          throw new Error(
            'No transcript available for this video (transcripts may be disabled by the creator)',
          )
        } else if (
          errorMessage.includes('Video unavailable') ||
          errorMessage.includes('Private video')
        ) {
          throw new Error('Cannot access transcript: video may be private or unavailable')
        } else if (errorMessage.includes('quality validation failed')) {
          throw new Error('Transcript found but appears incomplete or invalid')
        } else {
          throw new Error(
            `Could not extract transcript after ${maxRetries} attempts: ${errorMessage}`,
          )
        }
      }

      // Wait before retrying, with exponential backoff
      const delay = baseDelay * Math.pow(1.5, attempt)
      console.log(`Waiting ${delay}ms before retry...`)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  // This should never be reached due to the throw in the last attempt
  throw new Error('Transcript extraction failed unexpectedly')
}

/**
 * Try to extract transcript with multiple language fallbacks
 */
async function extractTranscriptWithLanguageFallbacks(videoId: string): Promise<string> {
  const languageCodes = ['en', 'en-US', 'en-GB', 'auto', undefined] // Try various language codes

  for (const lang of languageCodes) {
    try {
      console.log(`Trying transcript extraction with language: ${lang || 'default'}`)

      const options = lang ? { lang } : {}
      const transcriptData = await YoutubeTranscript.fetchTranscript(videoId, options)

      if (transcriptData && transcriptData.length > 0) {
        // Process the transcript data with the same clean formatting as the main function
        let formattedTranscript = ''
        let lastTime = -1
        const paragraphBreakThreshold = 10 // Consistent with main function

        for (const segment of transcriptData) {
          const currentTime = Math.floor(segment.offset / 1000)

          if (lastTime !== -1 && currentTime - lastTime > paragraphBreakThreshold) {
            formattedTranscript += ' [PARAGRAPH_BREAK] '
          } else if (formattedTranscript) {
            formattedTranscript += ' '
          }

          const cleanedText = decodeHTMLEntities(segment.text)
            .replace(/#\w+\b/g, '')
            .replace(/\s+/g, ' ')
            .trim()
          if (cleanedText) {
            formattedTranscript += cleanedText
          }
          lastTime = currentTime
        }

        // Apply the same final cleaning as the main function
        const result = formattedTranscript
          .replace(/\s*\[PARAGRAPH_BREAK\]\s*/g, '  ')
          .replace(/\s+/g, ' ')
          .trim()

        if (result) {
          console.log(`Successfully extracted transcript with language: ${lang || 'default'}`)
          return result
        }
      }
    } catch (error) {
      console.log(
        `Language ${lang || 'default'} failed:`,
        error instanceof Error ? error.message : 'Unknown error',
      )
      // Continue to next language
    }
  }

  throw new Error('No transcript available in any supported language')
}

/**
 * Safely format transcript content for Tana field to prevent it from being split into separate nodes
 */
function formatTranscriptForTanaField(transcript: string): string {
  return (
    transcript
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
 * Formats YouTube video information for Tana in Markdown format
 * that can be processed by our existing Tana converter
 */
function formatForTanaMarkdown(videoInfo: VideoInfo): string {
  // Create a Markdown representation that our tana-converter can process
  let markdown = `# ${videoInfo.title} #video\n`
  markdown += `URL::${videoInfo.url}\n`
  markdown += `Channel URL::${videoInfo.channelUrl}\n`
  markdown += `Author::${videoInfo.channelName}\n`

  // Add transcript as a field that will be processed into a nested structure
  // Use the safe formatting function to prevent transcript from being split into separate nodes
  if (videoInfo.transcript) {
    const safeTranscript = formatTranscriptForTanaField(videoInfo.transcript)
    markdown += `Transcript::${safeTranscript}\n`
  }

  // Keep the entire description in the Description field (don't split into separate nodes)
  const safeDescription = formatTranscriptForTanaField(videoInfo.description)
  markdown += `Description::${safeDescription}\n`

  return markdown
}

// Main command entry point
export default async function Command() {
  try {
    // Show HUD to indicate processing has started
    await showToast({
      style: Toast.Style.Animated,
      title: 'Processing YouTube Video',
    })

    // Extract video information from the active tab
    const videoInfo = await extractVideoInfo()

    // Try to extract transcript with multiple strategies
    let transcriptSuccess = false

    try {
      // First try the improved extraction with retry logic
      const transcript = await extractTranscript(videoInfo.videoId)
      videoInfo.transcript = transcript
      transcriptSuccess = true
      console.log('Transcript extracted successfully with primary method')
    } catch (transcriptError) {
      console.log('Primary transcript extraction failed, trying language fallbacks...')

      try {
        // Fallback to language-specific extraction
        const transcript = await extractTranscriptWithLanguageFallbacks(videoInfo.videoId)
        videoInfo.transcript = transcript
        transcriptSuccess = true
        console.log('Transcript extracted successfully with language fallbacks')
      } catch (fallbackError) {
        // Show a toast but continue with video info only
        const primaryError =
          transcriptError instanceof Error ? transcriptError.message : 'Unknown error'
        const fallbackErrorMsg =
          fallbackError instanceof Error ? fallbackError.message : 'Unknown error'

        await showToast({
          style: Toast.Style.Failure,
          title: 'Transcript Extraction Failed',
          message: `Primary: ${primaryError}. Fallback: ${fallbackErrorMsg}`,
        })

        console.log('All transcript extraction methods failed')
      }
    }

    // Format and copy to clipboard
    const markdownFormat = formatForTanaMarkdown(videoInfo)
    const tanaFormat = convertToTana(markdownFormat)
    await Clipboard.copy(tanaFormat)

    // Create success message based on transcript availability
    const baseMessage = transcriptSuccess
      ? 'YouTube video info and transcript copied to clipboard in Tana format'
      : 'YouTube video info copied to clipboard in Tana format (no transcript available)'

    // Open Tana automatically like other commands
    try {
      await execAsync('open tana://')
      await showHUD(`${baseMessage}. Opening Tana... ✨`)
    } catch (error) {
      console.error('Error opening Tana:', error)
      await showHUD(`${baseMessage} (but couldn't open Tana) ✨`)
    }
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: 'Processing Failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

// Helper function to extract channel info via background Safari
async function _extractChannelViaAppleScript(frontApp: string, videoUrl: string, videoId: string): Promise<string | null> {
  try {
    console.log('🔍 Attempting background Safari extraction for full channel info...')
    
    console.log('🦄 Opening Safari in background to extract channel information...')
    
    // Open Safari with the YouTube URL (try to keep it in background)
    await execAsync(
      `osascript -e 'tell application "Safari"
        activate
        set newTab to make new document with properties {URL:"${videoUrl}"}
        delay 2
      end tell'`,
    )
    
    console.log('⏳ Waiting for Safari page to load...')
    await new Promise((resolve) => setTimeout(resolve, 3000)) // Give Safari time to load
    
    // Now try to use BrowserExtension API with Safari
    try {
      console.log('🔍 Attempting to extract channel info from Safari...')
      
      const safariTabs = await BrowserExtension.getTabs()
      const safariYouTubeTab = safariTabs.find((tab) => 
        tab.url?.includes('youtube.com/watch') && 
        tab.url?.includes(videoId),
      )
      
      if (safariYouTubeTab && safariYouTubeTab.id) {
        console.log('✅ Found YouTube tab in Safari, extracting channel info...')
        
        // Use our existing selectors to extract channel info from Safari
        const selectors = getBrowserSpecificSelectors({ isFirefox: false, isZen: false, userAgent: '' })
        
        // Extract channel information
        const channelElement = await extractContentWithDelay(
          safariYouTubeTab.id,
          selectors.channel,
          'html',
          2,
          1000,
        )
        
        if (channelElement) {
          console.log(`✅ Safari channel element: "${channelElement.substring(0, 100)}..."`)
          
          // Parse channel name and URL
          const hrefMatch = channelElement.match(/href="([^"]+)"/)
          const textMatch = channelElement.match(/<a[^>]*>([^<]+)<\/a>/)
          
          if (hrefMatch && textMatch) {
            const extractedChannelName = decodeHTMLEntities(textMatch[1].trim())
            console.log(`🎯 Successfully extracted channel via Safari: "${extractedChannelName}"`)
            
            // Close the Safari tab to clean up
            try {
              await execAsync(
                `osascript -e 'tell application "Safari"
                  close current tab of front window
                end tell'`,
              )
              console.log('🧹 Cleaned up Safari tab')
            } catch (cleanupError) {
              console.log('⚠️ Could not clean up Safari tab:', cleanupError)
            }
            
            // Return focus to original browser
            try {
              await execAsync(
                `osascript -e 'tell application "${frontApp}" to activate'`,
              )
              console.log(`🔄 Returned focus to ${frontApp}`)
            } catch (focusError) {
              console.log('⚠️ Could not return focus:', focusError)
            }
            
            return extractedChannelName
          }
        }
      } else {
        console.log('❌ Could not find YouTube tab in Safari')
      }
    } catch (safariError) {
      console.log('❌ Safari extraction failed:', safariError)
    }
    
    // Cleanup Safari even if extraction failed
    try {
      await execAsync(
        `osascript -e 'tell application "Safari"
          close current tab of front window
        end tell'`,
      )
      console.log('🧹 Cleaned up Safari tab after failure')
    } catch (cleanupError) {
      console.log('⚠️ Could not clean up Safari tab after failure:', cleanupError)
    }
    
    // Return focus to original browser
    try {
      await execAsync(
        `osascript -e 'tell application "${frontApp}" to activate'`,
      )
      console.log(`🔄 Returned focus to ${frontApp} after Safari attempt`)
    } catch (focusError) {
      console.log('⚠️ Could not return focus after Safari attempt:', focusError)
    }
    
    // If Safari method failed, fall back to simple title parsing
    console.log('🔄 Safari method failed, falling back to title parsing...')
    return await extractChannelFromTitle(frontApp)
    
  } catch (error) {
    console.log('⚠️ Background Safari extraction error:', error)
    return null
  }
}

// Fallback function for simple title parsing
async function extractChannelFromTitle(frontApp: string): Promise<string | null> {
  try {
    // Get the page title for parsing
    let pageTitle = ''
    if (frontApp.toLowerCase().includes('zen') || frontApp.toLowerCase().includes('firefox')) {
      try {
        const titleResult = await execAsync(
          `osascript -e 'tell application "System Events" to tell process "${frontApp}" to get title of front window'`,
        )
        pageTitle = titleResult.stdout.trim()
        console.log(`📰 Got page title for parsing: "${pageTitle.substring(0, 100)}..."`)
      } catch (error) {
        console.log('Could not get window title:', error)
        return null
      }
    }
    
    if (pageTitle) {
      // Clean up the title first
      let cleanTitle = pageTitle
      cleanTitle = cleanTitle.replace(' - YouTube', '')
      cleanTitle = cleanTitle.replace(/^\(\d+\)\s*/, '') // Remove notification count
      
      // Try some simple patterns that might indicate channel name
      const simplePatterns = [
        // Pattern: "Video Title - Channel Name"
        /^([^-]+?)\s*-\s*([^-]+?)$/,
        // Pattern: "Channel Name • Video Title" 
        /^([^•]+?)\s*•\s*(.+)$/,
        // Pattern: "Channel Name | Video Title"
        /^([^|]+?)\s*\|\s*(.+)$/,
      ]
      
      for (const pattern of simplePatterns) {
        const match = cleanTitle.match(pattern)
        if (match && match.length === 3) {
          // We have two parts - need to figure out which is channel vs video
          const part1 = match[1].trim()
          const part2 = match[2].trim()
          
          // Heuristic: the shorter, more concise part is likely the channel
          // and it usually doesn't contain common video title words
          const videoKeywords = /\b(tutorial|guide|how to|review|vs|part \d+|episode|lesson|tips|tricks)\b/i
          
          if (part1.length <= part2.length && !videoKeywords.test(part1) && part1.length >= 3) {
            console.log(`🎯 Found potential channel via title parsing: "${part1}"`)
            return part1
          } else if (part2.length < part1.length && !videoKeywords.test(part2) && part2.length >= 3) {
            console.log(`🎯 Found potential channel via title parsing: "${part2}"`)
            return part2
          }
        }
      }
    }
    
    console.log('📋 Could not extract channel from title, will use fallback')
    return null
    
  } catch (error) {
    console.log('⚠️ Title parsing error:', error)
    return null
  }
}

// Helper function to extract channel info via direct web scraping (most reliable approach)
async function extractChannelViaWebScraping(videoUrl: string): Promise<{ channelName: string; channelUrl: string; description?: string } | null> {
  try {
    console.log('🌐 Attempting direct web scraping for channel info...')
    
    // Fetch the YouTube page HTML directly using curl with increased buffer
    const curlCommand = `curl -s -L -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" "${videoUrl}"`
    
    console.log('📡 Fetching YouTube page HTML...')
    const htmlResult = await execAsync(curlCommand, {
      maxBuffer: 1024 * 1024 * 10, // 10MB buffer to handle large pages
      timeout: 30000, // 30 second timeout
    })
    const html = htmlResult.stdout
    
    if (!html || html.length < 1000) {
      throw new Error('Failed to fetch page HTML or content too short')
    }
    
    console.log(`✅ Fetched HTML content (${html.length} characters)`)
    
    // Extract channel information using regex patterns
    // YouTube embeds JSON data in the HTML that contains structured channel info
    
    // Pattern 1: Look for channel name in video metadata
    const channelNamePatterns = [
      /"ownerChannelName":"([^"]+)"/,
      /"author":"([^"]+)"/,
      /"channelName":"([^"]+)"/,
      /,"name":"([^"]+)","url":"[^"]*\/@[^"]+"/,
      /,"name":"([^"]+)","url":"[^"]*\/channel\/[^"]+"/,
    ]
    
    // Pattern 2: Look for channel URL/ID
    const channelUrlPatterns = [
      /"ownerChannelName":"[^"]+","channelId":"([^"]+)"/,
      /"externalChannelId":"([^"]+)"/,
      /,"canonicalChannelUrl":"([^"]+)"/,
      /href="(\/channel\/[^"]+)"/,
      /href="(\/@[^"]+)"/,
    ]
    
    // Pattern 3: Look for video description
    const descriptionPatterns = [
      /"description":"([^"]+)"/,
      /"shortDescription":"([^"]+)"/,
      /"attributedDescription":{"content":"([^"]+)"/,
      /"videoDetails":[^}]*"shortDescription":"([^"]+)"/,
    ]
    
    let channelName = 'Unknown Channel'
    let channelUrl = 'https://www.youtube.com'
    let description = ''
    
    // Extract channel name
    for (const pattern of channelNamePatterns) {
      const match = html.match(pattern)
      if (match && match[1]) {
        // Decode HTML entities and clean up
        const extractedName = match[1]
          .replace(/\\u0026/g, '&')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\')
          .trim()
        
        if (extractedName && extractedName.length > 0 && extractedName.length < 100) {
          channelName = extractedName
          console.log(`🎯 Found channel name via pattern: "${channelName}"`)
          break
        }
      }
    }
    
    // Extract channel URL
    for (const pattern of channelUrlPatterns) {
      const match = html.match(pattern)
      if (match && match[1]) {
        let extractedUrl = match[1].trim()
        
        // Handle different URL formats
        if (extractedUrl.startsWith('/channel/') || extractedUrl.startsWith('/@')) {
          extractedUrl = `https://www.youtube.com${extractedUrl}`
        } else if (extractedUrl.startsWith('UC') && extractedUrl.length === 24) {
          // This is a channel ID
          extractedUrl = `https://www.youtube.com/channel/${extractedUrl}`
        } else if (!extractedUrl.startsWith('http')) {
          continue // Skip invalid URLs
        }
        
        channelUrl = extractedUrl
        console.log(`🔗 Found channel URL via pattern: "${channelUrl}"`)
        break
      }
    }
    
    // Extract description
    for (const pattern of descriptionPatterns) {
      const match = html.match(pattern)
      if (match && match[1]) {
        const extractedDescription = match[1]
          .replace(/\\u0026/g, '&')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\')
          .replace(/\\n/g, '\n')
          .replace(/\\t/g, ' ')
          // Remove hashtags to prevent them from becoming Tana supertags
          .replace(/#\w+\b/g, '')
          // Clean up any double spaces that might result from hashtag removal
          .replace(/\s+/g, ' ')
          .trim()
        
        if (extractedDescription && extractedDescription.length > 10 && extractedDescription.length < 5000) {
          description = extractedDescription
          console.log(`📄 Found description via pattern: "${description.substring(0, 100)}..."`)
          break
        }
      }
    }
    
    // Additional fallback: try to find channel handle in meta tags
    if (channelName === 'Unknown Channel') {
      const metaPatterns = [
        /<meta property="og:url" content="[^"]*\/@([^"/]+)"/,
        /<link rel="canonical" href="[^"]*\/@([^"/]+)"/,
      ]
      
      for (const pattern of metaPatterns) {
        const match = html.match(pattern)
        if (match && match[1]) {
          channelName = `@${match[1]}`
          channelUrl = `https://www.youtube.com/@${match[1]}`
          console.log(`🎯 Found channel via meta tags: "${channelName}"`)
          break
        }
      }
    }
    
    // If we found a valid channel name, return it
    if (channelName !== 'Unknown Channel' && channelName.length > 0) {
      const result: { channelName: string; channelUrl: string; description?: string } = { channelName, channelUrl }
      if (description) {
        result.description = description
      }
      console.log(`✅ Successfully extracted via web scraping: "${channelName}" -> ${channelUrl}${description ? ' (with description)' : ''}`)
      return result
    } else {
      console.log('⚠️ Web scraping found HTML but could not extract channel info')
      return null
    }
    
  } catch (error) {
    console.log('❌ Web scraping failed:', error instanceof Error ? error.message : error)
    return null
  }
}
