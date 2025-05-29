/**
 * Line parsing module for tana-converter
 */
import { Line } from './types'

/**
 * Parse a line to determine its structure
 * @param line The line of text to parse
 * @returns Line object with parsed structure information
 */
export function parseLine(line: string): Line {
  const raw = line

  // Calculate indent level based on spaces and tabs
  const match = line.match(/^(\s*)/)
  const spaces = match ? match[1].length : 0
  // Consider tabs as 2 spaces for indentation purposes
  const tabAdjustedSpaces = line.slice(0, spaces).replace(/\t/g, '  ').length
  const indent = Math.floor(tabAdjustedSpaces / 2)

  // Get content without indentation
  const content = line.slice(spaces).trimEnd()

  // Detect if it's a header
  const isHeader = content.startsWith('#')

  // Detect if it's a code block
  const isCodeBlock = content.startsWith('```')

  // Detect if it's a bullet point
  const isBulletPoint = /^[-*+•▪]\s+/.test(content)

  // Detect if it's a numbered list item
  const isNumberedList = /^\d+\.\s+/.test(content)

  // Detect if it's a list item (bullet point, numbered, or lettered)
  const isListItem = isBulletPoint || isNumberedList || /^[a-z]\.\s+/i.test(content)

  return {
    content,
    indent: isHeader ? 0 : indent, // Headers always start at level 0
    raw,
    isHeader,
    isCodeBlock,
    isListItem,
    isNumberedList,
    isBulletPoint,
    parent: undefined,
    originalIndent: spaces,
  }
}

/**
 * Split a line with multiple bullet points into separate lines
 * Handles cases where multiple bullets are on the same line
 * @param line Line text to process
 * @returns Array of separated lines
 */
export function splitMultipleBullets(line: string): string[] {
  // Skip standard cases where there are no multiple bullets or tabs
  if (!line.includes('\t▪') && !line.includes('\t-') && !line.match(/\t\d+\./)) {
    return [line]
  }

  // Get the leading whitespace to preserve indentation
  const leadingWhitespace = line.match(/^(\s*)/)?.[1] || ''
  const content = line.slice(leadingWhitespace.length)

  // Detect if this line contains multiple section headers with numbers (like "1.", "2.")
  const containsMultipleSections = (content.match(/\d+\.\s+/g) || []).length > 1

  // Detect if this line contains bullet points
  const containsBullets = content.includes('▪') || content.includes('-')

  // If this line contains both numbered sections and bullets, we need special handling
  if (containsMultipleSections && containsBullets) {
    const results: string[] = []

    // Extract all numbered sections using regex
    const sectionMatches = Array.from(content.matchAll(/(\d+\.\s+[^▪\d\t]+)/g))

    if (sectionMatches && sectionMatches.length > 0) {
      const sections: { index: number; text: string; number: number }[] = sectionMatches.map(
        (match) => ({
          index: match.index || 0,
          text: match[1].trim(),
          number: parseInt(match[1], 10),
        }),
      )

      // Sort sections by their position in the text
      sections.sort((a, b) => a.index - b.index)

      // Find the boundaries of each section in the original content
      const sectionBoundaries: { start: number; end: number; text: string }[] = sections.map(
        (section, idx) => {
          const start = section.index
          const end = idx < sections.length - 1 ? sections[idx + 1].index : content.length
          return {
            start,
            end,
            text: section.text,
          }
        },
      )

      // For each section, extract its bullets
      for (const section of sectionBoundaries) {
        // Add the section header
        results.push(`${leadingWhitespace}\t${section.text}`)

        // Get the content for this section
        const sectionContent = content.substring(section.start, section.end)

        // Find all bullets in this section
        const bulletMatches = Array.from(sectionContent.matchAll(/[▪-]\s+([^\t▪-]+)/g))

        // Add each bullet with proper indentation
        for (const bulletMatch of bulletMatches) {
          if (bulletMatch[1] && bulletMatch[1].trim()) {
            results.push(`${leadingWhitespace}\t\t▪\t${bulletMatch[1].trim()}`)
          }
        }
      }

      if (results.length > 0) {
        return results
      }
    }
  }

  // For lines with tab-separated bullets but no section numbers
  if (containsBullets && content.includes('\t▪')) {
    // Split by tab followed by bullet
    const parts = content.split(/\t▪/)

    // Return each part as a separate line, preserving indentation
    return parts
      .map((part, index) => {
        if (index === 0) {
          // First part is the main content
          return leadingWhitespace + part
        } else {
          // Add bullet marker for other parts
          return leadingWhitespace + `\t▪ ${part.trim()}`
        }
      })
      .filter((line) => line.trim())
  }

  // Generic approach for tab-separated content
  const segments = content.split(/\t(?=[▪-]|\d+\.)/)

  // Process each segment to ensure proper formatting
  return segments
    .map((segment) => {
      const trimmed = segment.trim()

      // Ensure bullet points have proper spacing
      if (/^[▪-][^\s]/.test(trimmed)) {
        return leadingWhitespace + trimmed.replace(/^([▪-])/, '$1 ')
      }

      // Ensure numbered items have proper spacing
      if (/^\d+\.[^\s]/.test(trimmed)) {
        return leadingWhitespace + trimmed.replace(/^(\d+\.)/, '$1 ')
      }

      return leadingWhitespace + trimmed
    })
    .filter((line) => line.trim())
}

/**
 * Build the hierarchy by linking lines to their parents
 * @param lines Array of parsed lines
 * @returns Lines with parent relationships established
 */
export function buildHierarchy(lines: Line[]): Line[] {
  if (lines.length === 0) return lines

  const result = [...lines]
  const headerStack: number[] = [] // Stack to track header hierarchy
  let currentNumberedList = -1
  let lastLineIdx = -1

  // First pass - process headers and build initial hierarchy
  for (let i = 0; i < result.length; i += 1) {
    const line = result[i]
    const content = line.content.trim()

    if (!content) continue

    // Handle headers
    if (line.isHeader) {
      const level = (content.match(/^#+/) || [''])[0].length

      // Pop headers from stack until we find appropriate parent level
      while (
        headerStack.length > 0 &&
        result[headerStack[headerStack.length - 1]].content.match(/^#+/)!.length >= level
      ) {
        headerStack.pop()
      }

      // Set parent to last header in stack or root
      line.parent = headerStack.length > 0 ? headerStack[headerStack.length - 1] : -1

      // Add current header to stack
      headerStack.push(i)
      lastLineIdx = i
      continue
    }

    // Handle numbered lists
    if (line.isNumberedList) {
      // Find appropriate parent based on indentation
      if (headerStack.length > 0) {
        line.parent = headerStack[headerStack.length - 1]
      } else {
        line.parent = -1
      }
      currentNumberedList = i
      lastLineIdx = i
      continue
    }

    // Handle bullet points and other content
    if (line.isBulletPoint || line.isListItem) {
      // If this bullet point is indented more than the numbered list, it's a child of the numbered list
      if (
        currentNumberedList >= 0 &&
        line.originalIndent > result[currentNumberedList].originalIndent
      ) {
        line.parent = currentNumberedList
      }
      // Otherwise, find the appropriate parent based on indentation
      else if (lastLineIdx >= 0 && line.originalIndent > result[lastLineIdx].originalIndent) {
        line.parent = lastLineIdx
      }
      // If no appropriate parent found, use the last header
      else if (headerStack.length > 0) {
        line.parent = headerStack[headerStack.length - 1]
      }
      // Default to root level
      else {
        line.parent = -1
      }
    }
    // Regular content
    else {
      // Find appropriate parent based on indentation and context
      if (lastLineIdx >= 0 && line.originalIndent > result[lastLineIdx].originalIndent) {
        line.parent = lastLineIdx
      } else if (headerStack.length > 0) {
        line.parent = headerStack[headerStack.length - 1]
      } else {
        line.parent = -1
      }
    }

    lastLineIdx = i
  }

  return result
}
