/**
 * Transcript chunking utility functions for tana-converter
 * Provides reusable functions for chunking large transcript content
 */
import { CONSTANTS } from './types'

/**
 * Chunk transcript content into smaller pieces
 * @param content The transcript content to chunk (without Tana header)
 * @param maxSize Maximum size per chunk (accounting for headers and formatting)
 * @returns Array of content chunks (without Tana headers)
 */
export function chunkTranscriptContent(content: string, maxSize: number = CONSTANTS.MAX_TRANSCRIPT_CHUNK_SIZE): string[] {
  const maxContentSize = maxSize - 10 // Account for header and formatting overhead
  
  if (content.length <= maxContentSize) {
    return [content]
  }

  const chunks: string[] = []
  
  // Split content into chunks of appropriate size
  for (let i = 0; i < content.length; i += maxContentSize) {
    const end = Math.min(i + maxContentSize, content.length)
    const chunk = content.substring(i, end)
    chunks.push(chunk)
  }

  return chunks
}

/**
 * Generate Tana-formatted transcript output from chunks
 * @param chunks Array of transcript content chunks
 * @param indentLevel Number of indentation levels (0 = root level)
 * @returns Formatted Tana output string
 */
export function generateTranscriptOutput(chunks: string[], indentLevel: number = 0): string {
  if (chunks.length === 0) {
    return '%%tana%%\n'
  }

  let result = '%%tana%%\n'
  const indent = '  '.repeat(indentLevel)

  // Generate output for each chunk
  for (let i = 0; i < chunks.length; i += 1) {
    const chunkContent = chunks[i]
    
    if (i === 0) {
      // First chunk
      result += `${indent}- ${chunkContent}`
    } else {
      // Subsequent chunks
      result += `\n${indent}- ${chunkContent}`
    }
  }

  return result
}

/**
 * Generate hierarchical transcript output with nested chunks under a transcript field
 * @param chunks Array of transcript content chunks
 * @param transcriptIndent Indentation level for the "Transcript::" field
 * @param chunkIndent Indentation level for individual chunks (should be deeper than transcriptIndent)
 * @returns Formatted string with "Transcript::" field and nested chunks
 */
export function generateHierarchicalTranscriptOutput(
  chunks: string[], 
  transcriptIndent: number, 
  chunkIndent: number
): string {
  if (chunks.length === 0) {
    return ''
  }

  const transcriptIndentStr = '  '.repeat(transcriptIndent)
  const chunkIndentStr = '  '.repeat(chunkIndent)
  
  let result = `${transcriptIndentStr}- Transcript::\n`
  
  // Add each chunk as a nested item under the Transcript field
  for (const chunk of chunks) {
    result += `${chunkIndentStr}- ${chunk}\n`
  }

  return result
}

/**
 * Process and chunk transcript content for simple single-line format
 * Combines chunking and formatting for simple transcript cases
 * @param content Single-line transcript content
 * @param maxSize Maximum chunk size
 * @returns Complete Tana-formatted output
 */
export function processSimpleTranscript(content: string, maxSize: number = CONSTANTS.MAX_TRANSCRIPT_CHUNK_SIZE): string {
  const chunks = chunkTranscriptContent(content, maxSize)
  return generateTranscriptOutput(chunks)
} 