import { Clipboard, showHUD, BrowserExtension, Toast, showToast, environment, LaunchType } from '@raycast/api'
import { convertToTana } from './utils/tana-converter'
import { YoutubeTranscript } from 'youtube-transcript'
import { exec, execFile } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)
const execFileAsync = promisify(execFile)

/**
 * YouTube to Tana Converter
 *
 * This module extracts YouTube video metadata and transcripts, converting them
 * to Tana Paste format. It uses the browser extension API to get the active
 * YouTube tab and web scraping for reliable metadata extraction.
 *
 * Core Features:
 * - Direct browser tab detection via Raycast browser extension API
 * - Web scraping for video metadata (title, channel, description, duration)
 * - YouTube Transcript API for transcript extraction with retry logic
 * - Robust error handling with graceful degradation
 * - Clean conversion to Tana Paste format
 *
 * Technical Approach:
 * - Primary: Browser extension API to find active YouTube tab
 * - Metadata: curl + regex parsing of YouTube's embedded JSON data
 * - Transcripts: YouTube Transcript API with language fallbacks
 * - Works with Chrome, Arc, and Safari browsers (Arc: Cmd+Shift+C, Chrome/Safari: Cmd+L+Cmd+C for URL copying)
 */

/**
 * Video information extracted from YouTube
 */
interface VideoInfo {
  title: string
  channelName: string
  channelUrl: string
  url: string
  videoId: string
  description: string
  duration?: string
  transcript?: string // Make transcript optional
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
 * @returns Object containing URL and tab ID, or null if no YouTube tab found
 */
async function getPreviouslyActiveYouTubeTab(): Promise<TabInfo | null> {
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

          if (browserUrl?.includes('youtube.com/watch')) {
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
    console.error('Error getting previously active YouTube browser:', error)
    return null
  }
}

/**
 * Get frontmost YouTube tab using unified approach for all browsers
 * @returns Object containing URL and tab ID, or null if no YouTube tab found
 */
async function getFrontmostYouTubeTab(): Promise<TabInfo | null> {
  // Check launch type to determine strategy
  const isKeyboardLaunch = environment.launchType === LaunchType.UserInitiated
  
  // For keyboard shortcuts, use the direct frontmost approach
  if (isKeyboardLaunch) {
    return await getDirectFrontmostYouTubeTab()
  } else {
    // For Raycast search launches, find previously active browser
    const previousTab = await getPreviouslyActiveYouTubeTab()
    if (previousTab) {
      return previousTab
    }
    // Fallback to browser extension if previous approach fails
    return await getBrowserExtensionYouTubeTab()
  }
}

/**
 * Get frontmost YouTube tab using direct frontmost application detection
 * This works well for keyboard shortcuts
 */
async function getDirectFrontmostYouTubeTab(): Promise<TabInfo | null> {
  // First, get the frontmost application to enforce frontmost browser requirement
  let frontmostApp: string | null = null
  let frontmostUrl: string | null = null

  try {
    // Get the frontmost browser and check if it has a YouTube video
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

        if (clipboardUrl?.includes('youtube.com/watch')) {
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

  // If we got a YouTube URL from the frontmost browser, try to enhance it with tab info
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
      return await getBrowserExtensionYouTubeTab()
    } else {
      // We know frontmost app but it's not supported - this should have been caught earlier
      throw new Error(`UNSUPPORTED_BROWSER:${frontmostApp}`)
    }
  }

  // If we get here, we couldn't determine the frontmost app at all
  throw new Error(
    'Could not determine the frontmost application. Please ensure you have Chrome, Arc, or Safari as the frontmost window with a YouTube video open.',
  )
}

/**
 * Get YouTube tab using browser extension API only
 */
async function getBrowserExtensionYouTubeTab(): Promise<TabInfo | null> {
  try {
    const tabs = await BrowserExtension.getTabs()

    if (!tabs || tabs.length === 0) {
      throw new Error(
        'Could not access browser tabs. Please ensure Raycast has permission to access your browser.',
      )
    }

    const activeTab = tabs.find((tab) => tab.active && tab.url?.includes('youtube.com/watch'))

    if (!activeTab) {
      throw new Error(
        'No active YouTube video tab found. Please open a YouTube video and try again.',
      )
    }

    return {
      url: activeTab.url,
      tabId: activeTab.id,
      title: activeTab.title,
    }
  } catch {
    // Browser extension also failed
    throw new Error(
      'No active YouTube video found. Please open a YouTube video in Chrome, Arc, or Safari and try again. This extension currently supports Chrome, Arc, and Safari.',
    )
  }
}

/**
 * Extracts video information from the active YouTube tab
 */
async function extractVideoInfo(): Promise<VideoInfo> {
  try {
    // Get the frontmost YouTube tab with better selection logic
    const activeTab = await getFrontmostYouTubeTab()

    if (!activeTab) {
      throw new Error(
        'No YouTube tab found. Please ensure you have a YouTube video open in Chrome, Arc, or Safari as the frontmost window.',
      )
    }

    // Extract the video ID from URL
    const urlObj = new URL(activeTab.url)
    const videoId = urlObj.searchParams.get('v')

    if (!videoId) {
      throw new Error('Could not extract video ID from the URL.')
    }

    // Use web scraping for all metadata including duration
    try {
      const webScrapingResult = await extractChannelViaWebScraping(activeTab.url)
      if (webScrapingResult) {
        // Use all data from web scraping for consistency and reliability
        const baseTitle = webScrapingResult.title
        // Format title with duration if available
        const title = webScrapingResult.duration
          ? `${baseTitle} [${webScrapingResult.duration}]`
          : baseTitle
        const channelName = webScrapingResult.channelName
        const channelUrl = webScrapingResult.channelUrl
        const description = webScrapingResult.description

        // Include duration in result if available
        const result = {
          title: decodeHTMLEntities(title.trim()),
          channelName: channelName,
          channelUrl: channelUrl,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          videoId: videoId,
          description: description,
          duration: webScrapingResult.duration,
        }

        return result
      }
    } catch {
      // Web scraping failed, continue to fallback
    }

    // Final fallback result (only reached if web scraping failed)
    const fallbackTitle = activeTab.title || 'YouTube Video'
    const result = {
      title: decodeHTMLEntities(fallbackTitle.trim()),
      channelName: 'Unknown Channel',
      channelUrl: 'https://www.youtube.com',
      url: `https://www.youtube.com/watch?v=${videoId}`,
      videoId: videoId,
      description: 'Description not available',
      duration: undefined, // No duration available in fallback mode
    }

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
function validateTranscriptQuality(transcript: string): boolean {
  if (!transcript || transcript.trim().length === 0) {
    return false
  }

  // Check if transcript is too short (likely incomplete)
  const minLength = 50 // Minimum 50 characters for a meaningful transcript
  if (transcript.trim().length < minLength) {
    return false
  }

  // Check if transcript contains meaningful words (not just punctuation/numbers)
  const wordCount = transcript
    .trim()
    .split(/\s+/)
    .filter((word) => /[a-zA-Z]/.test(word)).length
  if (wordCount < 10) {
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
      return false
    }
  }

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
        const { offset, text } = segment
        const currentTime = Math.floor(offset)

        if (lastTime !== -1 && currentTime - lastTime > paragraphBreakThreshold) {
          // Use a consistent paragraph separator that we can easily handle later
          formattedTranscript += ' [PARAGRAPH_BREAK] '
        } else if (formattedTranscript) {
          formattedTranscript += ' '
        }

        // Add the text - strip any hashtags and clean up
        const cleanedText = decodeHTMLEntities(text)
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
      if (!validateTranscriptQuality(finalTranscript)) {
        throw new Error(
          'Transcript quality validation failed - transcript may be incomplete or invalid',
        )
      }

      return finalTranscript
    } catch (error) {
      const isLastAttempt = attempt === maxRetries - 1
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

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
      const options = lang ? { lang } : {}
      const transcriptData = await YoutubeTranscript.fetchTranscript(videoId, options)

      if (transcriptData && transcriptData.length > 0) {
        // Process the transcript data with the same clean formatting as the main function
        let formattedTranscript = ''
        let lastTime = -1
        const paragraphBreakThreshold = 10 // Consistent with main function

        for (const segment of transcriptData) {
          const { offset, text } = segment
          const currentTime = Math.floor(offset)

          if (lastTime !== -1 && currentTime - lastTime > paragraphBreakThreshold) {
            formattedTranscript += ' [PARAGRAPH_BREAK] '
          } else if (formattedTranscript) {
            formattedTranscript += ' '
          }

          const cleanedText = decodeHTMLEntities(text)
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
          return result
        }
      }
    } catch {
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

/**
 * Format duration from seconds to human-readable format (MM:SS or HH:MM:SS)
 * @param seconds Duration in seconds
 * @returns Formatted duration string
 */
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
  } else {
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }
}

// Main command entry point
export default async function Command() {
  try {
    // Show improved HUD to indicate processing has started
    await showToast({
      style: Toast.Style.Animated,
      title: 'Processing YouTube Video...',
      message: 'Extracting metadata & transcript → Converting to Tana → Opening Tana',
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
    } catch (transcriptError) {
      try {
        // Fallback to language-specific extraction
        const transcript = await extractTranscriptWithLanguageFallbacks(videoInfo.videoId)
        videoInfo.transcript = transcript
        transcriptSuccess = true
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
 * Extract video title from HTML content
 * @param html HTML content from YouTube page
 * @returns Extracted and cleaned title
 */
function extractTitleFromHtml(html: string): string {
  const titlePatterns = [
    /"title":"([^"]+)"/,
    /"videoDetails":[^}]*"title":"([^"]+)"/,
    /<title>([^<]+)<\/title>/,
    /"headline":"([^"]+)"/,
    /"name":"([^"]+)","description"/,
  ]

  for (const pattern of titlePatterns) {
    const match = html.match(pattern)
    if (match) {
      const [, extractedTitle] = match
      if (extractedTitle) {
        const cleanedTitle = cleanExtractedText(extractedTitle)
          .replace(/ - YouTube$/, '')
          .replace(/^\(\d+\)\s*/, '') // Remove notification count

        if (cleanedTitle && cleanedTitle.length > 0 && cleanedTitle.length < 300) {
          return cleanedTitle
        }
      }
    }
  }

  return 'YouTube Video'
}

/**
 * Extract channel information from HTML content
 * @param html HTML content from YouTube page
 * @returns Object containing channel name and URL
 */
function extractChannelFromHtml(html: string): { name: string; url: string } {
  const channelNamePatterns = [
    /"ownerChannelName":"([^"]+)"/,
    /"author":"([^"]+)"/,
    /"channelName":"([^"]+)"/,
    /,"name":"([^"]+)","url":"[^"]*\/@[^"]+"/,
    /,"name":"([^"]+)","url":"[^"]*\/channel\/[^"]+"/,
  ]

  const channelUrlPatterns = [
    /"ownerChannelName":"[^"]+","channelId":"([^"]+)"/,
    /"externalChannelId":"([^"]+)"/,
    /,"canonicalChannelUrl":"([^"]+)"/,
    /href="(\/channel\/[^"]+)"/,
    /href="(\/@[^"]+)"/,
  ]

  let channelName = 'Unknown Channel'
  let channelUrl = 'https://www.youtube.com'

  // Extract channel name
  for (const pattern of channelNamePatterns) {
    const match = html.match(pattern)
    if (match) {
      const [, extractedName] = match
      if (extractedName) {
        const cleanedName = cleanExtractedText(extractedName)

        if (cleanedName && cleanedName.length > 0 && cleanedName.length < 100) {
          channelName = cleanedName
          break
        }
      }
    }
  }

  // Extract channel URL
  for (const pattern of channelUrlPatterns) {
    const match = html.match(pattern)
    if (match) {
      const [, extractedUrl] = match
      if (extractedUrl) {
        let cleanedUrl = extractedUrl.trim()

        // Handle different URL formats
        if (cleanedUrl.startsWith('/channel/') || cleanedUrl.startsWith('/@')) {
          cleanedUrl = `https://www.youtube.com${cleanedUrl}`
        } else if (cleanedUrl.startsWith('UC') && cleanedUrl.length === 24) {
          // This is a channel ID
          cleanedUrl = `https://www.youtube.com/channel/${cleanedUrl}`
        } else if (!cleanedUrl.startsWith('http')) {
          continue // Skip invalid URLs
        }

        channelUrl = cleanedUrl
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
      if (match) {
        const [, handle] = match
        if (handle) {
          channelName = `@${handle}`
          channelUrl = `https://www.youtube.com/@${handle}`
          break
        }
      }
    }
  }

  return { name: channelName, url: channelUrl }
}

/**
 * Extract video description from HTML content
 * @param html HTML content from YouTube page
 * @returns Extracted and cleaned description
 */
function extractDescriptionFromHtml(html: string): string {
  const descriptionPatterns = [
    /"description":"([^"]+)"/,
    /"shortDescription":"([^"]+)"/,
    /"attributedDescription":{"content":"([^"]+)"/,
    /"videoDetails":[^}]*"shortDescription":"([^"]+)"/,
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
 * Extract video duration from HTML content
 * @param html HTML content from YouTube page
 * @returns Formatted duration string or undefined if not found
 */
function extractDurationFromHtml(html: string): string | undefined {
  const durationPatterns = [
    /"lengthSeconds":"(\d+)"/,
    /"videoDetails":[^}]*"lengthSeconds":"(\d+)"/,
    /<meta property="video:duration" content="(\d+)"/,
    /"duration":"PT(\d+)S"/,
    /"duration":"PT(\d+M\d+S)"/,
    /"duration":"PT(\d+H\d+M\d+S)"/,
  ]

  for (const pattern of durationPatterns) {
    const match = html.match(pattern)
    if (match) {
      const [, durationValue] = match
      if (durationValue) {
        // Handle different duration formats
        if (/^\d+$/.test(durationValue)) {
          // Duration in seconds
          const seconds = parseInt(durationValue, 10)
          if (seconds > 0 && seconds < 86400) {
            // Reasonable range (0-24 hours)
            return formatDuration(seconds)
          }
        } else if (/^\d+M\d+S$/.test(durationValue)) {
          // Format like "5M30S"
          const minutesMatch = durationValue.match(/(\d+)M/)
          const secondsMatch = durationValue.match(/(\d+)S/)
          if (minutesMatch && secondsMatch) {
            const [, minutes] = minutesMatch
            const [, seconds] = secondsMatch
            const totalSeconds = parseInt(minutes, 10) * 60 + parseInt(seconds, 10)
            return formatDuration(totalSeconds)
          }
        } else if (/^\d+H\d+M\d+S$/.test(durationValue)) {
          // Format like "1H5M30S"
          const hoursMatch = durationValue.match(/(\d+)H/)
          const minutesMatch = durationValue.match(/(\d+)M/)
          const secondsMatch = durationValue.match(/(\d+)S/)
          if (hoursMatch && minutesMatch && secondsMatch) {
            const [, hours] = hoursMatch
            const [, minutes] = minutesMatch
            const [, seconds] = secondsMatch
            const totalSeconds =
              parseInt(hours, 10) * 3600 + parseInt(minutes, 10) * 60 + parseInt(seconds, 10)
            return formatDuration(totalSeconds)
          }
        }
      }
    }
  }

  return undefined
}

async function extractChannelViaWebScraping(videoUrl: string): Promise<{
  title: string
  channelName: string
  channelUrl: string
  description: string
  duration?: string
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
        videoUrl, // URL as argument (not interpolated into shell command)
      ],
      {
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer to handle large pages
        timeout: 30000, // 30 second timeout
      },
    )
    const html = htmlResult.stdout

    if (!html || html.length < 1000) {
      throw new Error('Failed to fetch page HTML or content too short')
    }

    // Extract video information using helper functions
    const title = extractTitleFromHtml(html)
    const { name: channelName, url: channelUrl } = extractChannelFromHtml(html)
    const description = extractDescriptionFromHtml(html)
    const duration = extractDurationFromHtml(html)

    // Return all extracted data
    return {
      title,
      channelName,
      channelUrl,
      description,
      duration,
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
  // Check for browser support issues first (more specific than generic YouTube errors)
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
    errorMessage.includes('No YouTube tab found') ||
    errorMessage.includes('No active YouTube video found')
  ) {
    await showToast({
      style: Toast.Style.Failure,
      title: '📹 No YouTube Video Found',
      message: "Open a YouTube video in Chrome, Arc, or Safari and make sure it's the active tab",
    })
  } else if (errorMessage.includes('Could not extract video ID')) {
    await showToast({
      style: Toast.Style.Failure,
      title: '🔗 Invalid YouTube URL',
      message: "Make sure you're on a YouTube video page (youtube.com/watch?v=...)",
    })
  } else if (
    errorMessage.includes('No transcript available') ||
    errorMessage.includes('Transcript is disabled')
  ) {
    await showToast({
      style: Toast.Style.Failure,
      title: '📄 No Transcript Available',
      message: "This video doesn't have captions/transcripts available",
    })
  } else if (errorMessage.includes('frontmost browser window')) {
    await showToast({
      style: Toast.Style.Failure,
      title: '🖥️ Supported Browser Not Active',
      message: 'Make sure Chrome, Arc, or Safari is the frontmost window with a YouTube video open',
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
