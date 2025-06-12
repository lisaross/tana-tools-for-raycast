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
import { 
  TranscriptProcessingError, 
  HierarchyBuildingError, 
  FieldFormattingError,
  ErrorUtils,
  InvalidInputError 
} from './errors'
import { StringBuilder, StringUtils } from './string-builder'

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
    try {
      // Input validation
      ErrorUtils.validateNotEmpty(input, 'input')

      // Preprocess input
      const processedInputText = ErrorUtils.safeExecuteSync(
        () => preprocessInput(input),
        TranscriptProcessingError,
        { processorType: 'PendantTranscript', step: 'preprocessing' }
      )

      // Process transcript to single line
      const singleLineTranscript = ErrorUtils.safeExecuteSync(
        () => processLimitlessPendantTranscriptToSingleLine(processedInputText),
        TranscriptProcessingError,
        { processorType: 'PendantTranscript', step: 'singleLineProcessing' }
      )

      if (!singleLineTranscript || singleLineTranscript.trim().length === 0) {
        throw new TranscriptProcessingError('Processed transcript is empty', {
          processorType: 'PendantTranscript',
          originalLength: input.length,
          processedLength: processedInputText.length
        })
      }

      // Chunk transcript content
      const chunks = ErrorUtils.safeExecuteSync(
        () => chunkTranscriptContent(singleLineTranscript),
        TranscriptProcessingError,
        { processorType: 'PendantTranscript', step: 'chunking', transcriptLength: singleLineTranscript.length }
      )

      // Generate output
      return ErrorUtils.safeExecuteSync(
        () => generateTranscriptOutput(chunks),
        TranscriptProcessingError,
        { processorType: 'PendantTranscript', step: 'outputGeneration', chunkCount: chunks.length }
      )

    } catch (error) {
      if (error instanceof TranscriptProcessingError || error instanceof InvalidInputError) {
        throw error
      }

      throw new TranscriptProcessingError(
        `Pendant transcript processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          processorType: 'PendantTranscript',
          inputLength: input?.length,
          originalError: error instanceof Error ? error.name : 'Unknown'
        }
      )
    }
  }
}

/**
 * Processor for Limitless App transcriptions (new format)
 */
export class LimitlessAppTranscriptProcessor implements InputProcessor {
  process(input: string): string {
    try {
      // Input validation
      ErrorUtils.validateNotEmpty(input, 'input')

      // Preprocess input
      const processedInputText = ErrorUtils.safeExecuteSync(
        () => preprocessInput(input),
        TranscriptProcessingError,
        { processorType: 'LimitlessApp', step: 'preprocessing' }
      )

      // Process transcript to single line
      const singleLineTranscript = ErrorUtils.safeExecuteSync(
        () => processLimitlessAppTranscriptToSingleLine(processedInputText),
        TranscriptProcessingError,
        { processorType: 'LimitlessApp', step: 'singleLineProcessing' }
      )

      if (!singleLineTranscript || singleLineTranscript.trim().length === 0) {
        throw new TranscriptProcessingError('Processed transcript is empty', {
          processorType: 'LimitlessApp',
          originalLength: input.length,
          processedLength: processedInputText.length
        })
      }

      // Chunk transcript content
      const chunks = ErrorUtils.safeExecuteSync(
        () => chunkTranscriptContent(singleLineTranscript),
        TranscriptProcessingError,
        { processorType: 'LimitlessApp', step: 'chunking', transcriptLength: singleLineTranscript.length }
      )

      // Generate output
      return ErrorUtils.safeExecuteSync(
        () => generateTranscriptOutput(chunks),
        TranscriptProcessingError,
        { processorType: 'LimitlessApp', step: 'outputGeneration', chunkCount: chunks.length }
      )

    } catch (error) {
      if (error instanceof TranscriptProcessingError || error instanceof InvalidInputError) {
        throw error
      }

      throw new TranscriptProcessingError(
        `Limitless App transcript processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          processorType: 'LimitlessApp',
          inputLength: input?.length,
          originalError: error instanceof Error ? error.name : 'Unknown'
        }
      )
    }
  }
}

/**
 * Processor for YouTube transcripts with hierarchical structure
 */
export class YouTubeTranscriptProcessor implements InputProcessor {
  process(input: string): string {
    try {
      // Input validation
      ErrorUtils.validateNotEmpty(input, 'input')

      // Preprocess input
      const processedInputText = ErrorUtils.safeExecuteSync(
        () => preprocessInput(input),
        TranscriptProcessingError,
        { processorType: 'YouTube', step: 'preprocessing' }
      )

      // Parse lines
      const lines = ErrorUtils.safeExecuteSync(
        () => processedInputText.split('\n').map((line) => parseLine(line)),
        HierarchyBuildingError,
        { processorType: 'YouTube', step: 'lineParsing', lineCount: processedInputText.split('\n').length }
      )

      // Build hierarchy
      const hierarchicalLines = ErrorUtils.safeExecuteSync(
        () => buildHierarchy(lines),
        HierarchyBuildingError,
        { processorType: 'YouTube', step: 'hierarchyBuilding', lineCount: lines.length }
      )

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
        if (transcriptContent.trim().length === 0) {
          throw new TranscriptProcessingError('YouTube transcript content is empty after processing', {
            processorType: 'YouTube',
            transcriptIndex: transcriptIdx,
            originalLength: input.length
          })
        }

        // Use the chunking utility functions
        const chunks = ErrorUtils.safeExecuteSync(
          () => chunkTranscriptContent(transcriptContent),
          TranscriptProcessingError,
          { processorType: 'YouTube', step: 'chunking', transcriptLength: transcriptContent.length }
        )

        // Use StringBuilder for efficient output construction
        const builder = StringBuilder.withTanaHeader()

        // Calculate indentation levels
        const indentLevels = ErrorUtils.safeExecuteSync(
          () => calculateIndentationLevels(hierarchicalLines),
          HierarchyBuildingError,
          { processorType: 'YouTube', step: 'indentCalculation', hierarchicalLineCount: hierarchicalLines.length }
        )

        // Generate output for all lines except the transcript
        for (let i = 0; i < hierarchicalLines.length; i += 1) {
          if (i === transcriptIdx) continue // Skip the transcript line, we'll handle it specially

          const line = hierarchicalLines[i]
          const content = line.content.trim()
          if (!content) continue

          const indentLevel = indentLevels.get(i) || 0

          // Process line content
          const processedContent = ErrorUtils.safeExecuteSync(
            () => processLineContent(content, line.isHeader),
            FieldFormattingError,
            { processorType: 'YouTube', step: 'lineContentProcessing', lineIndex: i }
          )

          // Add the line with proper Tana formatting
          builder.addLine(processedContent, indentLevel)

          // If this is where the transcript should go (right after the line that would be its parent)
          if (i === (hierarchicalLines[transcriptIdx].parent || CONSTANTS.BASE_INDENT_LEVEL)) {
            // Determine transcript indentation levels
            const transcriptIndent = (indentLevel || CONSTANTS.BASE_INDENT_LEVEL) + CONSTANTS.INDENT_LEVEL_INCREMENT
            const chunkIndent = (indentLevel || CONSTANTS.BASE_INDENT_LEVEL) + CONSTANTS.INDENT_LEVEL_INCREMENT + CONSTANTS.TRANSCRIPT_CHUNK_INDENT_INCREMENT

            // Generate hierarchical transcript output
            const hierarchicalOutput = ErrorUtils.safeExecuteSync(
              () => generateHierarchicalTranscriptOutput(chunks, transcriptIndent, chunkIndent),
              HierarchyBuildingError,
              { processorType: 'YouTube', step: 'hierarchicalTranscriptOutput', chunkCount: chunks.length }
            )
            builder.addRaw(hierarchicalOutput.trimEnd()) // Remove trailing newline to avoid double newlines
          }
        }

        return builder.toString()
      }

      // If no transcript found, fall back to standard processing
      return ErrorUtils.safeExecuteSync(
        () => new StandardMarkdownProcessor().process(input),
        TranscriptProcessingError,
        { processorType: 'YouTube', step: 'fallbackProcessing', fallbackReason: 'noTranscriptFound' }
      )

    } catch (error) {
      if (error instanceof TranscriptProcessingError || 
          error instanceof HierarchyBuildingError || 
          error instanceof FieldFormattingError ||
          error instanceof InvalidInputError) {
        throw error
      }

      throw new TranscriptProcessingError(
        `YouTube transcript processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          processorType: 'YouTube',
          inputLength: input?.length,
          originalError: error instanceof Error ? error.name : 'Unknown'
        }
      )
    }
  }
}

/**
 * Processor for standard markdown content
 */
export class StandardMarkdownProcessor implements InputProcessor {
  process(input: string): string {
    try {
      // Input validation
      ErrorUtils.validateNotEmpty(input, 'input')

      // Preprocess input
      const processedInputText = ErrorUtils.safeExecuteSync(
        () => preprocessInput(input),
        FieldFormattingError,
        { processorType: 'StandardMarkdown', step: 'preprocessing' }
      )
      
      // Split into lines and parse
      const lines = ErrorUtils.safeExecuteSync(
        () => processedInputText.split('\n').map((line) => parseLine(line)),
        HierarchyBuildingError,
        { processorType: 'StandardMarkdown', step: 'lineParsing', lineCount: processedInputText.split('\n').length }
      )

      // Build hierarchy
      const hierarchicalLines = ErrorUtils.safeExecuteSync(
        () => buildHierarchy(lines),
        HierarchyBuildingError,
        { processorType: 'StandardMarkdown', step: 'hierarchyBuilding', lineCount: lines.length }
      )

      // Use StringBuilder for efficient output construction
      const builder = StringBuilder.withTanaHeader()

      // Calculate the indentation level for each line
      const indentLevels = ErrorUtils.safeExecuteSync(
        () => calculateIndentationLevels(hierarchicalLines),
        HierarchyBuildingError,
        { processorType: 'StandardMarkdown', step: 'indentCalculation', hierarchicalLineCount: hierarchicalLines.length }
      )

      // Generate output using the calculated indentation levels
      for (let i = 0; i < hierarchicalLines.length; i += 1) {
        const line = hierarchicalLines[i]
        const content = line.content.trim()

        if (!content) continue

        const indentLevel = indentLevels.get(i) || 0

        // Process line content
        const processedContent = ErrorUtils.safeExecuteSync(
          () => processLineContent(content, line.isHeader),
          FieldFormattingError,
          { processorType: 'StandardMarkdown', step: 'lineContentProcessing', lineIndex: i }
        )

        // Add line with proper indentation
        builder.addLine(processedContent, indentLevel)
      }

      return builder.toString()

    } catch (error) {
      if (error instanceof FieldFormattingError || 
          error instanceof HierarchyBuildingError || 
          error instanceof InvalidInputError) {
        throw error
      }

      throw new FieldFormattingError(
        `Standard markdown processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          processorType: 'StandardMarkdown',
          inputLength: input?.length,
          originalError: error instanceof Error ? error.name : 'Unknown'
        }
      )
    }
  }
} 