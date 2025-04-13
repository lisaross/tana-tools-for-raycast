import { Clipboard, showHUD, BrowserExtension, Toast, showToast } from '@raycast/api'
import { convertToTana } from './utils/tana-converter'

interface VideoInfo {
  title: string
  channelName: string
  channelUrl: string
  url: string
  description: string
}

/**
 * Extracts video information from the current YouTube page
 */
async function extractVideoInfo(): Promise<VideoInfo> {
  try {
    // Get the current tab
    const tabs = await BrowserExtension.getTabs()

    if (!tabs || tabs.length === 0) {
      throw new Error(
        'Could not access browser tabs. Please ensure Raycast has permission to access your browser.'
      )
    }

    // Find active tabs
    const activeTabs = tabs.filter((tab) => tab.active)

    if (activeTabs.length === 0) {
      throw new Error(
        'No active browser tab found. Please make sure you have a browser window open and active.'
      )
    }

    // Look for a YouTube tab
    const youtubeTab = activeTabs.find((tab) => tab.url?.includes('youtube.com/watch'))

    if (!youtubeTab) {
      throw new Error(
        'No YouTube video page found. Please make sure you have a YouTube video page open and active in your browser.'
      )
    }

    const url = youtubeTab.url

    // Extract title
    const title = await BrowserExtension.getContent({
      cssSelector: 'h1.ytd-video-primary-info-renderer',
      format: 'text',
    })

    if (!title) {
      throw new Error(
        'Could not find video title. Please make sure the video page is fully loaded.'
      )
    }

    // Extract channel name and URL
    const channelElement = await BrowserExtension.getContent({
      cssSelector: '#channel-name yt-formatted-string a',
      format: 'html',
    })

    if (!channelElement) {
      throw new Error(
        'Could not find channel information. Please make sure the video page is fully loaded.'
      )
    }

    // Extract channel name and URL using string manipulation
    const hrefMatch = channelElement.match(/href="([^"]+)"/)
    const textMatch = channelElement.match(/<a[^>]*>([^<]+)<\/a>/)

    if (!hrefMatch || !textMatch) {
      throw new Error('Could not parse channel information.')
    }

    const channelUrl = hrefMatch[1]
    const channelName = textMatch[1].trim()

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
      })
      if (description) {
        break
      }
    }

    if (!description) {
      throw new Error(
        'Could not find video description. Please make sure the video page is fully loaded and the description is visible.'
      )
    }

    // Clean up the description
    const cleanedDescription = description
      .replace(/Show more$/, '') // Remove "Show more" text if present
      .replace(/Show less$/, '') // Remove "Show less" text if present
      .replace(/^\s*\.{3}\s*/, '') // Remove leading ellipsis
      .replace(/\s*\.{3}$/, '') // Remove trailing ellipsis
      .replace(/^\s*Show more\s*\n?/, '') // Remove "Show more" at start
      .replace(/\n?\s*Show less\s*$/, '') // Remove "Show less" at end
      .replace(/^\s+|\s+$/g, '') // Trim whitespace from start and end
      .trim()

    // Return complete VideoInfo
    return {
      title: title.trim(),
      channelName: channelName,
      channelUrl: fullChannelUrl,
      url: url,
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
 * Formats YouTube video information for Tana in Markdown format
 * that can be processed by our existing Tana converter
 */
function formatForTanaMarkdown(videoInfo: VideoInfo): string {
  // Create a Markdown representation that our tana-converter can process
  let markdown = `# ${videoInfo.title} #video\n`
  markdown += `URL::${videoInfo.url}\n`
  markdown += `Channel URL::${videoInfo.channelUrl}\n`
  markdown += `Author::${videoInfo.channelName}\n`
  markdown += `Description::${videoInfo.description.split('\n\n')[0] || 'No description available'}\n`

  // Add additional description paragraphs as separate nodes
  const descriptionParagraphs = videoInfo.description.split('\n\n').slice(1)
  for (const paragraph of descriptionParagraphs) {
    if (paragraph.trim()) {
      markdown += `\n${paragraph.trim()}`
    }
  }

  return markdown
}

export default async function Command() {
  try {
    // Extract YouTube video information
    const videoInfo = await extractVideoInfo()

    // Format the information for Tana using Markdown as an intermediate format
    const markdownFormat = formatForTanaMarkdown(videoInfo)

    // Use our existing Tana converter to process the Markdown
    const tanaFormat = convertToTana(markdownFormat)

    // Copy to clipboard
    await Clipboard.copy(tanaFormat)

    await showHUD('YouTube video info copied to clipboard in Tana format')
  } catch (error) {
    console.error(error)
    await showHUD(
      `Error: ${error instanceof Error ? error.message : 'Failed to process YouTube video'}`
    )
  }
}
