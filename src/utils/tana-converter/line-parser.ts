/**
 * Line parsing module for tana-converter
 */
import { Line, TypeCheckers, VALIDATORS } from './types'

/**
 * Parse a line to determine its structure
 * @param line The line of text to parse
 * @returns Line object with parsed structure information
 */
export function parseLine(line: string): Line {
  // Input validation with type guard
  if (typeof line !== 'string') {
    throw new Error(`parseLine expects string input, received: ${typeof line}`)
  }

  const raw = line

  // Calculate indent level based on spaces and tabs
  const match = line.match(/^(\s*)/)
  const spaces = match?.[1] ?? ''
  
  // Consider tabs as 2 spaces for indentation purposes
  const tabAdjustedSpaces = line.slice(0, spaces.length).replace(/\t/g, '  ').length
  const indent = Math.floor(tabAdjustedSpaces / 2)

  // Get content without indentation
  const content = line.slice(spaces.length).trimEnd()

  // Detect if it's a header with null-safe regex check
  const isHeader = TypeCheckers.isNonEmptyString(content) && content.startsWith('#')

  // Detect if it's a code block
  const isCodeBlock = TypeCheckers.isNonEmptyString(content) && content.startsWith('```')

  // Detect if it's a bullet point with safe regex testing
  const isBulletPoint = TypeCheckers.isNonEmptyString(content) && /^[-*+•▪]\s+/.test(content)

  // Detect if it's a numbered list item
  const isNumberedList = TypeCheckers.isNonEmptyString(content) && /^\d+\.\s+/.test(content)

  // Detect if it's a list item (bullet point, numbered, or lettered)
  const isListItem = isBulletPoint || isNumberedList || 
    (TypeCheckers.isNonEmptyString(content) && /^[a-z]\.\s+/i.test(content))

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
    originalIndent: spaces.length,
  }
}

/**
 * Split a line with multiple bullet points into separate lines
 * Handles cases where multiple bullets are on the same line
 * @param line Line text to process
 * @returns Array of separated lines
 */
export function splitMultipleBullets(line: string): string[] {
  // Input validation with type guard
  if (typeof line !== 'string') {
    throw new Error(`splitMultipleBullets expects string input, received: ${typeof line}`)
  }

  // Skip standard cases where there are no multiple bullets or tabs
  if (!line.includes('\t▪') && !line.includes('\t-') && !line.match(/\t\d+\./)) {
    return [line]
  }

  // Get the leading whitespace to preserve indentation
  const match = line.match(/^(\s*)/)
  const leadingWhitespace = match?.[1] ?? ''
  const content = line.slice(leadingWhitespace.length)

  // Detect if this line contains multiple section headers with numbers (like "1.", "2.")
  const sectionMatches = content.match(/\d+\.\s+/g)
  const containsMultipleSections = sectionMatches ? sectionMatches.length > 1 : false

  // Detect if this line contains bullet points
  const containsBullets = content.includes('▪') || content.includes('-')

  // If this line contains both numbered sections and bullets, we need special handling
  if (containsMultipleSections && containsBullets) {
    const results: string[] = []

    // Extract all numbered sections using regex with null checks
    const sectionMatches = Array.from(content.matchAll(/(\d+\.\s+[^▪\d\t]+)/g))

    if (sectionMatches && sectionMatches.length > 0) {
      const sections: Array<{ index: number; text: string; number: number }> = sectionMatches
        .map((match) => {
          const matchedText = match[1]
          if (!matchedText) return null
          
          return {
            index: match.index ?? 0,
            text: matchedText.trim(),
            number: parseInt(matchedText, 10),
          }
        })
        .filter((section): section is NonNullable<typeof section> => section !== null)

      // Sort sections by their position in the text
      sections.sort((a, b) => a.index - b.index)

      // Find the boundaries of each section in the original content
      const sectionBoundaries: Array<{ start: number; end: number; text: string }> = sections.map(
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

      // Pure functional approach: transform sections to results and flatten
      const sectionResults = sectionBoundaries.flatMap(section => {
        // Start with section header
        const sectionLines = [`${leadingWhitespace}\t${section.text}`]
        
        // Get the content for this section with safe substring
        const sectionContent = content.substring(section.start, section.end)
        
        // Find all bullets in this section and transform to formatted lines
        const bulletMatches = Array.from(sectionContent.matchAll(/[▪-]\s+([^\t▪-]+)/g))
        const bulletLines = bulletMatches
          .map(bulletMatch => bulletMatch[1])
          .filter((bulletText): bulletText is string => 
            typeof bulletText === 'string' && bulletText.trim().length > 0
          )
          .map(bulletText => `${leadingWhitespace}\t\t▪\t${bulletText.trim()}`)
        
        return [...sectionLines, ...bulletLines]
      })
      
      results.push(...sectionResults)

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
          return `${leadingWhitespace}${part}`
        }
        // Add bullet marker for other parts
        return `${leadingWhitespace}\t▪ ${part.trim()}`
      })
      .filter((line) => TypeCheckers.isNonEmptyString(line.trim()))
  }

  // Generic approach for tab-separated content
  const segments = content.split(/\t(?=[▪-]|\d+\.)/)

  // Process each segment to ensure proper formatting
  return segments
    .map((segment) => {
      const trimmed = segment.trim()

      // Ensure bullet points have proper spacing
      if (/^[▪-][^\s]/.test(trimmed)) {
        return `${leadingWhitespace}${trimmed.replace(/^([▪-])/, '$1 ')}`
      }

      // Ensure numbered items have proper spacing
      if (/^\d+\.[^\s]/.test(trimmed)) {
        return `${leadingWhitespace}${trimmed.replace(/^(\d+\.)/, '$1 ')}`
      }

      return `${leadingWhitespace}${trimmed}`
    })
    .filter((line) => TypeCheckers.isNonEmptyString(line.trim()))
}

/**
 * Build the hierarchy by linking lines to their parents
 * @param lines Array of parsed lines
 * @returns Lines with parent relationships established
 */
export function buildHierarchy(lines: Line[]): Line[] {
  // Input validation with type guard
  if (!Array.isArray(lines)) {
    throw new Error(`buildHierarchy expects array input, received: ${typeof lines}`)
  }

  if (lines.length === 0) return lines

  // Validate that all elements are valid Line objects
  VALIDATORS.validateHierarchicalLines(lines)

  const result = [...lines]
  const headerStack: number[] = [] // Stack to track header hierarchy
  let currentNumberedList = -1
  let lastLineIdx = -1

  // First pass - process headers and build initial hierarchy
  for (let i = 0; i < result.length; i += 1) {
    const line = result[i]
    
    // Null check with optional chaining
    if (!line?.content) continue
    
    const content = line.content.trim()
    if (!TypeCheckers.isNonEmptyString(content)) continue

    // Handle headers with safe regex matching
    if (line.isHeader) {
      const headerMatch = content.match(/^(#+)/)
      const headerMarkers = headerMatch?.[1] ?? ''
      const level = headerMarkers.length

      // Pop headers from stack until we find appropriate parent level
      while (
        headerStack.length > 0 &&
        result[headerStack[headerStack.length - 1]]?.content
      ) {
        const stackTopIndex = headerStack[headerStack.length - 1]
        const stackTopLine = result[stackTopIndex]
        if (!stackTopLine?.content) break
        
        const stackTopMatch = stackTopLine.content.match(/^#+/)
        const stackTopLevel = stackTopMatch?.[0]?.length ?? 0
        
        if (stackTopLevel >= level) {
          headerStack.pop()
        } else {
          break
        }
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
        result[currentNumberedList] &&
        typeof line.originalIndent === 'number' &&
        typeof result[currentNumberedList].originalIndent === 'number' &&
        line.originalIndent > result[currentNumberedList].originalIndent
      ) {
        line.parent = currentNumberedList
      }
      // Otherwise, find the appropriate parent based on indentation
      else if (
        lastLineIdx >= 0 && 
        result[lastLineIdx] &&
        typeof line.originalIndent === 'number' &&
        typeof result[lastLineIdx].originalIndent === 'number' &&
        line.originalIndent > result[lastLineIdx].originalIndent
      ) {
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
    else if (
      lastLineIdx >= 0 && 
      result[lastLineIdx] &&
      typeof line.originalIndent === 'number' &&
      typeof result[lastLineIdx].originalIndent === 'number' &&
      line.originalIndent > result[lastLineIdx].originalIndent
    ) {
      line.parent = lastLineIdx
    } else if (headerStack.length > 0) {
      line.parent = headerStack[headerStack.length - 1]
    } else {
      line.parent = -1
    }

    lastLineIdx = i
  }

  return result
}
