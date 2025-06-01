import { Clipboard, showHUD, BrowserExtension, Toast, showToast } from '@raycast/api'
import { convertToTana } from './utils/tana-converter'
import { YoutubeTranscript } from 'youtube-transcript'
import { exec, execFile } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)
const execFileAsync = promisify(execFile)

/**
 * YouTube to Tana Converter with Reliable Web Scraping
 *
 * This module extracts YouTube video metadata and transcripts, converting them
 * to Tana Paste format. It uses a streamlined approach with curl-based web scraping
 * for maximum reliability and compatibility across all browsers and systems.
 *
 * Core Features:
 * - Direct HTML parsing via curl for all video metadata (title, channel, description)
 * - YouTube Transcript API for transcript extraction with retry logic
 * - AppleScript integration for URL detection from frontmost browser
 * - Robust error handling with graceful degradation
 * - Clean conversion to Tana Paste format
 *
 * Technical Approach:
 * - Primary: curl + regex parsing of YouTube's embedded JSON metadata
 * - Fallback: Browser tab information when web scraping fails
 * - Universal compatibility: Works regardless of browser or extension support
 * - Single extraction path: Eliminates complexity and maintenance overhead
 *
 * Browser Support:
 * - Universal: Works with any browser (Chrome, Firefox, Safari, Arc, Zen, etc.)
 * - No browser extensions required for core functionality
 * - Respects frontmost browser via AppleScript integration
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
 * Safely escape strings for AppleScript to prevent injection
 * @param str String to escape
 * @returns Escaped string safe for AppleScript
 */
function escapeForAppleScript(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

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

/**
 * Get YouTube URL from frontmost browser window using AppleScript (fallback for unsupported browsers)
 * @returns Object containing URL and optional title, or null if extraction fails
 */
async function getYouTubeUrlFromAppleScript(): Promise<{ url: string; title?: string } | null> {
  try {
    // First, let's get the frontmost app and ensure we ONLY work with it
    const frontAppResult = await execAsync(
      `osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`,
    )
    const frontApp = frontAppResult.stdout.trim()
    console.log(`🎯 Frontmost application detected: "${frontApp}"`)

    // STRICT CHECK: Only proceed if the frontmost app is a browser we want to work with
    const isSupportedBrowser =
      frontApp.toLowerCase().includes('zen') ||
      frontApp.toLowerCase().includes('firefox') ||
      frontApp.toLowerCase().includes('chrome') ||
      frontApp.toLowerCase().includes('safari') ||
      frontApp.toLowerCase().includes('arc')

    if (!isSupportedBrowser) {
      console.log(
        `❌ Frontmost app "${frontApp}" is not a supported browser, skipping AppleScript method`,
      )
      return null
    }

    console.log(`✅ Working with frontmost browser: ${frontApp}`)

    try {
      await execAsync(
        `osascript -e 'tell application "System Events" to tell process "${escapeForAppleScript(frontApp)}" to keystroke "c" using {command down, shift down}'`,
      )
      await new Promise((resolve) => setTimeout(resolve, 500))

      const urlResult = await execAsync(`osascript -e 'get the clipboard as string'`)
      const clipboardUrl = urlResult.stdout.trim()

      if (clipboardUrl && clipboardUrl.includes('youtube.com/watch')) {
        console.log('✅ Successfully got YouTube URL via cmd+shift+c')
        return { url: clipboardUrl }
      }
    } catch (error) {
      console.log('❌ Failed to get URL via cmd+shift+c:', error)
    }

    // Fallback: Try selecting address bar and copying (cmd+l, cmd+c)
    try {
      await execAsync(
        `osascript -e 'tell application "System Events" to tell process "${escapeForAppleScript(frontApp)}" to keystroke "l" using command down'`,
      )
      await new Promise((resolve) => setTimeout(resolve, 500))

      await execAsync(
        `osascript -e 'tell application "System Events" to tell process "${escapeForAppleScript(frontApp)}" to keystroke "c" using command down'`,
      )
      await new Promise((resolve) => setTimeout(resolve, 500))

      const urlResult = await execAsync(`osascript -e 'get the clipboard as string'`)
      const clipboardUrl = urlResult.stdout.trim()

      if (clipboardUrl && clipboardUrl.includes('youtube.com/watch')) {
        console.log('✅ Successfully got YouTube URL via address bar')
        return { url: clipboardUrl }
      }
    } catch (error) {
      console.log('❌ Failed to get URL via address bar:', error)
    }

    return null
  } catch (error) {
    console.log('❌ AppleScript fallback failed:', error instanceof Error ? error.message : error)
    return null
  }
}

/**
 * Get frontmost YouTube tab using unified approach for all browsers
 * @returns Object containing URL and tab ID, or null if no YouTube tab found
 */
async function getFrontmostYouTubeTab(): Promise<TabInfo | null> {
  // PRIORITY 1: Use AppleScript first - this respects the frontmost browser
  try {
    console.log('🎯 Checking frontmost browser first via AppleScript...')
    const appleScriptResult = await getYouTubeUrlFromAppleScript()
    if (appleScriptResult) {
      console.log('✅ Got YouTube URL from frontmost browser via AppleScript')
      // Try to get the corresponding tab ID for browser extension access
      try {
        const tabs = await BrowserExtension.getTabs()
        const matchingTab = tabs.find(
          (tab) => tab.url === appleScriptResult.url && tab.url?.includes('youtube.com/watch'),
        )

        if (matchingTab?.id) {
          console.log('✅ Found matching tab with browser extension access')
          return {
            url: matchingTab.url,
            tabId: matchingTab.id,
            title: matchingTab.title || appleScriptResult.title,
          }
        }
      } catch (tabError) {
        console.log('⚠️ Could not get tab ID for browser extension access:', tabError)
      }

      // Return AppleScript result even without tab ID
      return {
        url: appleScriptResult.url,
        title: appleScriptResult.title,
      }
    }
  } catch (error) {
    console.log('⚠️ AppleScript method failed, trying browser extension fallback:', error)
  }

  // PRIORITY 2: Fallback to browser extension API (may not respect frontmost browser)
  try {
    console.log('🔄 Fallback: Checking browser extension tabs...')
    const tabs = await BrowserExtension.getTabs()
    const activeTab = tabs.find((tab) => tab.active && tab.url?.includes('youtube.com/watch'))

    if (activeTab?.id && activeTab.url) {
      console.log(
        '⚠️ Found active YouTube tab via browser extension (may be from background browser)',
      )
      return {
        url: activeTab.url,
        tabId: activeTab.id,
        title: activeTab.title,
      }
    }
  } catch (error) {
    console.log('❌ Browser extension method also failed:', error)
  }

  console.log('❌ No YouTube tab found in frontmost browser')
  return null
}

/**
 * Extracts video information from the active YouTube tab
 */
async function extractVideoInfo(): Promise<VideoInfo> {
  try {
    console.log('🔍 Starting video info extraction...')

    // Get the frontmost YouTube tab with better selection logic
    const activeTab = await getFrontmostYouTubeTab()

    if (!activeTab) {
      throw new Error(
        'No YouTube tab found. Please ensure you have a YouTube video open in the frontmost browser window.',
      )
    }

    // Extract the video ID from URL
    const urlObj = new URL(activeTab.url)
    const videoId = urlObj.searchParams.get('v')
    console.log(`🆔 Video ID extracted: ${videoId}`)

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

        console.log(`✅ Web scraping successful: "${title}" by "${channelName}" -> ${channelUrl}`)

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

        console.log('✅ Video info extraction completed successfully:', {
          title: result.title.substring(0, 50) + '...',
          channel: result.channelName,
          videoId: result.videoId,
          duration: result.duration,
          descriptionLength: result.description.length,
        })

        return result
      }
    } catch (error) {
      console.log('⚠️ Web scraping error:', error)
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

    console.log('⚠️ Using fallback video info (no duration available):', {
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

// Helper function to extract all video metadata via secure web scraping
async function extractChannelViaWebScraping(videoUrl: string): Promise<{
  title: string
  channelName: string
  channelUrl: string
  description: string
  duration?: string
} | null> {
  try {
    console.log('🌐 Attempting direct web scraping for all video metadata...')

    // Use execFile instead of shell execution to prevent command injection
    // Pass arguments separately instead of interpolating into command string
    const userAgent =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

    console.log('📡 Fetching YouTube page HTML...')
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

    console.log(`✅ Fetched HTML content (${html.length} characters)`)

    // Extract video information using regex patterns
    // YouTube embeds JSON data in the HTML that contains structured video info

    // Pattern 1: Look for video title
    const titlePatterns = [
      /"title":"([^"]+)"/,
      /"videoDetails":[^}]*"title":"([^"]+)"/,
      /<title>([^<]+)<\/title>/,
      /"headline":"([^"]+)"/,
      /"name":"([^"]+)","description"/,
    ]

    // Pattern 2: Look for channel name in video metadata
    const channelNamePatterns = [
      /"ownerChannelName":"([^"]+)"/,
      /"author":"([^"]+)"/,
      /"channelName":"([^"]+)"/,
      /,"name":"([^"]+)","url":"[^"]*\/@[^"]+"/,
      /,"name":"([^"]+)","url":"[^"]*\/channel\/[^"]+"/,
    ]

    // Pattern 3: Look for channel URL/ID
    const channelUrlPatterns = [
      /"ownerChannelName":"[^"]+","channelId":"([^"]+)"/,
      /"externalChannelId":"([^"]+)"/,
      /,"canonicalChannelUrl":"([^"]+)"/,
      /href="(\/channel\/[^"]+)"/,
      /href="(\/@[^"]+)"/,
    ]

    // Pattern 4: Look for video description
    const descriptionPatterns = [
      /"description":"([^"]+)"/,
      /"shortDescription":"([^"]+)"/,
      /"attributedDescription":{"content":"([^"]+)"/,
      /"videoDetails":[^}]*"shortDescription":"([^"]+)"/,
    ]

    // Pattern 5: Look for video duration
    const durationPatterns = [
      /"lengthSeconds":"(\d+)"/,
      /"videoDetails":[^}]*"lengthSeconds":"(\d+)"/,
      /<meta property="video:duration" content="(\d+)"/,
      /"duration":"PT(\d+)S"/,
      /"duration":"PT(\d+M\d+S)"/,
      /"duration":"PT(\d+H\d+M\d+S)"/,
    ]

    let title = 'YouTube Video'
    let channelName = 'Unknown Channel'
    let channelUrl = 'https://www.youtube.com'
    let description = 'Description not available'
    let duration: string | undefined

    // Extract title
    for (const pattern of titlePatterns) {
      const match = html.match(pattern)
      if (match && match[1]) {
        const extractedTitle = match[1]
          .replace(/\\u0026/g, '&')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\')
          .replace(/\\n/g, ' ')
          .replace(/\\t/g, ' ')
          .replace(/ - YouTube$/, '')
          .replace(/^\(\d+\)\s*/, '') // Remove notification count
          .trim()

        if (extractedTitle && extractedTitle.length > 0 && extractedTitle.length < 200) {
          title = extractedTitle
          console.log(`🎯 Found title via pattern: "${title}"`)
          break
        }
      }
    }

    // Extract duration
    for (const pattern of durationPatterns) {
      const match = html.match(pattern)
      if (match && match[1]) {
        const durationValue = match[1]

        // Handle different duration formats
        if (/^\d+$/.test(durationValue)) {
          // Duration in seconds
          const seconds = parseInt(durationValue, 10)
          if (seconds > 0 && seconds < 86400) {
            // Reasonable range (0-24 hours)
            duration = formatDuration(seconds)
            console.log(`⏱️ Found duration: ${duration} (${seconds} seconds)`)
            break
          }
        } else if (/^\d+M\d+S$/.test(durationValue)) {
          // Format like "5M30S"
          const minutesMatch = durationValue.match(/(\d+)M/)
          const secondsMatch = durationValue.match(/(\d+)S/)
          if (minutesMatch && secondsMatch) {
            const totalSeconds = parseInt(minutesMatch[1], 10) * 60 + parseInt(secondsMatch[1], 10)
            duration = formatDuration(totalSeconds)
            console.log(`⏱️ Found duration: ${duration}`)
            break
          }
        } else if (/^\d+H\d+M\d+S$/.test(durationValue)) {
          // Format like "1H5M30S"
          const hoursMatch = durationValue.match(/(\d+)H/)
          const minutesMatch = durationValue.match(/(\d+)M/)
          const secondsMatch = durationValue.match(/(\d+)S/)
          if (hoursMatch && minutesMatch && secondsMatch) {
            const totalSeconds =
              parseInt(hoursMatch[1], 10) * 3600 +
              parseInt(minutesMatch[1], 10) * 60 +
              parseInt(secondsMatch[1], 10)
            duration = formatDuration(totalSeconds)
            console.log(`⏱️ Found duration: ${duration}`)
            break
          }
        }
      }
    }

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

        if (
          extractedDescription &&
          extractedDescription.length > 10 &&
          extractedDescription.length < 5000
        ) {
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

    // Return all extracted data
    const result = {
      title,
      channelName,
      channelUrl,
      description,
      duration,
    }

    console.log(
      `✅ Successfully extracted via web scraping: "${title}" by "${channelName}" -> ${channelUrl}`,
    )
    return result
  } catch (error) {
    console.log('❌ Web scraping failed:', error instanceof Error ? error.message : error)
    return null
  }
}
