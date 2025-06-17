/**
 * Unified Tana Formatter
 * Single entry point for all Tana formatting with automatic content type detection
 */

import { detectContentType, isYouTubeTranscript } from './content-detection'
import {
  processLimitlessPendantTranscript,
  processLimitlessAppTranscript,
  processYouTubeTranscript,
  processAndChunkTranscript,
  removeColonsInContent,
} from './content-processing'
import {
  formatMetadataFields,
  formatContentField,
  formatTranscriptChunks,
  formatTranscriptField,
  formatTranscriptFieldWithSiblings,
  formatLinesAsHierarchy,
  formatTitleLine,
} from './field-formatting'

// Re-export types and utilities that commands might need
export type { TranscriptChunk } from './transcript-chunking'
export type { ContentType } from './content-detection'

/**
 * Options for formatting content to Tana format
 */
export interface TanaFormatOptions {
  title?: string
  url?: string
  channelUrl?: string
  description?: string
  author?: string
  content?: string
  lines?: string[]
  duration?: string
  useSwipeTag?: boolean
  transcriptAsFields?: boolean // Whether to format transcripts as fields vs sibling nodes
}

/**
 * Main Tana formatting function - single entry point for all content types
 * Automatically detects content type and applies appropriate processing
 */
export function formatForTana(options: TanaFormatOptions): string {
  // Detect what type of content we're dealing with
  const contentType = detectContentType(options)

  switch (contentType) {
    case 'limitless-pendant':
      return formatLimitlessPendantTranscript(options)

    case 'limitless-app':
      return formatLimitlessAppTranscript(options)

    case 'youtube-video':
      return formatYouTubeVideoContent(options)

    case 'youtube-transcript':
      return formatYouTubeTranscript(options)

    case 'browser-page':
      return formatBrowserPageContent(options)

    case 'selected-text':
      return formatSelectedTextContent(options)

    case 'plain-text':
    default:
      return formatPlainTextContent(options)
  }
}

/**
 * Format Limitless Pendant transcription
 */
function formatLimitlessPendantTranscript(options: TanaFormatOptions): string {
  const rawContent = options.content || (options.lines ? options.lines.join('\n') : '')
  const singleLineTranscript = processLimitlessPendantTranscript(rawContent)
  const chunks = processAndChunkTranscript(singleLineTranscript)

  const lines = ['%%tana%%']
  if (chunks.length > 0) {
    lines.push(...formatTranscriptChunks(chunks))
  }

  return lines.join('\n')
}

/**
 * Format Limitless App transcription
 */
function formatLimitlessAppTranscript(options: TanaFormatOptions): string {
  const rawContent = options.content || (options.lines ? options.lines.join('\n') : '')
  const singleLineTranscript = processLimitlessAppTranscript(rawContent)
  const chunks = processAndChunkTranscript(singleLineTranscript)

  const lines = ['%%tana%%']
  if (chunks.length > 0) {
    lines.push(...formatTranscriptChunks(chunks))
  }

  return lines.join('\n')
}

/**
 * Format YouTube video with proper metadata and transcript structure
 */
function formatYouTubeVideoContent(options: TanaFormatOptions): string {
  const lines = ['%%tana%%']

  if (options.title) {
    // YouTube video title with #video tag (not #swipe)
    lines.push(formatTitleLine(options.title, ['video']))

    // Add metadata fields (description will be properly processed here)
    lines.push(
      ...formatMetadataFields({
        url: options.url,
        channelUrl: options.channelUrl,
        author: options.author,
        duration: options.duration,
        description: options.description,
      }),
    )

    // Handle transcript if present in content
    const rawContent = options.content || ''
    if (rawContent && isYouTubeTranscript(rawContent)) {
      const transcriptContent = processYouTubeTranscript(rawContent)
      if (transcriptContent && transcriptContent.trim().length > 0) {
        const chunks = processAndChunkTranscript(transcriptContent)

        if (chunks.length > 0) {
          // Format transcript as children under Transcript:: field
          lines.push(...formatTranscriptFieldWithSiblings(chunks))
        }
      }
    }
  }

  return lines.join('\n')
}

/**
 * Format YouTube transcript content
 */
function formatYouTubeTranscript(options: TanaFormatOptions): string {
  const rawContent = options.content || (options.lines ? options.lines.join('\n') : '')
  const transcriptContent = processYouTubeTranscript(rawContent)
  const chunks = processAndChunkTranscript(transcriptContent)

  const lines = ['%%tana%%']

  if (options.title) {
    // Include video metadata
    const tags = options.useSwipeTag ? ['swipe'] : []
    lines.push(formatTitleLine(options.title, tags))
    lines.push(...formatMetadataFields(options))

    if (options.transcriptAsFields) {
      lines.push(...formatTranscriptField(chunks))
    } else {
      lines.push(...formatTranscriptChunks(chunks))
    }
  } else {
    // Just transcript chunks
    lines.push(...formatTranscriptChunks(chunks))
  }

  return lines.join('\n')
}

/**
 * Format browser page content with metadata
 */
function formatBrowserPageContent(options: TanaFormatOptions): string {
  const lines = ['%%tana%%']

  if (options.title) {
    const tags = options.useSwipeTag ? ['swipe'] : []
    lines.push(formatTitleLine(options.title, tags))

    // Add metadata fields
    lines.push(...formatMetadataFields(options))

    // Add content if present
    if (options.content) {
      // Clean content and remove colons to prevent field creation
      const cleanedContent = removeColonsInContent(options.content)
      // formatContentField handles all the hierarchical processing internally
      lines.push(...formatContentField(cleanedContent))
    }
  }

  return lines.join('\n')
}

/**
 * Format selected text content
 */
function formatSelectedTextContent(options: TanaFormatOptions): string {
  const lines = ['%%tana%%']

  if (options.lines && options.lines.length > 0) {
    lines.push(...formatLinesAsHierarchy(options.lines))
  }

  return lines.join('\n')
}

/**
 * Format plain text content
 */
function formatPlainTextContent(options: TanaFormatOptions): string {
  const lines = ['%%tana%%']

  if (options.content) {
    const contentLines = options.content.split('\n').filter((line) => line.trim().length > 0)
    lines.push(...formatLinesAsHierarchy(contentLines))
  }

  return lines.join('\n')
}

/**
 * Legacy wrapper for page info formatting (maintains backward compatibility)
 */
export interface PageInfo {
  title: string
  url: string
  description?: string
  author?: string
  content: string
}

export function formatForTanaMarkdown(pageInfo: PageInfo): string {
  return formatForTana({
    title: pageInfo.title,
    url: pageInfo.url,
    description: pageInfo.description,
    author: pageInfo.author,
    content: pageInfo.content,
    useSwipeTag: true,
  })
}
