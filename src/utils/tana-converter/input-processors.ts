/**
 * Strategy pattern for processing different input types in tana-converter
 */
import {
  Line,
  CONSTANTS,
  isValidLineArray,
  TypeCheckers,
  VALIDATORS,
  TranscriptFormatCheckers,
} from './types'
import { parseLine, splitMultipleBullets, buildHierarchy } from './line-parser'
import { convertDates } from './date-formatter'
import { convertFields, processInlineFormatting } from './formatters'
import {
  processYouTubeTranscriptTimestamps,
  processLimitlessPendantTranscriptToSingleLine,
  processLimitlessAppTranscriptToSingleLine,
} from './transcript-processor'
import { chunkTranscriptContent, generateTranscriptOutput } from './transcript-chunker'
import {
  TranscriptProcessingError,
  HierarchyBuildingError,
  FieldFormattingError,
  ErrorUtils,
  InvalidInputError,
} from './errors'
import { StringBuilder } from './string-builder'

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
 * Returns the length of a string or array, or 0 if the value is not a string or array.
 *
 * @param value - The value whose length is to be determined.
 * @returns The length if {@link value} is a string or array; otherwise, 0.
 */
function getSafeLength(value: unknown): number {
  try {
    return typeof value === 'string' || Array.isArray(value)
      ? (value as string | unknown[]).length
      : 0
  } catch {
    return 0
  }
}

/**
 * Returns a truncated string preview (up to 100 characters) of any value for debugging or error reporting.
 *
 * If the value is a string, it is truncated to 100 characters with an ellipsis if necessary. For other types, their string representation is truncated. Returns fallback strings for null or unstringifiable values.
 *
 * @param value - The value to preview.
 * @returns A string preview of {@link value}, truncated to 100 characters.
 */
function getSafePreview(value: unknown): string {
  try {
    if (typeof value === 'string') {
      return value.length > 100 ? value.substring(0, 100) + '...' : value
    }
    return String(value).substring(0, 100)
  } catch {
    return 'Unable to preview'
  }
}

/**
 * Preprocesses and normalizes input text for transcript processing.
 *
 * Splits the input into lines, separates multiple bullets per line, and processes YouTube transcript timestamps to produce a cleaned, normalized string suitable for further parsing.
 *
 * @param inputText - The raw input text to preprocess.
 * @returns The cleaned and normalized text.
 *
 * @throws {InvalidInputError} If {@link inputText} is not a non-empty string.
 */
function preprocessInput(inputText: string): string {
  // Validate input with type guard
  if (!TypeCheckers.isNonEmptyString(inputText)) {
    throw new InvalidInputError('Input text must be a non-empty string', {
      inputType: typeof inputText,
      inputLength: getSafeLength(inputText),
    })
  }

  // Pure functional approach: transform each line to segments, then flatten
  return inputText
    .split('\n')
    .flatMap((line: string) => {
      // Split line into bullet lines with null check
      const bulletLines = splitMultipleBullets(line)

      // Transform each bullet line to segments and flatten
      return bulletLines.flatMap((bulletLine: string) =>
        processYouTubeTranscriptTimestamps(bulletLine),
      )
    })
    .join('\n')
}

/**
 * Calculates indentation levels for each line in a hierarchical transcript structure.
 *
 * Validates the input array of parsed lines and determines the indentation level for each line, mapping line indices to their corresponding indentation for Tana-formatted output.
 *
 * @param hierarchicalLines - Array of parsed lines with hierarchy information.
 * @returns A map from each line's index to its calculated indentation level.
 *
 * @throws {HierarchyBuildingError} If the input array is invalid or if indentation calculation fails for any line.
 *
 * @example
 * // For lines: ['# Header', '  - Item', '    - Nested']
 * // Returns: Map { 0 => 0, 1 => 1, 2 => 2 }
 */
function calculateIndentationLevels(hierarchicalLines: Line[]): Map<number, number> {
  // Validate input with custom type guard
  if (!isValidLineArray(hierarchicalLines)) {
    throw new HierarchyBuildingError('Invalid hierarchical lines array', {
      linesType: typeof hierarchicalLines,
      isArray: Array.isArray(hierarchicalLines),
      length: getSafeLength(hierarchicalLines),
    })
  }

  const indentLevels = new Map<number, number>()
  indentLevels.set(CONSTANTS.ROOT_INDENT_LEVEL, CONSTANTS.BASE_INDENT_LEVEL) // Root level

  for (let i = 0; i < hierarchicalLines.length; i += 1) {
    const line = hierarchicalLines[i]

    // Null check with optional chaining and type guard
    if (!line?.content?.trim()) continue

    // Type assertion with validation
    if (typeof line.content !== 'string') {
      throw new HierarchyBuildingError(`Line content must be string at index ${i}`, {
        lineIndex: i,
        contentType: typeof line.content,
        lineData: line,
      })
    }

    if (line.isHeader) {
      indentLevels.set(i, CONSTANTS.BASE_INDENT_LEVEL)
    } else {
      const parentIdx = line.parent !== undefined ? line.parent : CONSTANTS.ROOT_INDENT_LEVEL
      const parentIndent = indentLevels.get(parentIdx) ?? CONSTANTS.BASE_INDENT_LEVEL

      // Validate parent indent is a valid number
      if (!TypeCheckers.isValidIndentLevel(parentIndent)) {
        throw new HierarchyBuildingError(`Invalid parent indent level at index ${i}`, {
          lineIndex: i,
          parentIndex: parentIdx,
          parentIndent,
          parentIndentType: typeof parentIndent,
        })
      }

      indentLevels.set(i, parentIndent + CONSTANTS.INDENT_LEVEL_INCREMENT)
    }
  }

  return indentLevels
}

/**
 * Processes and formats a line of content for Tana output, handling headers and regular lines differently.
 *
 * For headers, extracts and returns the header text. For regular lines, removes list markers and applies field, date, and inline formatting conversions.
 *
 * @param content - The raw line content to process.
 * @param isHeader - Indicates if the line is a header, affecting formatting.
 * @returns The processed and formatted line content.
 *
 * @throws {FieldFormattingError} If {@link content} is not a non-empty string or {@link isHeader} is not a boolean.
 */
function processLineContent(content: string, isHeader: boolean): string {
  // Validate inputs with type guards
  if (!TypeCheckers.isNonEmptyString(content)) {
    throw new FieldFormattingError('Content must be a non-empty string', {
      contentType: typeof content,
      content: String(content),
    })
  }

  if (typeof isHeader !== 'boolean') {
    throw new FieldFormattingError('isHeader must be a boolean', {
      isHeaderType: typeof isHeader,
      isHeader: String(isHeader),
    })
  }

  let processedContent = content

  if (isHeader) {
    const match = content.match(/^(#{1,6})\s+(.+)$/)
    if (match?.[2]) {
      const [, , headerContent] = match
      processedContent = headerContent
    }
  } else {
    // Remove list markers but preserve content
    processedContent = processedContent
      .replace(/^[-*+•▪]\s+/, '')
      .replace(/^\d+\.\s+/, '')
      .replace(/^[a-z]\.\s+/i, '')

    // Process other formatting with safe execution
    processedContent = convertFields(processedContent)
    processedContent = convertDates(processedContent)
    processedContent = processInlineFormatting(processedContent)
  }

  return processedContent
}

/**
 * Validates that the transcript index and content are consistent with the hierarchical lines array.
 *
 * @param transcriptIdx - Index of the transcript line within the hierarchy.
 * @param transcriptContent - Transcript content to validate.
 * @param hierarchicalLines - Array of hierarchical lines for context validation.
 *
 * @throws {TranscriptProcessingError} If the transcript index is invalid, the content is not a non-empty string, or the index is out of bounds for {@link hierarchicalLines}.
 */
function validateTranscriptData(
  transcriptIdx: number,
  transcriptContent: string,
  hierarchicalLines: Line[],
): void {
  if (!TypeCheckers.isValidIndentLevel(transcriptIdx) || transcriptIdx < 0) {
    throw new TranscriptProcessingError('Invalid transcript index', {
      transcriptIdx,
      transcriptIdxType: typeof transcriptIdx,
    })
  }

  if (!TypeCheckers.isNonEmptyString(transcriptContent)) {
    throw new TranscriptProcessingError('Transcript content must be a non-empty string', {
      transcriptContentType: typeof transcriptContent,
      transcriptContentLength: getSafeLength(transcriptContent),
    })
  }

  if (transcriptIdx >= hierarchicalLines.length) {
    throw new TranscriptProcessingError('Transcript index out of bounds', {
      transcriptIdx,
      hierarchicalLinesLength: hierarchicalLines.length,
    })
  }
}

/**
 * Processor for Limitless Pendant transcriptions
 */
export class PendantTranscriptProcessor implements InputProcessor {
  process(input: string): string {
    try {
      // Input validation with type guard
      if (!TypeCheckers.isNonEmptyString(input)) {
        throw new InvalidInputError('Input must be a non-empty string', {
          inputType: typeof input,
          inputLength: getSafeLength(input),
        })
      }

      // Additional format validation
      if (!TranscriptFormatCheckers.isLimitlessPendantFormat(input)) {
        throw new TranscriptProcessingError('Input does not match Limitless Pendant format', {
          processorType: 'LimitlessPendant',
          inputPreview: getSafePreview(input),
        })
      }

      // Preprocess input with error handling
      const processedInputText = ErrorUtils.safeExecuteSync(
        () => preprocessInput(input),
        TranscriptProcessingError,
        { processorType: 'LimitlessPendant', step: 'preprocessing' },
      )

      // Process transcript to single line with validation
      const singleLineTranscript = ErrorUtils.safeExecuteSync(
        () => processLimitlessPendantTranscriptToSingleLine(processedInputText),
        TranscriptProcessingError,
        { processorType: 'LimitlessPendant', step: 'singleLineProcessing' },
      )

      // Validate processed transcript
      if (!TypeCheckers.isNonEmptyString(singleLineTranscript)) {
        throw new TranscriptProcessingError('Processed transcript is empty or invalid', {
          processorType: 'LimitlessPendant',
          originalLength: getSafeLength(input),
          processedLength: getSafeLength(processedInputText),
          singleLineType: typeof singleLineTranscript,
        })
      }

      // Chunk transcript content with validation
      const chunks = ErrorUtils.safeExecuteSync(
        () => chunkTranscriptContent(singleLineTranscript),
        TranscriptProcessingError,
        {
          processorType: 'LimitlessPendant',
          step: 'chunking',
          transcriptLength: getSafeLength(singleLineTranscript),
        },
      )

      // Validate chunks array
      if (!TypeCheckers.isNonEmptyArray(chunks)) {
        throw new TranscriptProcessingError('Failed to generate transcript chunks', {
          processorType: 'LimitlessPendant',
          chunksType: typeof chunks,
          chunksLength: getSafeLength(chunks),
        })
      }

      // Generate output with validation
      return ErrorUtils.safeExecuteSync(
        () => generateTranscriptOutput(chunks),
        TranscriptProcessingError,
        { processorType: 'LimitlessPendant', step: 'outputGeneration', chunkCount: chunks.length },
      )
    } catch (error) {
      if (error instanceof TranscriptProcessingError || error instanceof InvalidInputError) {
        throw error
      }

      throw new TranscriptProcessingError(
        `Limitless Pendant transcript processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          processorType: 'LimitlessPendant',
          inputLength: getSafeLength(input),
          originalError: error instanceof Error ? error.name : 'Unknown',
        },
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
      // Input validation with type guard
      if (!TypeCheckers.isNonEmptyString(input)) {
        throw new InvalidInputError('Input must be a non-empty string', {
          inputType: typeof input,
          inputLength: getSafeLength(input),
        })
      }

      // Additional format validation
      if (!TranscriptFormatCheckers.isNewTranscriptionFormat(input)) {
        throw new TranscriptProcessingError('Input does not match new transcription format', {
          processorType: 'LimitlessApp',
          inputPreview: getSafePreview(input),
        })
      }

      // Preprocess input with error handling
      const processedInputText = ErrorUtils.safeExecuteSync(
        () => preprocessInput(input),
        TranscriptProcessingError,
        { processorType: 'LimitlessApp', step: 'preprocessing' },
      )

      // Process transcript to single line with validation
      const singleLineTranscript = ErrorUtils.safeExecuteSync(
        () => processLimitlessAppTranscriptToSingleLine(processedInputText),
        TranscriptProcessingError,
        { processorType: 'LimitlessApp', step: 'singleLineProcessing' },
      )

      // Validate processed transcript
      if (!TypeCheckers.isNonEmptyString(singleLineTranscript)) {
        throw new TranscriptProcessingError('Processed transcript is empty or invalid', {
          processorType: 'LimitlessApp',
          originalLength: getSafeLength(input),
          processedLength: getSafeLength(processedInputText),
          singleLineType: typeof singleLineTranscript,
        })
      }

      // Chunk transcript content with validation
      const chunks = ErrorUtils.safeExecuteSync(
        () => chunkTranscriptContent(singleLineTranscript),
        TranscriptProcessingError,
        {
          processorType: 'LimitlessApp',
          step: 'chunking',
          transcriptLength: getSafeLength(singleLineTranscript),
        },
      )

      // Validate chunks array
      if (!TypeCheckers.isNonEmptyArray(chunks)) {
        throw new TranscriptProcessingError('Failed to generate transcript chunks', {
          processorType: 'LimitlessApp',
          chunksType: typeof chunks,
          chunksLength: getSafeLength(chunks),
        })
      }

      // Generate output with validation
      return ErrorUtils.safeExecuteSync(
        () => generateTranscriptOutput(chunks),
        TranscriptProcessingError,
        { processorType: 'LimitlessApp', step: 'outputGeneration', chunkCount: chunks.length },
      )
    } catch (error) {
      if (error instanceof TranscriptProcessingError || error instanceof InvalidInputError) {
        throw error
      }

      throw new TranscriptProcessingError(
        `Limitless App transcript processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          processorType: 'LimitlessApp',
          inputLength: getSafeLength(input),
          originalError: error instanceof Error ? error.name : 'Unknown',
        },
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
      // Input validation with type guard
      if (!TypeCheckers.isNonEmptyString(input)) {
        throw new InvalidInputError('Input must be a non-empty string', {
          inputType: typeof input,
          inputLength: getSafeLength(input),
        })
      }

      // Optional format validation for YouTube
      if (!TranscriptFormatCheckers.isYouTubeTranscript(input)) {
        // Fall back to standard processing if not YouTube format
        return new StandardMarkdownProcessor().process(input)
      }

      // Preprocess input with error handling
      const processedInputText = ErrorUtils.safeExecuteSync(
        () => preprocessInput(input),
        TranscriptProcessingError,
        { processorType: 'YouTube', step: 'preprocessing' },
      )

      // Parse lines with validation
      const lines = ErrorUtils.safeExecuteSync(
        () => processedInputText.split('\n').map((line: string) => parseLine(line)),
        HierarchyBuildingError,
        {
          processorType: 'YouTube',
          step: 'lineParsing',
          lineCount: processedInputText.split('\n').length,
        },
      )

      // Validate parsed lines
      if (!isValidLineArray(lines)) {
        throw new HierarchyBuildingError('Failed to parse lines into valid Line objects', {
          processorType: 'YouTube',
          linesCount: getSafeLength(lines),
          linesType: typeof lines,
        })
      }

      // Build hierarchy with validation
      const hierarchicalLines = ErrorUtils.safeExecuteSync(
        () => buildHierarchy(lines),
        HierarchyBuildingError,
        { processorType: 'YouTube', step: 'hierarchyBuilding', lineCount: lines.length },
      )

      // Validate hierarchical lines
      if (!isValidLineArray(hierarchicalLines)) {
        throw new HierarchyBuildingError('Failed to build valid hierarchical structure', {
          processorType: 'YouTube',
          hierarchicalLinesCount: getSafeLength(hierarchicalLines),
          hierarchicalLinesType: typeof hierarchicalLines,
        })
      }

      // Find the transcript line with null checks
      let transcriptIdx = -1
      let transcriptContent = ''

      for (let i = 0; i < hierarchicalLines.length; i += 1) {
        const line = hierarchicalLines[i]

        // Safe property access with optional chaining and type checks
        if (
          line?.content &&
          typeof line.content === 'string' &&
          line.content.match(/^Transcript::/)
        ) {
          transcriptIdx = i
          // Extract the transcript content and strip hashtags
          const rawTranscriptContent = line.content.replace(/^Transcript::/, '').trim()
          transcriptContent = rawTranscriptContent.replace(/#\w+\b/g, '').trim()
          break
        }
      }

      // If we have a transcript, process it with comprehensive validation
      if (transcriptIdx >= 0 && TypeCheckers.isNonEmptyString(transcriptContent)) {
        // Validate transcript data
        validateTranscriptData(transcriptIdx, transcriptContent, hierarchicalLines)

        // Use the chunking utility functions with validation
        const chunks = ErrorUtils.safeExecuteSync(
          () => chunkTranscriptContent(transcriptContent),
          TranscriptProcessingError,
          {
            processorType: 'YouTube',
            step: 'chunking',
            transcriptLength: transcriptContent.length,
          },
        )

        // Validate chunks
        if (!TypeCheckers.isNonEmptyArray(chunks)) {
          throw new TranscriptProcessingError('Failed to generate transcript chunks', {
            processorType: 'YouTube',
            chunksType: typeof chunks,
            chunksLength: getSafeLength(chunks),
          })
        }

        // Use StringBuilder for efficient output construction
        const builder = StringBuilder.withTanaHeader()

        // Calculate indentation levels with validation
        const indentLevels = ErrorUtils.safeExecuteSync(
          () => calculateIndentationLevels(hierarchicalLines),
          HierarchyBuildingError,
          {
            processorType: 'YouTube',
            step: 'indentCalculation',
            hierarchicalLineCount: hierarchicalLines.length,
          },
        )

        // Generate output for all lines except the transcript
        for (let i = 0; i < hierarchicalLines.length; i += 1) {
          if (i === transcriptIdx) continue // Skip the transcript line, we'll handle it specially

          const line = hierarchicalLines[i]

          // Safe property access with null checks
          if (!line?.content) continue

          const content = line.content.trim()
          if (!TypeCheckers.isNonEmptyString(content)) continue

          const indentLevel = indentLevels.get(i) ?? 0

          // Validate indent level
          if (!TypeCheckers.isValidIndentLevel(indentLevel)) {
            throw new HierarchyBuildingError(`Invalid indent level at line ${i}`, {
              lineIndex: i,
              indentLevel,
              indentLevelType: typeof indentLevel,
            })
          }

          // Process line content with validation
          const processedContent = ErrorUtils.safeExecuteSync(
            () => processLineContent(content, line.isHeader),
            FieldFormattingError,
            { processorType: 'YouTube', step: 'lineContentProcessing', lineIndex: i },
          )

          // Add the line with proper Tana formatting
          builder.addLine(processedContent, indentLevel)

          // If this is where the transcript should go (right after the line that would be its parent)
          const transcriptParent =
            hierarchicalLines[transcriptIdx]?.parent ?? CONSTANTS.BASE_INDENT_LEVEL
          if (i === transcriptParent) {
            // Determine transcript indentation levels with validation
            const transcriptIndent =
              (indentLevel ?? CONSTANTS.BASE_INDENT_LEVEL) + CONSTANTS.INDENT_LEVEL_INCREMENT
            const chunkIndent =
              (indentLevel ?? CONSTANTS.BASE_INDENT_LEVEL) +
              CONSTANTS.INDENT_LEVEL_INCREMENT +
              CONSTANTS.TRANSCRIPT_CHUNK_INDENT_INCREMENT

            // Validate indentation levels
            VALIDATORS.validateIndentLevel(transcriptIndent)
            VALIDATORS.validateIndentLevel(chunkIndent)

            // Generate simple transcript output - just clean chunks without metadata
            builder.addLine('Transcript::', transcriptIndent)
            chunks.forEach((chunk) => {
              builder.addLine(chunk.content, chunkIndent)
            })
          }
        }

        return builder.toString()
      }

      // If no transcript found, fall back to standard processing
      return ErrorUtils.safeExecuteSync(
        () => new StandardMarkdownProcessor().process(input),
        TranscriptProcessingError,
        {
          processorType: 'YouTube',
          step: 'fallbackProcessing',
          fallbackReason: 'noTranscriptFound',
        },
      )
    } catch (error) {
      if (
        error instanceof TranscriptProcessingError ||
        error instanceof HierarchyBuildingError ||
        error instanceof FieldFormattingError ||
        error instanceof InvalidInputError
      ) {
        throw error
      }

      throw new TranscriptProcessingError(
        `YouTube transcript processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          processorType: 'YouTube',
          inputLength: getSafeLength(input),
          originalError: error instanceof Error ? error.name : 'Unknown',
        },
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
      // Input validation with type guard
      if (!TypeCheckers.isNonEmptyString(input)) {
        throw new InvalidInputError('Input must be a non-empty string', {
          inputType: typeof input,
          inputLength: getSafeLength(input),
        })
      }

      // Preprocess input with error handling
      const processedInputText = ErrorUtils.safeExecuteSync(
        () => preprocessInput(input),
        FieldFormattingError,
        { processorType: 'StandardMarkdown', step: 'preprocessing' },
      )

      // Split into lines and parse with validation
      const lines = ErrorUtils.safeExecuteSync(
        () => processedInputText.split('\n').map((line: string) => parseLine(line)),
        HierarchyBuildingError,
        {
          processorType: 'StandardMarkdown',
          step: 'lineParsing',
          lineCount: processedInputText.split('\n').length,
        },
      )

      // Validate parsed lines
      if (!isValidLineArray(lines)) {
        throw new HierarchyBuildingError('Failed to parse lines into valid Line objects', {
          processorType: 'StandardMarkdown',
          linesCount: getSafeLength(lines),
          linesType: typeof lines,
        })
      }

      // Build hierarchy with validation
      const hierarchicalLines = ErrorUtils.safeExecuteSync(
        () => buildHierarchy(lines),
        HierarchyBuildingError,
        { processorType: 'StandardMarkdown', step: 'hierarchyBuilding', lineCount: lines.length },
      )

      // Validate hierarchical lines
      if (!isValidLineArray(hierarchicalLines)) {
        throw new HierarchyBuildingError('Failed to build valid hierarchical structure', {
          processorType: 'StandardMarkdown',
          hierarchicalLinesCount: getSafeLength(hierarchicalLines),
          hierarchicalLinesType: typeof hierarchicalLines,
        })
      }

      // Use StringBuilder for efficient output construction
      const builder = StringBuilder.withTanaHeader()

      // Calculate the indentation level for each line with validation
      const indentLevels = ErrorUtils.safeExecuteSync(
        () => calculateIndentationLevels(hierarchicalLines),
        HierarchyBuildingError,
        {
          processorType: 'StandardMarkdown',
          step: 'indentCalculation',
          hierarchicalLineCount: hierarchicalLines.length,
        },
      )

      // Generate output using the calculated indentation levels
      for (let i = 0; i < hierarchicalLines.length; i += 1) {
        const line = hierarchicalLines[i]

        // Safe property access with null checks
        if (!line?.content) continue

        const content = line.content.trim()
        if (!TypeCheckers.isNonEmptyString(content)) continue

        const indentLevel = indentLevels.get(i) ?? 0

        // Validate indent level
        if (!TypeCheckers.isValidIndentLevel(indentLevel)) {
          throw new HierarchyBuildingError(`Invalid indent level at line ${i}`, {
            lineIndex: i,
            indentLevel,
            indentLevelType: typeof indentLevel,
          })
        }

        // Process line content with validation
        const processedContent = ErrorUtils.safeExecuteSync(
          () => processLineContent(content, line.isHeader),
          FieldFormattingError,
          { processorType: 'StandardMarkdown', step: 'lineContentProcessing', lineIndex: i },
        )

        // Add line with proper indentation
        builder.addLine(processedContent, indentLevel)
      }

      return builder.toString()
    } catch (error) {
      if (
        error instanceof FieldFormattingError ||
        error instanceof HierarchyBuildingError ||
        error instanceof InvalidInputError
      ) {
        throw error
      }

      throw new FieldFormattingError(
        `Standard markdown processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          processorType: 'StandardMarkdown',
          inputLength: getSafeLength(input),
          originalError: error instanceof Error ? error.name : 'Unknown',
        },
      )
    }
  }
}
