/**
 * Content processing utilities for different content types
 * Handles the specific processing needed for each format
 */
import { chunkTranscript, TranscriptChunk } from './transcript-chunking'

/**
 * Process a Limitless Pendant transcription into a clean single-line format
 * Format: > [Speaker](#startMs=timestamp&endMs=timestamp): Content
 */
export function processLimitlessPendantTranscript(text: string): string {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#')) // Remove headers and empty lines
    .filter((line) => line.startsWith('>')) // Keep only pendant format lines
    .map((line) => {
      // Extract speaker and content from pendant format
      const match = line.match(/^>\s*\[(.*?)\]\(#startMs=(\d+)&endMs=\d+\):\s*(.*?)$/)
      if (!match) return line
      const [, speaker, , content] = match
      return `${speaker}: ${content}`
    })
    .filter((processedContent) => processedContent !== '')
    .join(' ')
}

/**
 * Process a Limitless App transcription into a clean single-line format  
 * Format: Speaker Name, empty line, timestamp, content
 */
export function processLimitlessAppTranscript(text: string): string {
  const lines = text.split('\n')
  const combinedContent: string[] = []
  let currentSpeaker = ''
  let contentParts: string[] = []

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim()
    if (!line) continue

    // Check if this is a speaker line (followed by empty line)
    if (i < lines.length - 1 && !lines[i + 1].trim()) {
      if (currentSpeaker && contentParts.length > 0) {
        combinedContent.push(`${currentSpeaker}: ${contentParts.join(' ')}`)
        contentParts = []
      }
      currentSpeaker = line
      continue
    }

    // Skip timestamp lines
    if (
      line.match(
        /(Yesterday|Today|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+\d{1,2}:\d{2}\s+(AM|PM)/,
      )
    ) {
      continue
    }

    contentParts.push(line)
  }

  if (currentSpeaker && contentParts.length > 0) {
    combinedContent.push(`${currentSpeaker}: ${contentParts.join(' ')}`)
  }

  return combinedContent.join(' ')
}

/**
 * Process YouTube transcript content
 * Extracts and cleans transcript from YouTube format
 */
export function processYouTubeTranscript(text: string): string {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line)

  // Find the transcript start index
  const transcriptStartIndex = lines.findIndex((line) => line.match(/\bTranscript:(?::|\s)/i))

  if (transcriptStartIndex === -1) {
    return '' // No transcript found
  }

  // Find the end of transcript (next field marker after transcript start)
  const transcriptEndIndex = lines.findIndex(
    (line, index) => index > transcriptStartIndex && line.match(/^[^:]+::/),
  )

  // Extract transcript lines (from start to end or to the end of array)
  const transcriptLines = lines.slice(
    transcriptStartIndex,
    transcriptEndIndex === -1 ? undefined : transcriptEndIndex,
  )

  // Process transcript lines
  return transcriptLines
    .map((line, index) => {
      if (index === 0) {
        // First line: extract content after "Transcript:" label
        const transcriptPart = line.replace(/^.*?\bTranscript:(?::|\s)/, '').trim()
        return transcriptPart.replace(/#\w+\b/g, '').trim()
      } else {
        // Other lines: clean hashtags
        return line.replace(/#\w+\b/g, '').trim()
      }
    })
    .filter((line) => line) // Remove empty lines
    .join(' ')
}

/**
 * Process and chunk any transcript content
 */
export function processAndChunkTranscript(content: string, maxChunkSize: number = 7000): TranscriptChunk[] {
  if (!content || content.trim().length === 0) {
    return []
  }

  return chunkTranscript(content, maxChunkSize)
}

/**
 * Clean and escape content for Tana formatting
 */
export function cleanContentForTana(content: string): string {
  if (!content) return ''
  
  return content
    .split('\n')
    .map((line) => {
      const trimmedLine = line.trim()
      
      // Skip empty bullet-only lines and lines with only invisible characters
      const cleaned = trimmedLine.replace(/[\s\u200B\u200C\u200D\uFEFF]/g, '')
      if (cleaned.length === 0) {
        return ''
      }
      
      if (trimmedLine === '-' || 
          trimmedLine === '•' || 
          trimmedLine === '*' ||
          trimmedLine === '- •' ||
          trimmedLine === '- *' ||
          trimmedLine === '-•' ||
          trimmedLine === '-*' ||
          /^-\s*[•*\u200B\u200C\u200D\uFEFF]*\s*$/.test(trimmedLine) ||
          /^[-\s\u200B\u200C\u200D\uFEFF]*$/.test(trimmedLine)) {
        return ''
      }
      
      // Convert markdown headers to Tana headings and escape # symbols
      const headerMatch = trimmedLine.match(/^(#{1,6})\s+(.+)$/)
      if (headerMatch) {
        const text = headerMatch[2]
        return `!! ${text}`
      } else {
        // Escape # symbols to prevent unwanted tag creation
        return trimmedLine.replace(/#/g, '\\#')
      }
    })
    .filter(line => line.trim().length > 0) // Remove empty lines after processing
    .join('\n')
}

/**
 * Remove colons from content to prevent accidental field creation
 */
export function removeColonsInContent(content: string): string {
  if (!content) return ''
  
  return content
    .split('\n')
    .map((line) => {
      // Remove all :: to prevent any field creation in content
      return line.replace(/::/g, ':')
    })
    .join('\n')
}