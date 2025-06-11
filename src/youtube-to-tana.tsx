import { Clipboard, showHUD, BrowserExtension, Toast, showToast } from '@raycast/api'
import { convertToTana } from './utils/tana-converter'

/**
 * YouTube to Tana Converter
 *
 * Simplified version that uses only the Raycast Browser Extension API
 * to extract YouTube video metadata and transcripts.
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
  transcript?: string
}

/**
 * Decode HTML entities to their text equivalents
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

  // Handle numeric entities like &#39;
  decoded = decoded.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))

  return decoded
}

/**
 * Get YouTube tab using Browser Extension API
 */
async function getYouTubeTab(): Promise<{ url: string; tabId: number; title?: string } | null> {
  try {
    console.log('🔍 Getting YouTube tab via Browser Extension API...')
    
    const tabs = await BrowserExtension.getTabs()
    console.log(`🔍 Found ${tabs?.length || 0} tabs`)

    if (!tabs || tabs.length === 0) {
      throw new Error('Could not access browser tabs. Please ensure Raycast has permission to access your browser.')
    }

    // Find active YouTube tab
    const youtubeTab = tabs.find((tab) => tab.active && tab.url?.includes('youtube.com/watch'))
    
    if (!youtubeTab) {
      throw new Error('No active YouTube video tab found. Please open a YouTube video and make sure it\'s the active tab.')
    }

    return {
      url: youtubeTab.url,
      tabId: youtubeTab.id,
      title: youtubeTab.title,
    }
  } catch (error) {
    console.log(`❌ Browser Extension API failed: ${error}`)
    throw error
  }
}

/**
 * Extract video metadata using Browser Extension API
 */
async function extractVideoMetadata(tabId: number, url: string): Promise<Partial<VideoInfo>> {
  try {
    console.log(`🔍 Extracting metadata from tab ${tabId}...`)
    
    // Extract video ID from URL
    const urlObj = new URL(url)
    const videoId = urlObj.searchParams.get('v')
    
    if (!videoId) {
      throw new Error('Could not extract video ID from URL')
    }
    
    // Get HTML content for regex-based extraction
    const htmlContent = await BrowserExtension.getContent({
      tabId: tabId,
      format: 'html'
    })
    
    // Extract title using multiple methods
    let title = 'YouTube Video'
    
    // Method 1: Try to get title from page title
    const titleMatch = htmlContent.match(/<title>([^<]+)<\/title>/)
    if (titleMatch) {
      title = titleMatch[1].replace(' - YouTube', '').trim()
    }
    
    // Method 2: Try to get title from meta property
    const ogTitleMatch = htmlContent.match(/<meta property="og:title" content="([^"]+)"/)
    if (ogTitleMatch) {
      title = ogTitleMatch[1]
    }
    
    // Method 3: Try to get title from h1 element directly
    try {
      const h1Title = await BrowserExtension.getContent({
        cssSelector: 'h1.ytd-watch-metadata yt-formatted-string, h1.title yt-formatted-string, #title h1 yt-formatted-string',
        format: 'text',
        tabId: tabId,
      })
      if (h1Title && h1Title.trim().length > 0) {
        title = h1Title.trim()
        console.log(`🔍 Found title via CSS selector: ${title}`)
      }
    } catch (error) {
      console.log(`🔍 CSS title extraction failed: ${error}`)
    }
    
    // Extract channel info using multiple methods
    let channelName = 'Unknown Channel'
    let channelUrl = 'https://www.youtube.com'
    
    // Method 1: Try to get channel name from CSS selectors (more specific to video owner)
    const channelSelectors = [
      // Most specific - target the video owner section
      'ytd-video-owner-renderer ytd-channel-name a',
      'ytd-video-owner-renderer ytd-channel-name yt-formatted-string',
      'ytd-video-owner-renderer .ytd-channel-name a',
      // Alternative specific selectors
      '#owner ytd-channel-name a',
      '#owner .ytd-channel-name a',
      // Broader but still in owner context
      'ytd-channel-name a',
      '.ytd-channel-name a',
      // Fallback
      '#channel-name a, #channel-name yt-formatted-string'
    ]
    
    for (const selector of channelSelectors) {
      try {
        console.log(`🔍 Trying channel selector: ${selector}`)
        const channelElement = await BrowserExtension.getContent({
          cssSelector: selector,
          format: 'text',
          tabId: tabId,
        })
        
        if (channelElement && channelElement.trim().length > 0 && channelElement.trim().length < 100) {
          channelName = channelElement.trim()
          console.log(`✅ Found channel name via CSS: "${channelName}" using selector: ${selector}`)
          break
        } else if (channelElement) {
          console.log(`🔍 Found but rejected channel text (too long/short): "${channelElement.substring(0, 50)}..." using selector: ${selector}`)
        }
      } catch (error) {
        console.log(`❌ Channel selector ${selector} failed: ${error}`)
        continue
      }
    }
    
    // Method 2: Try to get channel URL from CSS selectors (more specific)
    const channelUrlSelectors = [
      'ytd-video-owner-renderer ytd-channel-name a',
      'ytd-video-owner-renderer .ytd-channel-name a',
      '#owner ytd-channel-name a',
      'ytd-channel-name a',
      '.ytd-channel-name a'
    ]
    
    for (const urlSelector of channelUrlSelectors) {
      try {
        console.log(`🔍 Trying channel URL selector: ${urlSelector}`)
        const channelLinkHTML = await BrowserExtension.getContent({
          cssSelector: urlSelector,
          format: 'html',
          tabId: tabId,
        })
        
        if (channelLinkHTML) {
          const hrefMatch = channelLinkHTML.match(/href="([^"]+)"/)
          if (hrefMatch) {
            let extractedUrl = hrefMatch[1]
            if (extractedUrl.startsWith('/')) {
              extractedUrl = `https://www.youtube.com${extractedUrl}`
            }
            // Validate that this looks like a proper channel URL
            if (extractedUrl.includes('/@') || extractedUrl.includes('/channel/') || extractedUrl.includes('/c/')) {
              channelUrl = extractedUrl
              console.log(`✅ Found channel URL via CSS: "${channelUrl}" using selector: ${urlSelector}`)
              break
            } else {
              console.log(`🔍 Found URL but doesn't look like channel: "${extractedUrl}" using selector: ${urlSelector}`)
            }
          }
        }
      } catch (error) {
        console.log(`❌ Channel URL selector ${urlSelector} failed: ${error}`)
        continue
      }
    }
    
    // Method 3: Fallback to regex-based extraction from HTML
    if (channelName === 'Unknown Channel') {
      const channelMatch = htmlContent.match(/"ownerChannelName":"([^"]+)"/)
      if (channelMatch) {
        channelName = decodeHTMLEntities(channelMatch[1])
        console.log(`✅ Found channel name via regex: ${channelName}`)
      }
    }
    
    if (channelUrl === 'https://www.youtube.com') {
      const channelIdMatch = htmlContent.match(/"channelId":"([^"]+)"/)
      if (channelIdMatch) {
        channelUrl = `https://www.youtube.com/channel/${channelIdMatch[1]}`
        console.log(`✅ Found channel URL via regex: ${channelUrl}`)
      }
    }
    
    // Extract description
    let description = 'Description not available'
    
    // Method 1: Try CSS selector for description
    try {
      const cssDescription = await BrowserExtension.getContent({
        cssSelector: 'ytd-expandable-video-description-body-renderer, .ytd-expandable-video-description-body-renderer, #description',
        format: 'text',
        tabId: tabId,
      })
      
      if (cssDescription && cssDescription.trim().length > 10) {
        description = cssDescription.trim()
        console.log(`✅ Found description via CSS (${description.length} chars)`)
      }
    } catch (error) {
      console.log(`❌ CSS description extraction failed: ${error}`)
    }
    
    // Method 2: Fallback to regex
    if (description === 'Description not available') {
      const descMatch = htmlContent.match(/"description":"([^"]+)"/)
      if (descMatch) {
        description = decodeHTMLEntities(descMatch[1])
        console.log(`✅ Found description via regex (${description.length} chars)`)
      }
    }
    
    return {
      title: decodeHTMLEntities(title),
      channelName,
      channelUrl,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      videoId,
      description
    }
  } catch (error) {
    console.log(`❌ Metadata extraction failed: ${error}`)
    throw error
  }
}

/**
 * Extract transcript using Browser Extension API
 */
async function extractTranscript(tabId: number): Promise<string | null> {
  try {
    console.log(`🔍 Extracting transcript from tab ${tabId}...`)
    
    // First, check if transcript panel is visible or needs to be opened
    let needsTranscriptButton = false
    try {
      // Check if transcript panel exists but is not expanded
      const transcriptButton = await BrowserExtension.getContent({
        cssSelector: 'button[aria-label*="transcript" i], button[aria-label*="Show transcript" i]',
        format: 'text',
        tabId: tabId,
      })
      
      if (transcriptButton && transcriptButton.includes('Show transcript')) {
        console.log('🔍 Transcript panel not expanded, but transcript button found')
        needsTranscriptButton = true
      }
    } catch (error) {
      console.log(`🔍 Could not check transcript button: ${error}`)
    }
    
    // Try different selectors for transcript content - prioritize container selectors that get all segments
    const transcriptSelectors = [
      // Container selectors that should capture all transcript segments
      'ytd-transcript-segment-list-renderer',
      'ytd-transcript-search-panel-renderer',
      'ytd-transcript-renderer #content',
      '#segments-container',
      // Alternative container approaches
      'div[id="segments-container"]',
      'ytd-transcript-segment-list-renderer #segments-container',
      // Fallback individual selectors (may only get first segment)
      'yt-formatted-string.segment-text.style-scope.ytd-transcript-segment-renderer',
      'ytd-transcript-segment-renderer yt-formatted-string.segment-text',
      '.segment-text',
      'yt-formatted-string.segment-text'
    ]
    
    for (const selector of transcriptSelectors) {
      try {
        console.log(`🔍 Trying selector: ${selector}`)
        const transcriptText = await BrowserExtension.getContent({
          cssSelector: selector,
          format: 'text',
          tabId: tabId,
        })
        
        if (transcriptText && transcriptText.trim().length > 50) {
          console.log(`✅ Found transcript with ${selector} (${transcriptText.length} chars)`)
          return transcriptText.trim()
        } else if (transcriptText && transcriptText.trim().length > 0) {
          console.log(`🔍 Found short content with ${selector}: "${transcriptText.substring(0, 100)}..."`)
        }
      } catch (error) {
        console.log(`❌ Selector ${selector} failed: ${error}`)
        continue
      }
    }
    
    // If no individual segments found, try alternative container selectors
    const containerSelectors = [
      'ytd-transcript-renderer',
      'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]',
      '[target-id="engagement-panel-searchable-transcript"] ytd-transcript-renderer',
      'ytd-engagement-panel-section-list-renderer[visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"]'
    ]
    
    for (const containerSelector of containerSelectors) {
      try {
        console.log(`🔍 Trying container selector: ${containerSelector}`)
        const fullTranscript = await BrowserExtension.getContent({
          cssSelector: containerSelector,
          format: 'text',
          tabId: tabId,
        })
        
        if (fullTranscript && fullTranscript.trim().length > 100) {
          console.log(`✅ Found transcript via container (${fullTranscript.length} chars)`)
          return fullTranscript.trim()
        } else if (fullTranscript && fullTranscript.trim().length > 0) {
          console.log(`🔍 Found short content with container ${containerSelector}: "${fullTranscript.substring(0, 100)}..."`)
        }
      } catch (error) {
        console.log(`❌ Container selector ${containerSelector} failed: ${error}`)
        continue
      }
    }
    
    console.log('❌ No transcript found with any selector')
    
    // If we found a transcript button that needs to be clicked, throw a specific error
    if (needsTranscriptButton) {
      throw new Error('TRANSCRIPT_BUTTON_NEEDED')
    }
    
    return null
  } catch (error) {
    console.log(`❌ Transcript extraction failed: ${error}`)
    
    // Re-throw specific errors
    if (error instanceof Error && error.message === 'TRANSCRIPT_BUTTON_NEEDED') {
      throw error
    }
    
    return null
  }
}

/**
 * Safely format transcript content for Tana field
 */
function formatTranscriptForTanaField(transcript: string): string {
  return transcript
    .replace(/#\w+\b/g, '') // Remove hashtags
    .replace(/\b\d{1,2}:\d{2}\b/g, '') // Remove timestamps like 1:23, 12:34
    .replace(/\b\d{1,2}:\d{2}:\d{2}\b/g, '') // Remove timestamps like 1:23:45
    .replace(/\r\n/g, ' ')   // Replace line breaks with spaces
    .replace(/\r/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')    // Multiple spaces to single space
    .replace(/::+/g, ':')    // Multiple colons
    .replace(/\t/g, ' ')     // Tabs to spaces
    .trim()
}

/**
 * Format video info for Tana in Markdown format
 */
function formatForTanaMarkdown(videoInfo: VideoInfo): string {
  let markdown = `# ${videoInfo.title} #video\n`
  markdown += `URL::${videoInfo.url}\n`
  markdown += `Channel URL::${videoInfo.channelUrl}\n`
  markdown += `Author::${videoInfo.channelName}\n`

  if (videoInfo.transcript) {
    const safeTranscript = formatTranscriptForTanaField(videoInfo.transcript)
    markdown += `Transcript::${safeTranscript}\n`
  }

  const safeDescription = formatTranscriptForTanaField(videoInfo.description)
  markdown += `Description::${safeDescription}\n`

  return markdown
}

/**
 * Main command entry point
 */
export default async function Command() {
  try {
    await showToast({
      style: Toast.Style.Animated,
      title: 'Processing YouTube Video',
    })

    // Get YouTube tab
    const youtubeTab = await getYouTubeTab()
    if (!youtubeTab) {
      throw new Error('No YouTube tab found')
    }

    // Check for transcript first
    let transcript: string | null = null
    let transcriptButtonNeeded = false
    
    try {
      transcript = await extractTranscript(youtubeTab.tabId)
    } catch (transcriptError) {
      if (transcriptError instanceof Error && transcriptError.message === 'TRANSCRIPT_BUTTON_NEEDED') {
        transcriptButtonNeeded = true
        console.log('🔍 Transcript button needs to be clicked first')
      } else {
        console.log(`❌ Transcript extraction error: ${transcriptError}`)
      }
    }
    
    // If transcript button needs to be clicked, show warning and stop
    if (transcriptButtonNeeded) {
      await showToast({
        style: Toast.Style.Failure,
        title: 'Click "Show transcript" below video first',
        message: 'Then run this command again to process the video with transcript.',
      })
      return
    }

    // Extract video metadata
    const metadata = await extractVideoMetadata(youtubeTab.tabId, youtubeTab.url)
    
    // Combine all info
    const videoInfo: VideoInfo = {
      title: metadata.title || 'YouTube Video',
      channelName: metadata.channelName || 'Unknown Channel',
      channelUrl: metadata.channelUrl || 'https://www.youtube.com',
      url: metadata.url || youtubeTab.url,
      videoId: metadata.videoId || '',
      description: metadata.description || 'Description not available',
      transcript: transcript || undefined
    }

    // Format and copy to clipboard
    const markdownFormat = formatForTanaMarkdown(videoInfo)
    const tanaFormat = convertToTana(markdownFormat)
    await Clipboard.copy(tanaFormat)

    // Show success message
    if (transcript) {
      await showHUD('YouTube video info and transcript copied to clipboard ✨')
    } else {
      await showHUD('YouTube video info copied to clipboard ✨')
      await showToast({
        style: Toast.Style.Failure,
        title: 'No Transcript Found',
        message: 'This video may not have captions/transcripts available.',
      })
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    
    await showToast({
      style: Toast.Style.Failure,
      title: 'Failed to process YouTube video',
      message: errorMessage,
    })
  }
}