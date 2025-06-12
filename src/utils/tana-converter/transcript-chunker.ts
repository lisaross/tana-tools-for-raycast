/**
 * Transcript chunking utility functions for tana-converter
 * Provides reusable functions for chunking large transcript content
 */
import { CONSTANTS, VALIDATORS } from './types'
import { ChunkingError, ErrorUtils, InvalidInputError } from './errors'

/**
 * Chunk transcript content into smaller pieces
 * @param content The transcript content to chunk (without Tana header)
 * @param maxSize Maximum size per chunk (accounting for headers and formatting)
 * @returns Array of content chunks (without Tana headers)
 * @throws {InvalidInputError} When input validation fails
 * @throws {ChunkingError} When chunking operation fails
 */
export function chunkTranscriptContent(content: string, maxSize: number = CONSTANTS.MAX_TRANSCRIPT_CHUNK_SIZE): string[] {
  try {
    // Input validation
    ErrorUtils.validateNotEmpty(content, 'content')
    
    if (typeof maxSize !== 'number' || maxSize <= 0) {
      throw new InvalidInputError('maxSize must be a positive number', { maxSize, maxSizeType: typeof maxSize })
    }

    // Validate parameters using existing validators
    ErrorUtils.safeExecuteSync(
      () => VALIDATORS.validateChunkSize(maxSize),
      ChunkingError,
      { operation: 'chunkSizeValidation', maxSize }
    )

    ErrorUtils.safeExecuteSync(
      () => VALIDATORS.validateBufferSize(CONSTANTS.TRANSCRIPT_HEADER_BUFFER, maxSize),
      ChunkingError,
      { operation: 'bufferSizeValidation', buffer: CONSTANTS.TRANSCRIPT_HEADER_BUFFER, maxSize }
    )
    
    const maxContentSize = maxSize - CONSTANTS.TRANSCRIPT_HEADER_BUFFER
    
    if (content.length <= maxContentSize) {
      return [content]
    }

    const chunks: string[] = []
    
    // Split content into chunks of appropriate size
    for (let i = 0; i < content.length; i += maxContentSize) {
      const end = Math.min(i + maxContentSize, content.length)
      const chunk = content.substring(i, end)
      
      if (chunk.length === 0) {
        throw new ChunkingError('Generated empty chunk during splitting', {
          chunkIndex: chunks.length,
          startIndex: i,
          endIndex: end,
          contentLength: content.length
        })
      }
      
      chunks.push(chunk)
    }

    if (chunks.length === 0) {
      throw new ChunkingError('No chunks generated from content', {
        contentLength: content.length,
        maxContentSize
      })
    }

    return chunks

  } catch (error) {
    if (error instanceof InvalidInputError || error instanceof ChunkingError) {
      throw error
    }

    throw new ChunkingError(
      `Failed to chunk transcript content: ${error instanceof Error ? error.message : 'Unknown error'}`,
      {
        contentLength: content?.length,
        maxSize,
        originalError: error instanceof Error ? error.name : 'Unknown'
      }
    )
  }
}

/**
 * Generate Tana-formatted transcript output from chunks
 * @param chunks Array of transcript content chunks
 * @param indentLevel Number of indentation levels (defaults to base level)
 * @returns Formatted Tana output string
 * @throws {InvalidInputError} When input validation fails
 * @throws {ChunkingError} When output generation fails
 */
export function generateTranscriptOutput(chunks: string[], indentLevel: number = CONSTANTS.BASE_INDENT_LEVEL): string {
  try {
    // Input validation
    ErrorUtils.validateNotEmptyArray(chunks, 'chunks')
    
    if (typeof indentLevel !== 'number' || indentLevel < 0) {
      throw new InvalidInputError('indentLevel must be a non-negative number', { 
        indentLevel, 
        indentLevelType: typeof indentLevel 
      })
    }

    if (chunks.length === 0) {
      return '%%tana%%\n'
    }

    let result = '%%tana%%\n'
    const indent = '  '.repeat(indentLevel)

    // Generate output for each chunk
    for (let i = 0; i < chunks.length; i += 1) {
      const chunkContent = chunks[i]
      
      if (typeof chunkContent !== 'string') {
        throw new ChunkingError('All chunks must be strings', {
          chunkIndex: i,
          chunkType: typeof chunkContent,
          chunkValue: String(chunkContent)
        })
      }
      
      if (i === 0) {
        // First chunk
        result += `${indent}- ${chunkContent}`
      } else {
        // Subsequent chunks
        result += `\n${indent}- ${chunkContent}`
      }
    }

    if (result === '%%tana%%\n') {
      throw new ChunkingError('Generated empty output after processing chunks', {
        chunkCount: chunks.length,
        indentLevel
      })
    }

    return result

  } catch (error) {
    if (error instanceof InvalidInputError || error instanceof ChunkingError) {
      throw error
    }

    throw new ChunkingError(
      `Failed to generate transcript output: ${error instanceof Error ? error.message : 'Unknown error'}`,
      {
        chunkCount: chunks?.length,
        indentLevel,
        originalError: error instanceof Error ? error.name : 'Unknown'
      }
    )
  }
}

/**
 * Generate hierarchical transcript output with nested chunks under a transcript field
 * @param chunks Array of transcript content chunks
 * @param transcriptIndent Indentation level for the "Transcript::" field
 * @param chunkIndent Indentation level for individual chunks (should be deeper than transcriptIndent)
 * @returns Formatted string with "Transcript::" field and nested chunks
 * @throws {InvalidInputError} When input validation fails
 * @throws {ChunkingError} When hierarchical output generation fails
 */
export function generateHierarchicalTranscriptOutput(
  chunks: string[], 
  transcriptIndent: number, 
  chunkIndent: number
): string {
  try {
    // Input validation
    ErrorUtils.validateNotEmptyArray(chunks, 'chunks')
    
    if (typeof transcriptIndent !== 'number' || transcriptIndent < 0) {
      throw new InvalidInputError('transcriptIndent must be a non-negative number', {
        transcriptIndent,
        transcriptIndentType: typeof transcriptIndent
      })
    }

    if (typeof chunkIndent !== 'number' || chunkIndent < 0) {
      throw new InvalidInputError('chunkIndent must be a non-negative number', {
        chunkIndent,
        chunkIndentType: typeof chunkIndent
      })
    }

    if (chunkIndent <= transcriptIndent) {
      throw new InvalidInputError('chunkIndent must be greater than transcriptIndent for proper hierarchy', {
        transcriptIndent,
        chunkIndent
      })
    }

    if (chunks.length === 0) {
      return ''
    }

    const transcriptIndentStr = '  '.repeat(transcriptIndent)
    const chunkIndentStr = '  '.repeat(chunkIndent)
    
    let result = `${transcriptIndentStr}- Transcript::\n`
    
    // Add each chunk as a nested item under the Transcript field
    for (let i = 0; i < chunks.length; i += 1) {
      const chunk = chunks[i]
      
      if (typeof chunk !== 'string') {
        throw new ChunkingError('All chunks must be strings', {
          chunkIndex: i,
          chunkType: typeof chunk,
          chunkValue: String(chunk)
        })
      }

      if (chunk.trim().length === 0) {
        throw new ChunkingError('Chunks cannot be empty or whitespace-only', {
          chunkIndex: i,
          chunkLength: chunk.length
        })
      }
      
      result += `${chunkIndentStr}- ${chunk}\n`
    }

    return result

  } catch (error) {
    if (error instanceof InvalidInputError || error instanceof ChunkingError) {
      throw error
    }

    throw new ChunkingError(
      `Failed to generate hierarchical transcript output: ${error instanceof Error ? error.message : 'Unknown error'}`,
      {
        chunkCount: chunks?.length,
        transcriptIndent,
        chunkIndent,
        originalError: error instanceof Error ? error.name : 'Unknown'
      }
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
export function processSimpleTranscript(content: string, maxSize: number = CONSTANTS.MAX_TRANSCRIPT_CHUNK_SIZE): string {
  try {
    // Input validation is handled by the called functions
    const chunks = ErrorUtils.safeExecuteSync(
      () => chunkTranscriptContent(content, maxSize),
      ChunkingError,
      { operation: 'chunkTranscriptContent', contentLength: content?.length, maxSize }
    )

    return ErrorUtils.safeExecuteSync(
      () => generateTranscriptOutput(chunks),
      ChunkingError,
      { operation: 'generateTranscriptOutput', chunkCount: chunks.length }
    )

  } catch (error) {
    if (error instanceof InvalidInputError || error instanceof ChunkingError) {
      throw error
    }

    throw new ChunkingError(
      `Failed to process simple transcript: ${error instanceof Error ? error.message : 'Unknown error'}`,
      {
        contentLength: content?.length,
        maxSize,
        originalError: error instanceof Error ? error.name : 'Unknown'
      }
    )
  }
} 