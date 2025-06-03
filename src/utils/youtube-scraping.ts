import { fetchPageHtml, extractWithPatterns } from './web-scraping'

/**
 * YouTube video metadata
 */
export interface YouTubeMetadata {
  title: string
  channelName: string
  channelUrl: string
  description: string
  duration?: string
}

/**
 * Format duration from seconds to human-readable format (MM:SS or HH:MM:SS)
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
  } else {
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }
}

/**
 * Extract video title from YouTube HTML content
 */
export function extractYouTubeTitle(html: string): string {
  const titlePatterns = [
    /"title":"([^"]+)"/,
    /"videoDetails":[^}]*"title":"([^"]+)"/,
    /<title>([^<]+)<\/title>/,
    /"headline":"([^"]+)"/,
    /"name":"([^"]+)","description"/,
  ]

  return extractWithPatterns(html, titlePatterns, {
    defaultValue: 'YouTube Video',
    minLength: 1,
    maxLength: 300,
  })
    .replace(/ - YouTube$/, '') // Remove YouTube suffix
    .replace(/^\(\d+\)\s*/, '') // Remove notification count
}

/**
 * Extract channel information from YouTube HTML content
 */
export function extractYouTubeChannel(html: string): { name: string; url: string } {
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
  const extractedName = extractWithPatterns(html, channelNamePatterns, {
    defaultValue: '',
    minLength: 1,
    maxLength: 100,
  })
  if (extractedName && extractedName !== 'Not available') {
    channelName = extractedName
  }

  // Extract channel URL
  const extractedUrl = extractWithPatterns(html, channelUrlPatterns, {
    defaultValue: '',
    minLength: 1,
    maxLength: 200,
  })

  if (extractedUrl && extractedUrl !== 'Not available') {
    let cleanedUrl = extractedUrl.trim()

    // Handle different URL formats
    if (cleanedUrl.startsWith('/channel/') || cleanedUrl.startsWith('/@')) {
      cleanedUrl = `https://www.youtube.com${cleanedUrl}`
    } else if (cleanedUrl.startsWith('UC') && cleanedUrl.length === 24) {
      // This is a channel ID
      cleanedUrl = `https://www.youtube.com/channel/${cleanedUrl}`
    } else if (cleanedUrl.startsWith('http')) {
      // Already a full URL
      channelUrl = cleanedUrl
    }

    if (cleanedUrl.startsWith('https://www.youtube.com')) {
      channelUrl = cleanedUrl
    }
  }

  // Additional fallback: try to find channel handle in meta tags
  if (channelName === 'Unknown Channel') {
    const metaPatterns = [
      /<meta property="og:url" content="[^"]*\/@([^"/]+)"/,
      /<link rel="canonical" href="[^"]*\/@([^"/]+)"/,
    ]

    const extractedHandle = extractWithPatterns(html, metaPatterns, {
      defaultValue: '',
      minLength: 1,
      maxLength: 50,
    })

    if (extractedHandle && extractedHandle !== 'Not available') {
      channelName = `@${extractedHandle}`
      channelUrl = `https://www.youtube.com/@${extractedHandle}`
    }
  }

  return { name: channelName, url: channelUrl }
}

/**
 * Extract video description from YouTube HTML content
 */
export function extractYouTubeDescription(html: string): string {
  const descriptionPatterns = [
    /"description":"([^"]+)"/,
    /"shortDescription":"([^"]+)"/,
    /"attributedDescription":{"content":"([^"]+)"/,
    /"videoDetails":[^}]*"shortDescription":"([^"]+)"/,
  ]

  return extractWithPatterns(html, descriptionPatterns, {
    removeHashtags: true,
    preserveNewlines: true,
    defaultValue: 'Description not available',
    minLength: 10,
    maxLength: 5000,
  })
}

/**
 * Extract video duration from YouTube HTML content
 */
export function extractYouTubeDuration(html: string): string | undefined {
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

/**
 * Extract YouTube video metadata from a video URL
 */
export async function extractYouTubeMetadata(videoUrl: string): Promise<YouTubeMetadata | null> {
  const html = await fetchPageHtml(videoUrl)
  if (!html) return null

  const title = extractYouTubeTitle(html)
  const { name: channelName, url: channelUrl } = extractYouTubeChannel(html)
  const description = extractYouTubeDescription(html)
  const duration = extractYouTubeDuration(html)

  return {
    title,
    channelName,
    channelUrl,
    description,
    duration,
  }
}
