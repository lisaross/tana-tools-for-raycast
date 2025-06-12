/**
 * Main module for tana-converter
 * Provides functionality to convert markdown to Tana format
 */
import { processInput } from './processor-factory'
import { InvalidInputError, ErrorUtils, GeneralConverterError, TanaConverterError } from './errors'

/**
 * Convert markdown to Tana format
 *
 * Enhanced to properly indent content under headings without using Tana's heading format
 * and to correctly handle formatting from Claude's AI outputs
 *
 * @param inputText Markdown text to convert
 * @returns Tana-formatted text
 * @throws {InvalidInputError} When input validation fails
 * @throws {TanaConverterError} When conversion processing fails
 */
export function convertToTana(inputText: string | undefined | null): string {
  try {
    // Input validation
    if (inputText === null || inputText === undefined) {
      throw new InvalidInputError('Input text cannot be null or undefined')
    }

    if (typeof inputText !== 'string') {
      throw new InvalidInputError('Input must be a string', { 
        inputType: typeof inputText,
        inputValue: String(inputText)
      })
    }

    if (inputText.trim().length === 0) {
      return '%%tana%%\n- No text selected.'
    }

    // Additional input sanitization
    if (inputText.length > 1000000) { // 1MB limit
      throw new InvalidInputError('Input text is too large (maximum 1MB allowed)', {
        inputLength: inputText.length,
        maxLength: 1000000
      })
    }

    // Use the strategy pattern to process the input with error handling
    return ErrorUtils.safeExecuteSync(
      () => processInput(inputText),
      GeneralConverterError,
      { 
        inputLength: inputText.length,
        inputPreview: inputText.substring(0, 100) + (inputText.length > 100 ? '...' : '')
      }
    )

  } catch (error) {
    // Re-throw our custom errors as-is
    if (error instanceof TanaConverterError) {
      throw error
    }

    // Wrap unexpected errors
    throw new GeneralConverterError(
      `Unexpected error during conversion: ${error instanceof Error ? error.message : 'Unknown error'}`,
      {
        originalError: error instanceof Error ? error.name : 'Unknown',
        originalMessage: error instanceof Error ? error.message : String(error),
        inputLength: inputText?.length,
        inputPreview: inputText?.substring(0, 100) + (inputText && inputText.length > 100 ? '...' : '')
      }
    )
  }
}

// Re-export types that should be publicly available
export type { TextElement, Line, CONSTANTS } from './types'
