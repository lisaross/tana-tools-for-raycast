import { Clipboard, showHUD, BrowserExtension, Toast, showToast } from '@raycast/api'
import { convertToTana } from './utils/tana-converter'
import { YoutubeTranscript } from 'youtube-transcript'

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
 * Extracts video information from the active YouTube tab
 */
async function extractVideoInfo(): Promise<VideoInfo> {
  try {
    // Get the active tab
    const tabs = await BrowserExtension.getTabs()

    if (!tabs || tabs.length === 0) {
      throw new Error(
        'Could not access browser tabs. Please ensure Raycast has permission to access your browser.',
      )
    }

    // Find the active YouTube tab
    const activeTab = tabs.find((tab) => tab.active && tab.url?.includes('youtube.com/watch'))

    if (!activeTab) {
      throw new Error(
        'No active YouTube video tab found. Please open a YouTube video and try again.',
      )
    }

    // Extract the video ID from URL
    const urlObj = new URL(activeTab.url)
    const videoId = urlObj.searchParams.get('v')

    if (!videoId) {
      throw new Error('Could not extract video ID from the URL.')
    }

    // Extract title directly from the tab
    const title = await BrowserExtension.getContent({
      cssSelector: 'h1.ytd-video-primary-info-renderer',
      format: 'text',
      tabId: activeTab.id,
    })

    if (!title) {
      throw new Error(
        'Could not find video title. Please make sure the video page is fully loaded.',
      )
    }

    // Extract channel name and URL
    const channelElement = await BrowserExtension.getContent({
      cssSelector: '#channel-name yt-formatted-string a',
      format: 'html',
      tabId: activeTab.id,
    })

    if (!channelElement) {
      throw new Error(
        'Could not find channel information. Please make sure the video page is fully loaded.',
      )
    }

    // Extract channel name and URL using string manipulation
    const hrefMatch = channelElement.match(/href="([^"]+)"/)
    const textMatch = channelElement.match(/<a[^>]*>([^<]+)<\/a>/)

    if (!hrefMatch || !textMatch) {
      throw new Error('Could not parse channel information.')
    }

    const [, channelUrl] = hrefMatch
    const [, rawChannelName] = textMatch
    const channelName = decodeHTMLEntities(rawChannelName.trim())

    // Format the channel URL
    const fullChannelUrl = channelUrl.startsWith('http')
      ? channelUrl
      : `https://www.youtube.com${channelUrl}`

    // Extract description - try multiple selectors for expanded content
    const descriptionSelectors = [
      'ytd-text-inline-expander yt-attributed-string',
      'ytd-text-inline-expander yt-formatted-string',
      'ytd-text-inline-expander #snippet-text',
      'ytd-text-inline-expander #plain-snippet-text',
    ]

    let description = ''

    for (const selector of descriptionSelectors) {
      description = await BrowserExtension.getContent({
        cssSelector: selector,
        format: 'text',
        tabId: activeTab.id,
      })
      if (description) {
        break
      }
    }

    if (!description) {
      throw new Error(
        'Could not find video description. Please make sure the video page is fully loaded and the description is visible.',
      )
    }

    // Clean up the description
    const cleanedDescription = decodeHTMLEntities(
      description
        .replace(/Show more$/, '') // Remove "Show more" text if present
        .replace(/Show less$/, '') // Remove "Show less" text if present
        .replace(/^\s*\.{3}\s*/, '') // Remove leading ellipsis
        .replace(/\s*\.{3}$/, '') // Remove trailing ellipsis
        .replace(/^\s*Show more\s*\n?/, '') // Remove "Show more" at start
        .replace(/\n?\s*Show less\s*$/, '') // Remove "Show less" at end
        .replace(/^\s+|\s+$/g, '') // Trim whitespace from start and end
        .trim(),
    )

    // Return complete VideoInfo
    return {
      title: decodeHTMLEntities(title.trim()),
      channelName: channelName,
      channelUrl: fullChannelUrl,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      videoId: videoId,
      description: cleanedDescription,
    }
  } catch (error) {
    // Show a persistent error toast with more details
    await showToast({
      style: Toast.Style.Failure,
      title: 'Failed to extract video information',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
    })
    throw error
  }
}

/**
 * Extracts the transcript from a YouTube video
 */
async function extractTranscript(videoId: string): Promise<string> {
  try {
    // Fetch transcript using the youtube-transcript library
    const transcriptData = await YoutubeTranscript.fetchTranscript(videoId)

    if (!transcriptData || transcriptData.length === 0) {
      throw new Error('No transcript available for this video')
    }

    // Format the transcript segments - without timestamps
    let formattedTranscript = ''
    let lastTime = -1
    const paragraphBreakThreshold = 6 // seconds between segments to create a paragraph break

    for (const segment of transcriptData) {
      // Check if we need a paragraph break (if there's a significant time gap)
      const currentTime = Math.floor(segment.offset / 1000)

      if (lastTime !== -1 && currentTime - lastTime > paragraphBreakThreshold) {
        formattedTranscript += '\n\n'
      } else if (formattedTranscript) {
        formattedTranscript += ' '
      }

      // Add the text - strip any hashtags
      const cleanedText = decodeHTMLEntities(segment.text)
        .replace(/#\w+\b/g, '')
        .trim()
      if (cleanedText) {
        formattedTranscript += cleanedText
      }
      lastTime = currentTime
    }

    return formattedTranscript.trim()
  } catch (error) {
    console.error('Transcript extraction error:', error)
    throw new Error(
      `Could not extract transcript: ${error instanceof Error ? error.message : 'Unknown error'}`,
    )
  }
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
  if (videoInfo.transcript) {
    markdown += `Transcript::${videoInfo.transcript.replace(/\n\n/g, ' ')}\n`
  }

  // Split description into paragraphs and use destructuring
  const [firstParagraph = 'No description available', ...additionalParagraphs] =
    videoInfo.description.split('\n\n')

  markdown += `\nDescription::${firstParagraph}\n`

  // Add additional description paragraphs as separate nodes
  for (const paragraph of additionalParagraphs) {
    if (paragraph.trim()) {
      markdown += `\n${paragraph.trim()}`
    }
  }

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

    try {
      // Try to extract transcript
      const transcript = await extractTranscript(videoInfo.videoId)
      videoInfo.transcript = transcript
    } catch (transcriptError) {
      // Show a toast but continue
      await showToast({
        style: Toast.Style.Failure,
        title: 'Transcript Extraction Failed',
        message: transcriptError instanceof Error ? transcriptError.message : 'Unknown error',
      })
    }

    // Format and copy to clipboard
    const markdownFormat = formatForTanaMarkdown(videoInfo)
    const tanaFormat = convertToTana(markdownFormat)
    await Clipboard.copy(tanaFormat)

    const successMessage = videoInfo.transcript
      ? 'YouTube video info and transcript copied to clipboard in Tana format'
      : 'YouTube video info copied to clipboard in Tana format (no transcript available)'

    await showHUD(successMessage)
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: 'Processing Failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}
