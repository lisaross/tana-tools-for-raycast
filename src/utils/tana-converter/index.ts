/**
 * Main module for tana-converter
 * Provides functionality to convert markdown to Tana format
 */
import { processInput } from './processor-factory'

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

  // Use the strategy pattern to process the input
  return processInput(inputText)
}

// Re-export types that should be publicly available
export type { TextElement, Line, CONSTANTS } from './types'
