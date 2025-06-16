/**
 * Transcript chunking utility functions for tana-converter
 * Provides reusable functions for chunking large transcript content
 */
import { CONSTANTS, VALIDATORS, TypeCheckers } from './types'
import { ChunkingError, ErrorUtils, InvalidInputError } from './errors'
import { StringBuilder } from './string-builder'

/**
 * Returns the length of a string or array, or 0 if the input is neither.
 *
 * @param value - The value whose length is to be determined.
 * @returns The length if {@link value} is a string or array; otherwise, 0.
 */
function getSafeLength(value: unknown): number {
  return typeof value === 'string' || Array.isArray(value)
    ? (value as string | unknown[]).length
    : 0
}

/**
 * Constants for chunking behavior
 */
const CHUNKING_CONSTANTS = {
  MAX_CHUNK_SIZE: 7000,
  MIN_CHUNK_SIZE: 1000,
  OVERLAP_SIZE: 200,
  SENTENCE_BOUNDARY_PATTERN: /[.!?]+\s+/g,
  WORD_BOUNDARY_PATTERN: /\s+/g,
} as const

/**
 * Type guard for valid chunk objects
 */
/**
 * Represents a chunk of transcript content with metadata
 * @interface TranscriptChunk
 * @property {string} content - The actual transcript text content for this chunk
 * @property {number} chunkNumber - The sequential number of this chunk (1-based)
 * @property {number} [totalChunks] - Total number of chunks in the transcript (optional)
 * @property {string} [estimatedDuration] - Estimated reading duration for this chunk (optional)
 * @property {number} [wordCount] - Number of words in this chunk (optional)
 */
interface TranscriptChunk {
  content: string
  chunkNumber: number
  totalChunks?: number
  estimatedDuration?: string
  wordCount?: number
}

/**
 * Determines whether the given object is a valid {@link TranscriptChunk}.
 *
 * Validates that the object is non-null, has a non-empty string `content`, and a `chunkNumber` of at least 1.
 *
 * @param obj - The object to check.
 * @returns True if the object meets the {@link TranscriptChunk} requirements; otherwise, false.
 */
function isValidTranscriptChunk(obj: unknown): obj is TranscriptChunk {
  if (typeof obj !== 'object' || obj === null) return false

  const chunk = obj as TranscriptChunk
  return (
    typeof chunk.content === 'string' &&
    chunk.content.trim().length > 0 &&
    typeof chunk.chunkNumber === 'number' &&
    chunk.chunkNumber >= 1
  )
}

/**
 * Estimates the reading duration for a given word count, assuming an average reading speed of 250 words per minute.
 *
 * @param wordCount - The number of words to estimate the reading duration for.
 * @returns A string representing the estimated duration in the format "X min Y sec", "X min", or "Y sec".
 *
 * @throws {ChunkingError} If {@link wordCount} is not a non-negative number.
 */
function estimateReadingDuration(wordCount: number): string {
  // Validate input
  if (!TypeCheckers.isNonNegativeNumber(wordCount)) {
    throw new ChunkingError('Word count must be a non-negative number', {
      wordCount,
      wordCountType: typeof wordCount,
    })
  }

  // Average reading speed: 250 words per minute
  const wordsPerMinute = 250
  const totalSeconds = Math.round((wordCount / wordsPerMinute) * 60)

  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  if (minutes === 0) {
    return `${seconds} sec`
  } else if (seconds === 0) {
    return `${minutes} min`
  } else {
    return `${minutes} min ${seconds} sec`
  }
}

/**
 * Counts the number of words in a string.
 *
 * Returns 0 if the input is not a non-empty string.
 *
 * @param text - The text to analyze.
 * @returns The count of words in {@link text}.
 */
function countWords(text: string): number {
  // Input validation
  if (!TypeCheckers.isNonEmptyString(text)) {
    return 0
  }

  // Split by whitespace and filter out empty strings
  return text
    .trim()
    .split(CHUNKING_CONSTANTS.WORD_BOUNDARY_PATTERN)
    .filter((word) => TypeCheckers.isNonEmptyString(word.trim())).length
}

/**
 * Finds the optimal position near a target index in the text to split, preferring sentence boundaries and falling back to word boundaries if necessary.
 *
 * @param text - The text in which to find a split point.
 * @param targetPosition - The character index near which to split.
 * @returns The character index at which to split the text.
 *
 * @throws {ChunkingError} If {@link text} is not a non-empty string or {@link targetPosition} is negative.
 */
function findBestSplitPoint(text: string, targetPosition: number): number {
  // Input validation
  if (!TypeCheckers.isNonEmptyString(text)) {
    throw new ChunkingError('Text must be a non-empty string for split point detection', {
      textType: typeof text,
      textLength: getSafeLength(text),
    })
  }

  if (!TypeCheckers.isNonNegativeNumber(targetPosition)) {
    throw new ChunkingError('Target position must be a non-negative number', {
      targetPosition,
      targetPositionType: typeof targetPosition,
    })
  }

  const textLength = text.length
  if (targetPosition >= textLength) {
    return textLength
  }

  // Look for sentence boundaries within a reasonable range
  const searchRange = Math.min(300, Math.floor(textLength * 0.1))
  const searchStart = Math.max(0, targetPosition - searchRange)
  const searchEnd = Math.min(textLength, targetPosition + searchRange)

  // Find sentence boundaries in the search range
  const searchText = text.slice(searchStart, searchEnd)
  const sentenceMatches = Array.from(
    searchText.matchAll(CHUNKING_CONSTANTS.SENTENCE_BOUNDARY_PATTERN),
  )

  if (sentenceMatches.length > 0) {
    // Find the sentence boundary closest to our target
    const targetRelative = targetPosition - searchStart

    let bestMatch = sentenceMatches[0]
    let bestDistance = Math.abs((bestMatch.index ?? 0) - targetRelative)

    for (const match of sentenceMatches) {
      const matchIndex = match.index ?? 0
      const distance = Math.abs(matchIndex - targetRelative)

      if (distance < bestDistance) {
        bestMatch = match
        bestDistance = distance
      }
    }

    // Return the position after the sentence boundary
    const matchIndex = bestMatch.index ?? 0
    const matchLength = bestMatch[0]?.length ?? 0
    return searchStart + matchIndex + matchLength
  }

  // If no sentence boundary found, look for word boundaries
  const words = searchText.split(CHUNKING_CONSTANTS.WORD_BOUNDARY_PATTERN)
  let currentPos = 0
  let bestWordSplit = searchStart

  for (const word of words) {
    const wordEnd = currentPos + word.length
    const wordCenter = currentPos + Math.floor(word.length / 2)

    if (
      Math.abs(searchStart + wordCenter - targetPosition) < Math.abs(bestWordSplit - targetPosition)
    ) {
      bestWordSplit = searchStart + wordEnd
    }

    currentPos = wordEnd + 1 // +1 for the space
  }

  return Math.min(bestWordSplit, textLength)
}

/**
 * Splits a transcript string into an array of manageable chunks, each not exceeding a specified maximum size.
 *
 * Chunks are created at optimal sentence or word boundaries to avoid awkward breaks, and each chunk includes metadata such as word count and estimated reading duration. Ensures that all chunks except the last meet a minimum size requirement. Throws a {@link ChunkingError} if the input is invalid or chunking fails.
 *
 * @param transcript - The complete transcript text to be chunked.
 * @param maxSize - The maximum allowed size (in characters) for each chunk. Defaults to {@link CHUNKING_CONSTANTS.MAX_CHUNK_SIZE}.
 * @returns An array of {@link TranscriptChunk} objects representing the split transcript.
 *
 * @throws {ChunkingError} If the input is not a non-empty string or if no valid chunks can be generated.
 */
export function chunkTranscriptContent(
  transcript: string,
  maxSize: number = CHUNKING_CONSTANTS.MAX_CHUNK_SIZE,
): TranscriptChunk[] {
  // Input validation with comprehensive checks
  if (!TypeCheckers.isNonEmptyString(transcript)) {
    throw new ChunkingError('Transcript must be a non-empty string', {
      transcriptType: typeof transcript,
      transcriptLength: getSafeLength(transcript),
    })
  }

  const transcriptLength = transcript.length

  // If transcript is small enough, return as single chunk
  if (transcriptLength <= maxSize) {
    const wordCount = countWords(transcript)
    const duration = estimateReadingDuration(wordCount)

    return [
      {
        content: transcript,
        chunkNumber: 1,
        totalChunks: 1,
        estimatedDuration: duration,
        wordCount,
      },
    ]
  }

  const chunks: TranscriptChunk[] = []
  let currentPosition = 0
  let chunkNumber = 1

  while (currentPosition < transcriptLength) {
    // Calculate target chunk end position
    const targetEnd = currentPosition + maxSize

    // Find the best split point
    const actualEnd = findBestSplitPoint(transcript, Math.min(targetEnd, transcriptLength))

    // Extract chunk content with validation
    let chunkContent = transcript.slice(currentPosition, actualEnd).trim()

    // Ensure minimum chunk size (except for the last chunk)
    if (chunkContent.length < CHUNKING_CONSTANTS.MIN_CHUNK_SIZE && actualEnd < transcriptLength) {
      // If chunk is too small, extend it
      const extendedEnd = findBestSplitPoint(
        transcript,
        currentPosition + CHUNKING_CONSTANTS.MIN_CHUNK_SIZE,
      )
      chunkContent = transcript.slice(currentPosition, extendedEnd).trim()
    }

    // Skip empty chunks
    if (!TypeCheckers.isNonEmptyString(chunkContent)) {
      currentPosition = actualEnd
      continue
    }

    // Calculate chunk metadata
    const wordCount = countWords(chunkContent)
    const duration = estimateReadingDuration(wordCount)

    // Create chunk object with validation
    const chunk: TranscriptChunk = {
      content: chunkContent,
      chunkNumber,
      estimatedDuration: duration,
      wordCount,
    }

    // Validate chunk before adding
    if (!isValidTranscriptChunk(chunk)) {
      throw new ChunkingError(`Generated invalid chunk at position ${currentPosition}`, {
        chunkNumber,
        chunkContentType: typeof (chunk as Record<string, unknown>)?.content,
        chunkContentLength: getSafeLength((chunk as Record<string, unknown>)?.content),
      })
    }

    chunks.push(chunk)

    // Move to next position with no overlap - clean cuts between chunks
    currentPosition = actualEnd
    chunkNumber += 1
  }

  // Add total chunks count to all chunks
  const totalChunks = chunks.length
  chunks.forEach((chunk) => {
    chunk.totalChunks = totalChunks
  })

  // Final validation
  if (chunks.length === 0) {
    throw new ChunkingError('Failed to generate any valid chunks', {
      transcriptLength,
      transcriptPreview: transcript.substring(0, 100),
    })
  }

  return chunks
}

/**
 * Generates a Tana-formatted string representation of transcript chunks.
 *
 * Formats one or more transcript chunks into a structured output suitable for Tana, including word counts and estimated reading durations. For multiple chunks, includes an overview and individual part breakdowns.
 *
 * @param chunks - Array of transcript chunks to format.
 * @returns The formatted transcript as a Tana-compatible string.
 *
 * @throws {ChunkingError} If the input is not a valid, non-empty array of transcript chunks or if formatting fails.
 */
export function generateTranscriptOutput(chunks: TranscriptChunk[]): string {
  // Input validation
  if (!Array.isArray(chunks)) {
    throw new ChunkingError('Chunks must be an array', {
      chunksType: typeof chunks,
    })
  }

  if (chunks.length === 0) {
    throw new ChunkingError('Chunks array cannot be empty', {
      chunksLength: 0,
    })
  }

  // Validate all chunks
  chunks.forEach((chunk, index) => {
    if (!isValidTranscriptChunk(chunk)) {
      throw new ChunkingError(`Invalid chunk at index ${index}`, {
        chunkIndex: index,
        chunkType: typeof chunk,
        hasContent: Boolean(chunk && typeof chunk === 'object' && 'content' in chunk),
      })
    }
  })

  try {
    const builder = StringBuilder.withTanaHeader()

    if (chunks.length === 1) {
      // Single chunk - simpler format
      const chunk = chunks[0]
      const wordCount = chunk.wordCount ?? countWords(chunk.content)
      const duration = chunk.estimatedDuration ?? estimateReadingDuration(wordCount)

      builder.addLine(`Transcript (${wordCount} words, ~${duration})`, 0)
      builder.addLine(chunk.content, 1)
    } else {
      // Multiple chunks - add overview and individual chunks
      const totalWords = chunks.reduce((sum, chunk) => {
        const words = chunk.wordCount ?? countWords(chunk.content)
        return sum + words
      }, 0)

      const totalDuration = estimateReadingDuration(totalWords)

      builder.addLine(
        `Transcript (${chunks.length} parts, ${totalWords} words, ~${totalDuration})`,
        0,
      )

      chunks.forEach((chunk) => {
        const wordCount = chunk.wordCount ?? countWords(chunk.content)
        const duration = chunk.estimatedDuration ?? estimateReadingDuration(wordCount)
        const totalChunks = chunk.totalChunks ?? chunks.length

        builder.addLine(`Part ${chunk.chunkNumber}/${totalChunks} (~${duration})`, 1)
        builder.addLine(chunk.content, 2)
      })
    }

    return builder.toString()
  } catch (error) {
    throw new ChunkingError(
      `Failed to generate transcript output: ${error instanceof Error ? error.message : 'Unknown error'}`,
      {
        chunksCount: chunks.length,
        originalError: error instanceof Error ? error.name : 'Unknown',
      },
    )
  }
}

/**
 * Generates a hierarchical Tana-formatted transcript output with configurable indentation.
 *
 * Formats transcript chunks into a hierarchical structure, allowing custom indentation levels for the transcript header and individual chunks. Includes word counts and estimated reading durations in the output.
 *
 * @param chunks - Array of transcript chunks to format.
 * @param transcriptIndent - Indentation level for the transcript header.
 * @param chunkIndent - Indentation level for each chunk; must be greater than {@link transcriptIndent}.
 * @returns The formatted Tana-compatible transcript string.
 *
 * @throws {ChunkingError} If input validation fails or output generation encounters an error.
 */
export function generateHierarchicalTranscriptOutput(
  chunks: TranscriptChunk[],
  transcriptIndent: number,
  chunkIndent: number,
): string {
  // Input validation
  if (!Array.isArray(chunks)) {
    throw new ChunkingError('Chunks must be an array', {
      chunksType: typeof chunks,
    })
  }

  if (chunks.length === 0) {
    throw new ChunkingError('Chunks array cannot be empty', {
      chunksLength: 0,
    })
  }

  // Validate indentation parameters
  VALIDATORS.validateIndentLevel(transcriptIndent)
  VALIDATORS.validateIndentLevel(chunkIndent)

  if (chunkIndent <= transcriptIndent) {
    throw new ChunkingError('Chunk indent must be greater than transcript indent', {
      transcriptIndent,
      chunkIndent,
    })
  }

  // Validate all chunks
  chunks.forEach((chunk, index) => {
    if (!isValidTranscriptChunk(chunk)) {
      throw new ChunkingError(`Invalid chunk at index ${index}`, {
        chunkIndex: index,
        chunkType: typeof chunk,
        hasContent: Boolean(chunk && typeof chunk === 'object' && 'content' in chunk),
      })
    }
  })

  try {
    const builder = new StringBuilder()

    if (chunks.length === 1) {
      // Single chunk - simpler format
      const chunk = chunks[0]
      const wordCount = chunk.wordCount ?? countWords(chunk.content)
      const duration = chunk.estimatedDuration ?? estimateReadingDuration(wordCount)

      builder.addLine(`Transcript (${wordCount} words, ~${duration})`, transcriptIndent)
      builder.addLine(chunk.content, chunkIndent)
    } else {
      // Multiple chunks - add overview and individual chunks
      const totalWords = chunks.reduce((sum, chunk) => {
        const words = chunk.wordCount ?? countWords(chunk.content)
        return sum + words
      }, 0)

      const totalDuration = estimateReadingDuration(totalWords)

      builder.addLine(
        `Transcript (${chunks.length} parts, ${totalWords} words, ~${totalDuration})`,
        transcriptIndent,
      )

      chunks.forEach((chunk) => {
        const wordCount = chunk.wordCount ?? countWords(chunk.content)
        const duration = chunk.estimatedDuration ?? estimateReadingDuration(wordCount)
        const totalChunks = chunk.totalChunks ?? chunks.length

        builder.addLine(`Part ${chunk.chunkNumber}/${totalChunks} (~${duration})`, chunkIndent)
        builder.addLine(chunk.content, chunkIndent + 1)
      })
    }

    return builder.toString()
  } catch (error) {
    throw new ChunkingError(
      `Failed to generate hierarchical transcript output: ${error instanceof Error ? error.message : 'Unknown error'}`,
      {
        chunksCount: chunks.length,
        transcriptIndent,
        chunkIndent,
        originalError: error instanceof Error ? error.name : 'Unknown',
      },
    )
  }
}

/**
 * Processes transcript content by chunking and formatting it into a Tana-compatible output.
 *
 * Combines transcript chunking and output generation for simple, single-line transcript content.
 *
 * @param content - The transcript text to process.
 * @param maxSize - The maximum allowed size for each chunk.
 * @returns The formatted transcript output suitable for Tana.
 *
 * @throws {InvalidInputError} If the input content is invalid.
 * @throws {ChunkingError} If chunking or formatting fails.
 */
export function processSimpleTranscript(
  content: string,
  maxSize: number = CONSTANTS.MAX_TRANSCRIPT_CHUNK_SIZE,
): string {
  try {
    // Input validation is handled by the called functions
    const chunks = ErrorUtils.safeExecuteSync(
      () => chunkTranscriptContent(content, maxSize),
      ChunkingError,
      { operation: 'chunkTranscriptContent', contentLength: content?.length },
    )

    return ErrorUtils.safeExecuteSync(() => generateTranscriptOutput(chunks), ChunkingError, {
      operation: 'generateTranscriptOutput',
      chunkCount: chunks.length,
    })
  } catch (error) {
    if (error instanceof InvalidInputError || error instanceof ChunkingError) {
      throw error
    }

    throw new ChunkingError(
      `Failed to process simple transcript: ${error instanceof Error ? error.message : 'Unknown error'}`,
      {
        contentLength: content?.length,
        maxSize,
        originalError: error instanceof Error ? error.name : 'Unknown',
      },
    )
  }
}
