import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

/**
 * Common options for text cleaning
 */
export interface CleanTextOptions {
  removeHashtags?: boolean
  preserveNewlines?: boolean
  maxLength?: number
}

/**
 * Decode HTML entities to their text equivalents
 * @param text Text containing HTML entities
 * @returns Decoded text
 */
export function decodeHTMLEntities(text: string): string {
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
 * Clean and decode HTML entities from extracted text
 * @param text Raw extracted text
 * @param options Cleaning options
 * @returns Cleaned text
 */
export function cleanExtractedText(text: string, options: CleanTextOptions = {}): string {
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

  if (options.maxLength && cleaned.length > options.maxLength) {
    cleaned = cleaned.substring(0, options.maxLength) + '...'
  }

  return cleaned
}

/**
 * Extract content using multiple regex patterns
 * @param html HTML content to search
 * @param patterns Array of regex patterns to try
 * @param options Text cleaning options
 * @returns First successful match or default value
 */
export function extractWithPatterns(
  html: string,
  patterns: RegExp[],
  options: CleanTextOptions & {
    defaultValue?: string
    minLength?: number
    maxLength?: number
  } = {},
): string {
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match) {
      const [, extractedText] = match
      if (extractedText) {
        const cleaned = cleanExtractedText(extractedText, options)

        const minLength = options.minLength || 0
        const maxLength = options.maxLength || Infinity

        if (cleaned && cleaned.length >= minLength && cleaned.length <= maxLength) {
          return cleaned
        }
      }
    }
  }

  return options.defaultValue || 'Not available'
}

/**
 * Extract page title from HTML content
 * @param html HTML content from webpage
 * @returns Extracted and cleaned title
 */
export function extractTitle(html: string): string {
  const titlePatterns = [
    /<title>([^<]+)<\/title>/i,
    /<meta property="og:title" content="([^"]+)"/i,
    /<meta name="twitter:title" content="([^"]+)"/i,
    /<h1[^>]*>([^<]+)<\/h1>/i,
    /<meta property="title" content="([^"]+)"/i,
  ]

  return extractWithPatterns(html, titlePatterns, {
    defaultValue: 'Webpage',
    minLength: 1,
    maxLength: 300,
  }).replace(/^\(\d+\)\s*/, '') // Remove notification count
}

/**
 * Extract page description from HTML content
 * @param html HTML content from webpage
 * @returns Extracted and cleaned description
 */
export function extractDescription(html: string): string {
  const descriptionPatterns = [
    /<meta name="description" content="([^"]+)"/i,
    /<meta property="og:description" content="([^"]+)"/i,
    /<meta name="twitter:description" content="([^"]+)"/i,
    /<meta property="description" content="([^"]+)"/i,
    /<meta name="summary" content="([^"]+)"/i,
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
 * Extract author information from HTML content
 * @param html HTML content from webpage
 * @returns Author name or undefined if not found
 */
export function extractAuthor(html: string): string | undefined {
  const authorPatterns = [
    /<meta name="author" content="([^"]+)"/i,
    /<meta property="article:author" content="([^"]+)"/i,
    /<meta name="twitter:creator" content="([^"]+)"/i,
    /<meta property="og:author" content="([^"]+)"/i,
    /<meta name="creator" content="([^"]+)"/i,
  ]

  const result = extractWithPatterns(html, authorPatterns, {
    defaultValue: '',
    minLength: 1,
    maxLength: 100,
  })

  return result && result !== 'Not available' ? result : undefined
}

/**
 * Fetch webpage HTML using curl with proper headers and error handling
 * @param url URL to fetch
 * @returns HTML content or null if failed
 */
export async function fetchPageHtml(url: string): Promise<string | null> {
  try {
    // Use execFile instead of shell execution to prevent command injection
    const userAgent =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

    const htmlResult = await execFileAsync(
      'curl',
      [
        '-s', // Silent mode
        '-L', // Follow redirects
        '-H',
        `User-Agent: ${userAgent}`, // Set user agent header
        url, // URL as argument (not interpolated into shell command)
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

    return html
  } catch {
    return null
  }
}

/**
 * Basic page metadata that can be extracted from any webpage
 */
export interface PageMetadata {
  title: string
  description: string
  author?: string
}

/**
 * Extract basic page metadata from a URL
 * @param url URL to scrape
 * @returns Page metadata or null if extraction failed
 */
export async function extractPageMetadata(url: string): Promise<PageMetadata | null> {
  const html = await fetchPageHtml(url)
  if (!html) return null

  return {
    title: extractTitle(html),
    description: extractDescription(html),
    author: extractAuthor(html),
  }
}

/**
 * Safely format content for Tana field to prevent it from being split into separate nodes
 */
export function formatContentForTanaField(content: string): string {
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
