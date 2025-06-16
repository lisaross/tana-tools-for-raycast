/**
 * Content processing utilities for different content types
 * Handles the specific processing needed for each format
 */
import { chunkTranscript, TranscriptChunk } from './transcript-chunking'

/**
 * Represents a hierarchical content node
 */
interface ContentNode {
  type: 'heading' | 'content'
  level?: number // For headings (1-6)
  text: string
  children: ContentNode[]
}

/**
 * Represents a content section between headings
 */
interface ContentSection {
  heading?: {
    level: number
    text: string
  }
  content: string[]
}

/**
 * Parse markdown content into hierarchical structure with headings and nested content
 */
export function parseMarkdownStructure(content: string): ContentNode[] {
  if (!content) return []

  const lines = content.split('\n')
  const sections: ContentSection[] = []
  let currentSection: ContentSection = { content: [] }

  // Parse lines into sections
  for (const line of lines) {
    const trimmedLine = line.trim()
    if (!trimmedLine) continue

    // Check for heading
    const headingMatch = trimmedLine.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      // Save current section if it has content
      if (currentSection.heading || currentSection.content.length > 0) {
        sections.push(currentSection)
      }

      // Start new section
      currentSection = {
        heading: {
          level: headingMatch[1].length,
          text: headingMatch[2].trim(),
        },
        content: [],
      }
    } else {
      // Add content to current section
      currentSection.content.push(line)
    }
  }

  // Add final section
  if (currentSection.heading || currentSection.content.length > 0) {
    sections.push(currentSection)
  }

  // Build hierarchical structure
  return buildHierarchy(sections)
}

/**
 * Build hierarchical node structure from flat sections
 */
function buildHierarchy(sections: ContentSection[]): ContentNode[] {
  const result: ContentNode[] = []
  const stack: ContentNode[] = []

  for (const section of sections) {
    // Create content nodes for this section's content
    const contentNodes: ContentNode[] = section.content
      .filter((line) => line.trim().length > 0)
      .map((line) => ({
        type: 'content' as const,
        text: line,
        children: [],
      }))

    if (section.heading) {
      // Create heading node
      const headingNode: ContentNode = {
        type: 'heading',
        level: section.heading.level,
        text: section.heading.text,
        children: contentNodes,
      }

      // Find correct parent in stack based on heading level
      while (stack.length > 0 && stack[stack.length - 1].level! >= section.heading.level) {
        stack.pop()
      }

      if (stack.length === 0) {
        // Top-level heading
        result.push(headingNode)
      } else {
        // Nested heading
        stack[stack.length - 1].children.push(headingNode)
      }

      stack.push(headingNode)
    } else {
      // Content without heading - add to current level or top level
      if (stack.length === 0) {
        result.push(...contentNodes)
      } else {
        stack[stack.length - 1].children.push(...contentNodes)
      }
    }
  }

  return result
}

/**
 * Convert markdown text formatting to Tana format
 */
export function convertMarkdownToTana(text: string): string {
  if (!text) return ''

  let result = text

  // Convert italic: *text* (single asterisk, not bold) or _text_ to __text__ (Tana italic format)
  // Handle single asterisks for italic (but not double asterisks for bold)
  result = result.replace(/\b\*([^*\n]+)\*\b/g, '__$1__')
  // Handle underscore italic (single underscores, not double)
  result = result.replace(/\b_([^_\n\s]+)_\b/g, '__$1__')

  // Convert highlight: ==text== to ^^text^^ (Tana highlight format)
  result = result.replace(/==([^=\n]+)==/g, '^^$1^^')

  // Convert blockquotes: > text to indented format
  result = result.replace(/^>\s*(.+)$/gm, '  - $1')

  // Convert images: ![alt](url) to ![](url) (simplify alt text for Tana)
  result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '![]($2)')

  // Convert markdown lists to proper Tana bullet format
  result = convertMarkdownLists(result)

  // Preserve bold (**text**), links ([text](url)), and code (`code`) as-is
  // These are already in Tana-compatible format

  return result
}

/**
 * Convert markdown lists to Tana bullet format
 */
function convertMarkdownLists(text: string): string {
  const lines = text.split('\n')
  const result: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()

    // Detect list items (- item, * item, + item, or numbered 1. item)
    const unorderedMatch = trimmed.match(/^[-*+]\s+(.+)$/)
    const orderedMatch = trimmed.match(/^\d+\.\s+(.+)$/)

    if (unorderedMatch) {
      // Convert unordered list items
      const indent = line.match(/^(\s*)/)?.[1] || ''
      result.push(`${indent}- ${unorderedMatch[1]}`)
    } else if (orderedMatch) {
      // Convert ordered list items to unordered (Tana uses bullets)
      const indent = line.match(/^(\s*)/)?.[1] || ''
      result.push(`${indent}- ${orderedMatch[1]}`)
    } else {
      // Preserve non-list lines as-is
      result.push(line)
    }
  }

  return result.join('\n')
}

/**
 * Convert hierarchical content nodes to Tana format
 */
export function convertNodesToTana(nodes: ContentNode[], depth: number = 0): string[] {
  const result: string[] = []
  const indent = '  '.repeat(depth)

  for (const node of nodes) {
    if (node.type === 'heading') {
      // Convert heading to Tana format
      result.push(`${indent}- !! ${convertMarkdownToTana(node.text)}`)

      // Add children with increased indentation
      if (node.children.length > 0) {
        result.push(...convertNodesToTana(node.children, depth + 1))
      }
    } else {
      // Process content line
      const processedText = convertMarkdownToTana(node.text)
      const cleanedText = processedText.trim()

      // Skip empty lines and empty bullet nodes
      if (!cleanedText || isEmptyBulletNode(cleanedText)) {
        continue
      }

      // Add as bullet point if not already formatted
      if (cleanedText.startsWith('- ')) {
        result.push(`${indent}${cleanedText}`)
      } else {
        result.push(`${indent}- ${cleanedText}`)
      }
    }
  }

  return result
}

/**
 * Check if a line is an empty bullet node
 */
function isEmptyBulletNode(line: string): boolean {
  const trimmed = line.trim()
  return (
    trimmed === '-' ||
    trimmed === '•' ||
    trimmed === '*' ||
    trimmed === '- •' ||
    trimmed === '- *' ||
    trimmed === '-•' ||
    trimmed === '-*' ||
    /^-\s*[•*\u200B\u200C\u200D\uFEFF]*\s*$/.test(trimmed) ||
    /^[-\s\u200B\u200C\u200D\uFEFF]*$/.test(trimmed)
  )
}

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
export function processAndChunkTranscript(
  content: string,
  maxChunkSize: number = 7000,
): TranscriptChunk[] {
  if (!content || content.trim().length === 0) {
    return []
  }

  return chunkTranscript(content, maxChunkSize)
}

/**
 * Clean and escape content for Tana formatting with enhanced markdown processing
 */
export function cleanContentForTana(content: string): string {
  if (!content) return ''

  // Check if content has markdown headings - if so, use hierarchical processing
  const hasHeadings = /^#{1,6}\s+.+$/m.test(content)

  if (hasHeadings) {
    // Use hierarchical markdown processing
    const nodes = parseMarkdownStructure(content)
    const tanaLines = convertNodesToTana(nodes)
    return tanaLines.join('\n')
  } else {
    // Use simple line-by-line processing for content without headings
    return content
      .split('\n')
      .map((line) => {
        const processedLine = convertMarkdownToTana(line)
        const trimmedLine = processedLine.trim()

        // Skip empty bullet-only lines and lines with only invisible characters
        const cleaned = trimmedLine.replace(/[\s\u200B\u200C\u200D\uFEFF]/g, '')
        if (cleaned.length === 0) {
          return ''
        }

        if (isEmptyBulletNode(trimmedLine)) {
          return ''
        }

        // Escape # symbols to prevent unwanted tag creation (but not in headings)
        return trimmedLine.replace(/#/g, '\\#')
      })
      .filter((line) => line.trim().length > 0) // Remove empty lines after processing
      .join('\n')
  }
}

/**
 * Legacy function for simple header conversion (kept for backward compatibility)
 */
export function convertSimpleHeaders(content: string): string {
  return content
    .split('\n')
    .map((line) => {
      const trimmedLine = line.trim()

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
