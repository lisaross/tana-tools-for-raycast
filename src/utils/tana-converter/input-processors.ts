/**
 * Strategy pattern for processing different input types in tana-converter
 */
import { Line, CONSTANTS } from './types'
import { parseLine, splitMultipleBullets, buildHierarchy } from './line-parser'
import { convertDates } from './date-formatter'
import { convertFields, processInlineFormatting } from './formatters'
import {
  processYouTubeTranscriptTimestamps,
  processLimitlessPendantTranscriptToSingleLine,
  processLimitlessAppTranscriptToSingleLine,
} from './transcript-processor'
import { 
  chunkTranscriptContent, 
  generateTranscriptOutput, 
  generateHierarchicalTranscriptOutput 
} from './transcript-chunker'

/**
 * Interface for input processing strategies
 */
export interface InputProcessor {
  /**
   * Process the input text and return Tana-formatted output
   * @param input Raw input text
   * @returns Tana-formatted text
   */
  process(input: string): string
}

/**
 * Shared preprocessing for all input types
 */
function preprocessInput(inputText: string): string {
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

  return processedLines.join('\n')
}

/**
 * Shared logic for calculating indentation levels
 */
function calculateIndentationLevels(hierarchicalLines: Line[]): Map<number, number> {
  const indentLevels = new Map<number, number>()
  indentLevels.set(CONSTANTS.ROOT_INDENT_LEVEL, CONSTANTS.BASE_INDENT_LEVEL) // Root level

  for (let i = 0; i < hierarchicalLines.length; i += 1) {
    const line = hierarchicalLines[i]
    if (!line.content.trim()) continue

    if (line.isHeader) {
      indentLevels.set(i, CONSTANTS.BASE_INDENT_LEVEL)
    } else {
      const parentIdx = line.parent !== undefined ? line.parent : CONSTANTS.ROOT_INDENT_LEVEL
      const parentIndent = indentLevels.get(parentIdx) || CONSTANTS.BASE_INDENT_LEVEL
      indentLevels.set(i, parentIndent + CONSTANTS.INDENT_LEVEL_INCREMENT)
    }
  }

  return indentLevels
}

/**
 * Shared logic for processing line content
 */
function processLineContent(content: string, isHeader: boolean): string {
  let processedContent = content

  if (isHeader) {
    const match = content.match(/^(#{1,6})\s+(.+)$/)
    if (match) {
      const [, , headerContent] = match
      processedContent = headerContent
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

  return processedContent
}

/**
 * Processor for Limitless Pendant transcriptions
 */
export class PendantTranscriptProcessor implements InputProcessor {
  process(input: string): string {
    const processedInputText = preprocessInput(input)
    const singleLineTranscript = processLimitlessPendantTranscriptToSingleLine(processedInputText)
    
    const chunks = chunkTranscriptContent(singleLineTranscript)
    return generateTranscriptOutput(chunks)
  }
}

/**
 * Processor for Limitless App transcriptions (new format)
 */
export class LimitlessAppTranscriptProcessor implements InputProcessor {
  process(input: string): string {
    const processedInputText = preprocessInput(input)
    const singleLineTranscript = processLimitlessAppTranscriptToSingleLine(processedInputText)
    
    const chunks = chunkTranscriptContent(singleLineTranscript)
    return generateTranscriptOutput(chunks)
  }
}

/**
 * Processor for YouTube transcripts with hierarchical structure
 */
export class YouTubeTranscriptProcessor implements InputProcessor {
  process(input: string): string {
    const processedInputText = preprocessInput(input)
    const lines = processedInputText.split('\n').map((line) => parseLine(line))
    const hierarchicalLines = buildHierarchy(lines)

    // Find the transcript line
    let transcriptIdx = -1
    let transcriptContent = ''

    for (let i = 0; i < hierarchicalLines.length; i += 1) {
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
      // Use the chunking utility functions
      const chunks = chunkTranscriptContent(transcriptContent)

      // Start building output
      let output = '%%tana%%\n'

      // Calculate indentation levels
      const indentLevels = calculateIndentationLevels(hierarchicalLines)

      // Generate output for all lines except the transcript
      for (let i = 0; i < hierarchicalLines.length; i += 1) {
        if (i === transcriptIdx) continue // Skip the transcript line, we'll handle it specially

        const line = hierarchicalLines[i]
        const content = line.content.trim()
        if (!content) continue

        const indentLevel = indentLevels.get(i) || 0
        const indent = '  '.repeat(indentLevel)

        // Process line content
        const processedContent = processLineContent(content, line.isHeader)

        // Add the line to output with proper Tana formatting
        output += `${indent}- ${processedContent}\n`

        // If this is where the transcript should go (right after the line that would be its parent)
        if (i === (hierarchicalLines[transcriptIdx].parent || CONSTANTS.BASE_INDENT_LEVEL)) {
          // Determine transcript indentation levels
          const transcriptIndent = (indentLevel || CONSTANTS.BASE_INDENT_LEVEL) + CONSTANTS.INDENT_LEVEL_INCREMENT
          const chunkIndent = (indentLevel || CONSTANTS.BASE_INDENT_LEVEL) + CONSTANTS.INDENT_LEVEL_INCREMENT + CONSTANTS.TRANSCRIPT_CHUNK_INDENT_INCREMENT

          // Generate hierarchical transcript output
          output += generateHierarchicalTranscriptOutput(chunks, transcriptIndent, chunkIndent)
        }
      }

      return output
    }

    // If no transcript found, fall back to standard processing
    return new StandardMarkdownProcessor().process(input)
  }
}

/**
 * Processor for standard markdown content
 */
export class StandardMarkdownProcessor implements InputProcessor {
  process(input: string): string {
    const processedInputText = preprocessInput(input)
    
    // Split into lines and parse
    const lines = processedInputText.split('\n').map((line) => parseLine(line))

    // Build hierarchy
    const hierarchicalLines = buildHierarchy(lines)

    // Generate output
    let output = '%%tana%%\n'

    // Calculate the indentation level for each line
    const indentLevels = calculateIndentationLevels(hierarchicalLines)

    // Generate output using the calculated indentation levels
    for (let i = 0; i < hierarchicalLines.length; i += 1) {
      const line = hierarchicalLines[i]
      const content = line.content.trim()

      if (!content) continue

      const indentLevel = indentLevels.get(i) || 0
      const indent = '  '.repeat(indentLevel)

      // Process line content
      const processedContent = processLineContent(content, line.isHeader)

      output += `${indent}- ${processedContent}\n`
    }

    return output
  }
} 