import { showHUD, showToast, Toast, BrowserExtension, getPreferenceValues } from '@raycast/api'
import { convertToTana, sendToTanaInbox } from './utils/tana-converter'
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

function decodeHTMLEntities(text: string): string {
  const entities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&nbsp;': ' ',
  }
  let decoded = text
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.replace(new RegExp(entity, 'g'), char)
  }
  decoded = decoded.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
  return decoded
}

async function extractVideoInfo(): Promise<VideoInfo> {
  try {
    const tabs = await BrowserExtension.getTabs()
    if (!tabs || tabs.length === 0) {
      throw new Error('Could not access browser tabs. Please ensure Raycast has permission to access your browser.')
    }
    const activeTab = tabs.find((tab) => tab.active && tab.url?.includes('youtube.com/watch'))
    if (!activeTab) {
      throw new Error('No active YouTube video tab found. Please open a YouTube video and try again.')
    }
    const urlObj = new URL(activeTab.url)
    const videoId = urlObj.searchParams.get('v')
    if (!videoId) {
      throw new Error('Could not extract video ID from the URL.')
    }
    const title = await BrowserExtension.getContent({
      cssSelector: 'h1.ytd-video-primary-info-renderer',
      format: 'text',
      tabId: activeTab.id,
    })
    if (!title) {
      throw new Error('Could not find video title. Please make sure the video page is fully loaded.')
    }
    const channelElement = await BrowserExtension.getContent({
      cssSelector: '#channel-name yt-formatted-string a',
      format: 'html',
      tabId: activeTab.id,
    })
    if (!channelElement) {
      throw new Error('Could not find channel information. Please make sure the video page is fully loaded.')
    }
    const hrefMatch = channelElement.match(/href="([^"]+)"/)
    const textMatch = channelElement.match(/<a[^>]*>([^<]+)<\/a>/)
    if (!hrefMatch || !textMatch) {
      throw new Error('Could not parse channel information.')
    }
    const channelUrl = hrefMatch[1]
    const channelName = decodeHTMLEntities(textMatch[1].trim())
    const fullChannelUrl = channelUrl.startsWith('http')
      ? channelUrl
      : `https://www.youtube.com${channelUrl}`
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
      throw new Error('Could not find video description. Please make sure the video page is fully loaded and the description is visible.')
    }
    const cleanedDescription = decodeHTMLEntities(
      description
        .replace(/Show more$/, '')
        .replace(/Show less$/, '')
        .replace(/^\s*\.{3}\s*/, '')
        .replace(/\s*\.{3}$/, '')
        .replace(/^\s*Show more\s*\n?/, '')
        .replace(/\n?\s*Show less\s*$/, '')
        .replace(/^\s+|\s+$/g, '')
        .trim()
    )
    return {
      title: decodeHTMLEntities(title.trim()),
      channelName: channelName,
      channelUrl: fullChannelUrl,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      videoId: videoId,
      description: cleanedDescription,
    }
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: 'Failed to extract video information',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
    })
    throw error
  }
}

async function extractTranscript(videoId: string): Promise<string> {
  try {
    const transcriptData = await YoutubeTranscript.fetchTranscript(videoId)
    if (!transcriptData || transcriptData.length === 0) {
      throw new Error('No transcript available for this video')
    }
    let formattedTranscript = ''
    let lastTime = -1
    const paragraphBreakThreshold = 6
    for (const segment of transcriptData) {
      const currentTime = Math.floor(segment.offset / 1000)
      if (lastTime !== -1 && currentTime - lastTime > paragraphBreakThreshold) {
        formattedTranscript += '\n\n'
      } else if (formattedTranscript) {
        formattedTranscript += ' '
      }
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
      `Could not extract transcript: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

function formatForTanaMarkdown(videoInfo: VideoInfo): string {
  let markdown = `# ${videoInfo.title} #video\n`
  markdown += `URL::${videoInfo.url}\n`
  markdown += `Channel URL::${videoInfo.channelUrl}\n`
  markdown += `Author::${videoInfo.channelName}\n`
  if (videoInfo.transcript) {
    markdown += `Transcript::${videoInfo.transcript.replace(/\n\n/g, ' ')}\n`
  }
  markdown += `\nDescription::${videoInfo.description.split('\n\n')[0] || 'No description available'}\n`
  const descriptionParagraphs = videoInfo.description.split('\n\n').slice(1)
  for (const paragraph of descriptionParagraphs) {
    if (paragraph.trim()) {
      markdown += `\n${paragraph.trim()}`
    }
  }
  return markdown
}

export default async function Command(props: { arguments: { nodeId?: string } }) {
  try {
    await showToast({
      style: Toast.Style.Animated,
      title: 'Processing YouTube Video',
    })
    const videoInfo = await extractVideoInfo()
    try {
      const transcript = await extractTranscript(videoInfo.videoId)
      videoInfo.transcript = transcript
    } catch (transcriptError) {
      await showToast({
        style: Toast.Style.Failure,
        title: 'Transcript Extraction Failed',
        message: transcriptError instanceof Error ? transcriptError.message : 'Unknown error',
      })
    }
    const markdownFormat = formatForTanaMarkdown(videoInfo)
    const tanaFormat = convertToTana(markdownFormat)
    const prefs = getPreferenceValues<{ tanaApiKey?: string; tanaInboxNodeId?: string }>()
    const nodeId = props.arguments.nodeId || prefs.tanaInboxNodeId
    if (!prefs.tanaApiKey || !nodeId) {
      await showToast({
        style: Toast.Style.Failure,
        title: 'Missing Tana API Key or Inbox Node ID',
        message: 'Please set both in the extension preferences. To find your Node ID: right-click your inbox node in Tana, select "Copy Node ID", and paste it here.',
      })
      return
    }
    await sendToTanaInbox(prefs.tanaApiKey, nodeId, tanaFormat)
    await showHUD('YouTube video info sent to Tana inbox!')
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: 'Processing Failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
} 