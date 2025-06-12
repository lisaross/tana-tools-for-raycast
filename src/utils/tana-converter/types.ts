/**
 * Type definitions for the Tana converter
 */

/**
 * Represents different types of text elements that can be detected
 */
export type TextElement = {
  type: 'text' | 'url' | 'email' | 'lineBreak' | 'listItem' | 'header'
  content: string
  level?: number
}

/**
 * Represents a parsed line with its metadata
 */
export interface Line {
  content: string
  indent: number
  raw: string
  isHeader: boolean
  isCodeBlock: boolean
  isListItem: boolean
  isNumberedList: boolean
  isBulletPoint: boolean
  parent?: number
  originalIndent: number
}

/**
 * Date information parsed from text
 */
export interface ParsedDate {
  type: 'simple' | 'time' | 'week' | 'duration'
  value: string
  isProcessed?: boolean
}

/**
 * Configuration constants for the converter
 */
export const CONSTANTS = {
  /**
   * Maximum size for transcript chunks in characters.
   * This limit ensures that each chunk fits comfortably in Tana's input fields
   * while leaving room for formatting overhead.
   */
  MAX_TRANSCRIPT_CHUNK_SIZE: 7000,
  
  /**
   * Buffer size to account for Tana formatting overhead (%%tana%% header, bullets, indentation).
   * This is subtracted from the max chunk size to ensure the final formatted content
   * doesn't exceed the limit.
   */
  TRANSCRIPT_HEADER_BUFFER: 10,
  
  /**
   * Maximum number of words allowed in field keys to avoid false positives.
   * Field keys with more words are likely to be regular text, not field definitions.
   */
  MAX_FIELD_KEY_WORDS: 3,
  
  /**
   * Maximum number of words in field values for short value detection.
   * Short values are more likely to be proper field values rather than descriptions.
   */
  MAX_SHORT_FIELD_VALUE_WORDS: 3,
  
  /**
   * Maximum number of words in capitalized field values.
   * Capitalized values (like proper nouns) with few words are likely field values.
   */
  MAX_CAPITALIZED_FIELD_VALUE_WORDS: 5,
  
  /**
   * Minimum number of Limitless Pendant format lines required for detection.
   * This prevents false positives when only a few lines match the pattern.
   */
  MIN_PENDANT_FORMAT_LINES: 3,
  
  /**
   * Minimum number of speakers and timestamps required for new transcription format detection.
   * Both counts must meet this threshold to confidently identify the format.
   */
  MIN_TRANSCRIPTION_FORMAT_INDICATORS: 2,
  
  /**
   * Minimum week number (1-based, ISO 8601 standard).
   */
  MIN_WEEK_NUMBER: 1,
  
  /**
   * Maximum week number (ISO 8601 allows up to 53 weeks in a year).
   */
  MAX_WEEK_NUMBER: 53,
  
  /**
   * Zero-based index for root level in indentation hierarchy.
   * Used as the parent index for top-level items.
   */
  ROOT_INDENT_LEVEL: -1,
  
  /**
   * Base indentation level (zero-based).
   * Headers and top-level items start at this level.
   */
  BASE_INDENT_LEVEL: 0,
  
  /**
   * Increment for each indentation level.
   * Each nested level adds this value to the parent's indent level.
   */
  INDENT_LEVEL_INCREMENT: 1,
  
  /**
   * Increment for transcript chunk indentation relative to transcript field.
   * Chunks are indented this many levels deeper than the "Transcript::" field.
   */
  TRANSCRIPT_CHUNK_INDENT_INCREMENT: 1,
} as const

/**
 * Validation functions for constants
 */
export const VALIDATORS = {
  /**
   * Validates that buffer sizes are reasonable
   * @param bufferSize The buffer size to validate
   * @param maxSize The maximum chunk size
   * @throws Error if buffer size is invalid
   */
  validateBufferSize(bufferSize: number, maxSize: number): void {
    if (bufferSize < 0) {
      throw new Error('Buffer size cannot be negative')
    }
    if (bufferSize >= maxSize) {
      throw new Error(`Buffer size (${bufferSize}) must be less than max chunk size (${maxSize})`)
    }
    if (bufferSize > maxSize * 0.5) {
      throw new Error(`Buffer size (${bufferSize}) is too large relative to max chunk size (${maxSize})`)
    }
  },
  
  /**
   * Validates chunk size parameters
   * @param chunkSize The chunk size to validate
   * @throws Error if chunk size is invalid
   */
  validateChunkSize(chunkSize: number): void {
    if (chunkSize <= 0) {
      throw new Error('Chunk size must be positive')
    }
    if (chunkSize < 100) {
      throw new Error('Chunk size too small, minimum 100 characters required')
    }
    if (chunkSize > 50000) {
      throw new Error('Chunk size too large, maximum 50000 characters allowed')
    }
  },
  
  /**
   * Validates week number range
   * @param weekNumber The week number to validate
   * @throws Error if week number is invalid
   */
  validateWeekNumber(weekNumber: number): void {
    if (weekNumber < CONSTANTS.MIN_WEEK_NUMBER || weekNumber > CONSTANTS.MAX_WEEK_NUMBER) {
      throw new Error(`Week number must be between ${CONSTANTS.MIN_WEEK_NUMBER} and ${CONSTANTS.MAX_WEEK_NUMBER}`)
    }
  }
} as const
