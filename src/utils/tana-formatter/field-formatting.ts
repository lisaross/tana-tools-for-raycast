/**
 * Field formatting utilities for consistent Tana output
 * Handles metadata fields, content fields, and formatting helpers
 */
import { TranscriptChunk } from './transcript-chunking'

/**
 * Format metadata fields for Tana
 */
export function formatMetadataFields(options: {
  url?: string
  channelUrl?: string
  description?: string
  author?: string
  duration?: string
}): string[] {
  const fields: string[] = []
  
  if (options.url) {
    fields.push(`  - URL::${options.url}`)
  }
  
  if (options.channelUrl) {
    fields.push(`  - Channel URL::${options.channelUrl}`)
  }
  
  if (options.author) {
    fields.push(`  - Author::${options.author}`)
  }
  
  if (options.duration) {
    fields.push(`  - Duration::${options.duration}`)
  }
  
  if (options.description) {
    // Handle multi-line descriptions and decode any escaped characters
    const cleanDescription = options.description
      .replace(/\\n/g, ' ') // Replace escaped newlines from JSON
      .replace(/\\r/g, ' ') // Replace escaped carriage returns
      .replace(/\\\\/g, '\\') // Unescape backslashes
      .replace(/\\"/g, '"') // Unescape quotes
      .replace(/\r\n/g, ' ') // Replace actual newlines
      .replace(/\r/g, ' ')
      .replace(/\n/g, ' ')
      .replace(/#\w+\b/g, '') // Remove hashtags like #hashtag
      .replace(/\s+/g, ' ') // Collapse multiple spaces
      .replace(/::+/g, ':') // Remove multiple colons that could create fields
      .trim()
    
    fields.push(`  - Description::${cleanDescription}`)
  }
  
  return fields
}

/**
 * Format content under a Content:: field
 */
export function formatContentField(content: string): string[] {
  if (!content || content.trim().length === 0) {
    return []
  }

  const lines = ['  - Content::']
  
  const contentLines = content.split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const trimmedLine = line.trim()
      
      // Skip empty bullet nodes and lines with only invisible characters
      const cleaned = trimmedLine.replace(/[\s\u200B\u200C\u200D\uFEFF]/g, '')
      if (cleaned.length === 0) {
        return null
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
        return null
      }
      
      // Convert markdown headers to Tana headings and escape # symbols
      const headerMatch = trimmedLine.match(/^(#{1,6})\s+(.+)$/)
      let processedLine: string
      if (headerMatch) {
        const text = headerMatch[2]
        processedLine = `!! ${text}`
      } else {
        processedLine = trimmedLine.replace(/#/g, '\\#')
      }
      
      // Convert to bullet points under Content:: field
      if (processedLine.startsWith('- ')) {
        return `    ${processedLine}`
      }
      return `    - ${processedLine}`
    })
    .filter(line => line !== null) // Remove null entries from empty bullets
  
  lines.push(...contentLines)
  return lines
}

/**
 * Format transcript chunks as sibling nodes
 */
export function formatTranscriptChunks(chunks: TranscriptChunk[]): string[] {
  if (!chunks || chunks.length === 0) {
    return []
  }

  return chunks.map((chunk) => `- ${chunk.content}`)
}

/**
 * Format transcript with metadata in structured format
 */
export function formatTranscriptField(chunks: TranscriptChunk[]): string[] {
  if (!chunks || chunks.length === 0) {
    return []
  }

  const lines: string[] = []
  
  if (chunks.length === 1) {
    // Single chunk - simple format
    const chunk = chunks[0]
    lines.push(`  - Transcript:: ${chunk.content}`)
  } else {
    // Multiple chunks - add as separate field entries
    chunks.forEach((chunk, index) => {
      lines.push(`  - Part ${index + 1}:: ${chunk.content}`)
    })
  }
  
  return lines
}

/**
 * Format transcript chunks under a single Transcript:: field as nested children
 */
export function formatTranscriptFieldWithSiblings(chunks: TranscriptChunk[]): string[] {
  if (!chunks || chunks.length === 0) {
    return []
  }

  const lines: string[] = ['  - Transcript::']
  
  // Add each chunk as a child under the Transcript:: field
  chunks.forEach((chunk) => {
    lines.push(`    - ${chunk.content}`)
  })
  
  return lines
}

/**
 * Format simple lines as parent/child structure
 */
export function formatLinesAsHierarchy(lines: string[]): string[] {
  if (!lines || lines.length === 0) {
    return []
  }

  const filteredLines = lines
    .filter(line => {
      // Remove all Unicode whitespace and invisible characters
      const cleaned = line.replace(/[\s\u200B\u200C\u200D\uFEFF]/g, '')
      if (cleaned.length === 0) return false
      
      const trimmed = line.trim()
      
      // Filter out empty bullet nodes and lines with only invisible characters
      if (trimmed === '-' || 
          trimmed === '•' || 
          trimmed === '*' ||
          trimmed === '- •' ||
          trimmed === '- *' ||
          trimmed === '-•' ||
          trimmed === '-*' ||
          /^-\s*[•*\u200B\u200C\u200D\uFEFF]*\s*$/.test(trimmed)) {
        return false
      }
      
      // Also filter lines that are just dashes with whitespace/invisible chars
      if (/^[-\s\u200B\u200C\u200D\uFEFF]*$/.test(trimmed) && trimmed.includes('-')) {
        return false
      }
      
      return true
    })
  
  const result: string[] = []
  
  if (filteredLines.length === 1) {
    // Single line
    const escapedLine = filteredLines[0].trim().replace(/#/g, '\\#')
    result.push(`- ${escapedLine}`)
  } else if (filteredLines.length > 1) {
    // Multiple lines - first as parent, rest as children
    const escapedParent = filteredLines[0].trim().replace(/#/g, '\\#')
    result.push(`- ${escapedParent}`)
    filteredLines.slice(1).forEach(line => {
      const escapedLine = line.trim().replace(/#/g, '\\#')
      result.push(`  - ${escapedLine}`)
    })
  }
  
  return result
}

/**
 * Create a title line with optional tags
 */
export function formatTitleLine(title: string, tags?: string[]): string {
  let titleLine = `- ${title}`
  
  if (tags && tags.length > 0) {
    const tagString = tags.map(tag => `#${tag}`).join(' ')
    titleLine += ` ${tagString}`
  }
  
  return titleLine
}