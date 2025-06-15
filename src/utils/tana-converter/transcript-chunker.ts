/**
 * Transcript chunking utility functions for tana-converter
 * Provides reusable functions for chunking large transcript content
 */
import { CONSTANTS, VALIDATORS, TypeCheckers } from './types'
import { ChunkingError, ErrorUtils, InvalidInputError } from './errors'
import { StringBuilder } from './string-builder'

/**
 * Safe property access helper for transcript chunking
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
interface TranscriptChunk {
  content: string
  chunkNumber: number
  totalChunks?: number
  estimatedDuration?: string
  wordCount?: number
}

/**
 * Type guard to validate transcript chunk
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
 * Estimate reading duration based on word count
 * @param wordCount Number of words
 * @returns Duration string in format "X min Y sec"
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
 * Count words in text content
 * @param text Text to count words in
 * @returns Number of words
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
 * Find the best split point near a target position
 * @param text Text to find split point in
 * @param targetPosition Target character position to split near
 * @returns Best split position
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
 * Split transcript into manageable chunks with overlap
 * @param transcript Complete transcript text
 * @returns Array of transcript chunks
 */
export function chunkTranscriptContent(transcript: string): TranscriptChunk[] {
  // Input validation with comprehensive checks
  if (!TypeCheckers.isNonEmptyString(transcript)) {
    throw new ChunkingError('Transcript must be a non-empty string', {
      transcriptType: typeof transcript,
      transcriptLength: getSafeLength(transcript),
    })
  }

  const transcriptLength = transcript.length

  // If transcript is small enough, return as single chunk
  if (transcriptLength <= CHUNKING_CONSTANTS.MAX_CHUNK_SIZE) {
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
    const targetEnd = currentPosition + CHUNKING_CONSTANTS.MAX_CHUNK_SIZE

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
 * Generate Tana-formatted output for transcript chunks
 * @param chunks Array of transcript chunks
 * @returns Formatted Tana output string
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
 * Generate hierarchical Tana-formatted output for transcript within existing structure
 * @param chunks Array of transcript chunks
 * @param transcriptIndent Indentation level for transcript header
 * @param chunkIndent Indentation level for individual chunks
 * @returns Formatted Tana output string
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
 * Process and chunk transcript content for simple single-line format
 * Combines chunking and formatting for simple transcript cases
 * @param content Single-line transcript content
 * @param maxSize Maximum chunk size
 * @returns Complete Tana-formatted output
 * @throws {InvalidInputError} When input validation fails
 * @throws {ChunkingError} When processing fails
 */
export function processSimpleTranscript(
  content: string,
  maxSize: number = CONSTANTS.MAX_TRANSCRIPT_CHUNK_SIZE,
): string {
  try {
    // Input validation is handled by the called functions
    const chunks = ErrorUtils.safeExecuteSync(
      () => chunkTranscriptContent(content),
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
