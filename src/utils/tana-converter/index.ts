/**
 * Main module for tana-converter
 * Provides functionality to convert markdown to Tana format
 */
import { TextElement, CONSTANTS } from './types'
import { parseLine, splitMultipleBullets, buildHierarchy } from './line-parser'
import { convertDates } from './date-formatter'
import { convertFields, processInlineFormatting, processTableRow } from './formatters'
import {
  isLimitlessPendantTranscription,
  isNewTranscriptionFormat,
  containsYouTubeTranscript,
  processYouTubeTranscriptTimestamps,
  processLimitlessPendantTranscriptToSingleLine,
  processLimitlessAppTranscriptToSingleLine,
} from './transcript-processor'

/**
 * Convert markdown to Tana format
 *
 * Enhanced to properly indent content under headings without using Tana's heading format
 * and to correctly handle formatting from Claude's AI outputs
 *
 * @param inputText Markdown text to convert
 * @returns Tana-formatted text
 */
export function convertToTana(inputText: string | undefined | null): string {
  if (!inputText) return 'No text selected.'

  // Check if this is a Limitless Pendant transcription
  const isPendantTranscription = isLimitlessPendantTranscription(inputText)

  // Check if this is the new transcription format
  const isNewTranscription = isNewTranscriptionFormat(inputText)

  // Check if this is a YouTube transcript
  const hasYouTubeTranscript = containsYouTubeTranscript(inputText)

  // Process the input for YouTube transcript timestamps and multiple bullets
  const processedLines: string[] = []
  inputText.split('\n').forEach((line) => {
    // First check if this line contains multiple bullet points
    const bulletLines = splitMultipleBullets(line)

    // For each bullet line, check if it has YouTube timestamps
    bulletLines.forEach((bulletLine) => {
      const segments = processYouTubeTranscriptTimestamps(bulletLine)
      processedLines.push(...segments)
    })
  })

  // Join the processed lines back together
  const processedInputText = processedLines.join('\n')

  // For transcripts that need chunking, handle them using a special approach
  if (isPendantTranscription || isNewTranscription) {
    // For Pendant and App transcripts, we want the entire content as a single transcript
    const singleLineTranscript = isPendantTranscription
      ? processLimitlessPendantTranscriptToSingleLine(processedInputText)
      : processLimitlessAppTranscriptToSingleLine(processedInputText)

    // Calculate number of chunks needed
    const maxContentSize = CONSTANTS.MAX_TRANSCRIPT_CHUNK_SIZE - 10 // Account for header and formatting
    const totalChunks = Math.ceil(singleLineTranscript.length / maxContentSize)

    // Start with the Tana header for the first chunk only
    let result = '%%tana%%\n'

    // Create each chunk
    for (let i = 0; i < totalChunks; i++) {
      const start = i * maxContentSize
      const end = Math.min(start + maxContentSize, singleLineTranscript.length)
      const chunkContent = singleLineTranscript.substring(start, end)

      // For the first chunk, we already added the header
      if (i === 0) {
        result += `- ${chunkContent}`
      } else {
        // For subsequent chunks, just continue without repeating the header
        result += `\n- ${chunkContent}`
      }
    }

    return result
  }

  // Handle YouTube transcript separately to maintain hierarchy
  if (hasYouTubeTranscript) {
    const lines = processedInputText.split('\n').map((line) => parseLine(line))
    const hierarchicalLines = buildHierarchy(lines)

    // Find the transcript line
    let transcriptIdx = -1
    let transcriptContent = ''

    for (let i = 0; i < hierarchicalLines.length; i++) {
      if (hierarchicalLines[i].content.match(/^Transcript::/)) {
        transcriptIdx = i
        // Extract the transcript content and strip hashtags
        const rawTranscriptContent = hierarchicalLines[i].content
          .replace(/^Transcript::/, '')
          .trim()
        transcriptContent = rawTranscriptContent.replace(/#\w+\b/g, '').trim()
        break
      }
    }

    // If we have a transcript, process it
    if (transcriptIdx >= 0 && transcriptContent) {
      // Process transcript content for chunking
      const maxContentSize = CONSTANTS.MAX_TRANSCRIPT_CHUNK_SIZE - 10
      const totalChunks = Math.ceil(transcriptContent.length / maxContentSize)

      // Start building output
      let output = '%%tana%%\n'

      // Calculate indentation levels
      const indentLevels = new Map<number, number>()
      indentLevels.set(-1, 0) // Root level

      // First pass - calculate indentation levels
      for (let i = 0; i < hierarchicalLines.length; i++) {
        const line = hierarchicalLines[i]
        if (!line.content.trim()) continue

        if (line.isHeader) {
          indentLevels.set(i, 0)
        } else {
          const parentIdx = line.parent !== undefined ? line.parent : -1
          const parentIndent = indentLevels.get(parentIdx) || 0
          indentLevels.set(i, parentIndent + 1)
        }
      }

      // Generate output for all lines except the transcript
      for (let i = 0; i < hierarchicalLines.length; i++) {
        if (i === transcriptIdx) continue // Skip the transcript line, we'll handle it specially

        const line = hierarchicalLines[i]
        const content = line.content.trim()
        if (!content) continue

        const indentLevel = indentLevels.get(i) || 0
        const indent = '  '.repeat(indentLevel)

        // Process line content
        let processedContent = content

        if (line.isHeader) {
          const match = content.match(/^(#{1,6})\s+(.+)$/)
          if (match) {
            processedContent = match[2]
          }
        } else {
          // Remove list markers but preserve content
          processedContent = processedContent
            .replace(/^[-*+•▪]\s+/, '')
            .replace(/^\d+\.\s+/, '')
            .replace(/^[a-z]\.\s+/i, '')

          // Process other formatting
          processedContent = convertFields(processedContent)
          processedContent = convertDates(processedContent)
          processedContent = processInlineFormatting(processedContent)
        }

        // Add the line to output with proper Tana formatting
        output += `${indent}- ${processedContent}\n`

        // If this is where the transcript should go (right after the line that would be its parent)
        if (i === (hierarchicalLines[transcriptIdx].parent || 0)) {
          // Determine transcript indentation (should be one level deeper than its parent)
          const transcriptIndent = '  '.repeat((indentLevel || 0) + 1)

          // Add the transcript field with no content - it will be a parent node for chunks
          output += `${transcriptIndent}- Transcript::\n`

          // Add transcript content as indented list items under the Transcript field
          const transcriptChunkIndent = '  '.repeat((indentLevel || 0) + 2)

          // For each chunk, add as a separate list item under the Transcript field
          for (let j = 0; j < totalChunks; j++) {
            const start = j * maxContentSize
            const end = Math.min(start + maxContentSize, transcriptContent.length)
            const chunk = transcriptContent.substring(start, end)
            output += `${transcriptChunkIndent}- ${chunk}\n`
          }
        }
      }

      return output
    }
  }

  // Standard processing for non-transcript content
  // Split into lines and parse
  const lines = processedInputText.split('\n').map((line) => parseLine(line))

  // Build hierarchy
  const hierarchicalLines = buildHierarchy(lines)

  // Generate output
  let output = '%%tana%%\n'

  // Standard non-transcript processing
  // Calculate the indentation level for each line
  const indentLevels = new Map<number, number>()
  indentLevels.set(-1, 0) // Root level

  // First pass - calculate base indentation levels
  for (let i = 0; i < hierarchicalLines.length; i++) {
    const line = hierarchicalLines[i]
    if (!line.content.trim()) continue

    if (line.isHeader) {
      // Headers are always at level 0
      indentLevels.set(i, 0)
    } else {
      // For non-header content, start with parent's indent
      const parentIdx = line.parent !== undefined ? line.parent : -1
      const parentIndent = indentLevels.get(parentIdx) || 0
      indentLevels.set(i, parentIndent + 1)
    }
  }

  // Generate output using the calculated indentation levels
  for (let i = 0; i < hierarchicalLines.length; i++) {
    const line = hierarchicalLines[i]
    const content = line.content.trim()

    if (!content) continue

    const indentLevel = indentLevels.get(i) || 0
    const indent = '  '.repeat(indentLevel)

    // Process line content
    let processedContent = content

    // Handle headers - don't use !! for backwards compatibility with tests
    if (line.isHeader) {
      const match = content.match(/^(#{1,6})\s+(.+)$/)
      if (match) {
        processedContent = match[2]
      }
    } else {
      // Remove list markers but preserve content
      processedContent = processedContent
        .replace(/^[-*+•▪]\s+/, '')
        .replace(/^\d+\.\s+/, '')
        .replace(/^[a-z]\.\s+/i, '')

      // Process other formatting
      processedContent = convertFields(processedContent)
      processedContent = convertDates(processedContent)
      processedContent = processInlineFormatting(processedContent)
    }

    // Add the line to output with proper Tana formatting
    output += `${indent}- ${processedContent}\n`
  }

  return output
}

// Re-export types and utility functions that should be publicly available
export { processTableRow }
export type { TextElement }

// Convenience exports for testing
export const _test = {
  parseLine,
  buildHierarchy,
  convertDates,
  convertFields,
  processInlineFormatting,
}
