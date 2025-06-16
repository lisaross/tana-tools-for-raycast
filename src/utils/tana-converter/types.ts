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
 * Type guard to check if an object is a valid Line
 */
export function isValidLine(obj: unknown): obj is Line {
  if (typeof obj !== 'object' || obj === null) {
    return false
  }

  const line = obj as Record<string, unknown>

  return (
    typeof line.content === 'string' &&
    typeof line.indent === 'number' &&
    typeof line.raw === 'string' &&
    typeof line.isHeader === 'boolean' &&
    typeof line.isCodeBlock === 'boolean' &&
    typeof line.isListItem === 'boolean' &&
    typeof line.isNumberedList === 'boolean' &&
    typeof line.isBulletPoint === 'boolean' &&
    typeof line.originalIndent === 'number' &&
    (line.parent === undefined || typeof line.parent === 'number')
  )
}

/**
 * Type guard to check if an array contains only valid Line objects
 */
export function isValidLineArray(arr: unknown): arr is Line[] {
  return Array.isArray(arr) && arr.every(isValidLine)
}

/**
 * Type guard for checking transcript format patterns
 */
export const TranscriptFormatCheckers = {
  /**
   * Check if text contains YouTube transcript markers
   */
  isYouTubeTranscript(text: unknown): text is string {
    return typeof text === 'string' && /\bTranscript:(?::|\s|\n)/i.test(text)
  },

  /**
   * Check if text contains Limitless Pendant format markers
   */
  isLimitlessPendantFormat(text: unknown): text is string {
    return typeof text === 'string' && /^>\s*\[(.*?)\]\(#startMs=\d+&endMs=\d+\):/.test(text)
  },

  /**
   * Check if text contains new transcription format markers (speaker names + timestamps)
   */
  isNewTranscriptionFormat(text: unknown): text is string {
    if (typeof text !== 'string') return false

    const lines = text.split('\n')
    const speakerPattern = /^\s*[A-Z][a-zA-Z\s]*\s*$/
    const timestampPattern =
      /(Yesterday|Today|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+\d{1,2}:\d{2}\s+(AM|PM)/

    // Pure functional approach: count speakers and timestamps separately
    const speakerCount = lines.filter((line) => speakerPattern.test(line.trim())).length
    const timestampCount = lines.filter((line) => timestampPattern.test(line.trim())).length

    return speakerCount >= 2 && timestampCount >= 2
  },

  /**
   * Check if text contains YouTube timestamp format
   */
  hasYouTubeTimestamps(text: unknown): text is string {
    return typeof text === 'string' && /\((\d{1,2}:\d{2}(?::\d{2})?)\)/.test(text)
  },
} as const

/**
 * Runtime type checking utilities
 */
export const TypeCheckers = {
  /**
   * Check if value is a non-empty string
   */
  isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0
  },

  /**
   * Check if value is a non-negative number
   */
  isNonNegativeNumber(value: unknown): value is number {
    return typeof value === 'number' && !isNaN(value) && value >= 0
  },

  /**
   * Check if value is a positive number
   */
  isPositiveNumber(value: unknown): value is number {
    return typeof value === 'number' && !isNaN(value) && value > 0
  },

  /**
   * Check if value is a non-empty array
   */
  isNonEmptyArray<T>(value: unknown): value is T[] {
    return Array.isArray(value) && value.length > 0
  },

  /**
   * Check if value is a valid indent level (non-negative integer)
   */
  isValidIndentLevel(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0
  },

  /**
   * Check if object has required string properties
   */
  hasRequiredStringProperties<T extends Record<string, unknown>>(
    obj: unknown,
    properties: string[],
  ): obj is T {
    if (typeof obj !== 'object' || obj === null) {
      return false
    }

    const record = obj as Record<string, unknown>
    return properties.every((prop) => typeof record[prop] === 'string')
  },
} as const

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
 * Validation functions for input parameters
 */
export const VALIDATORS = {
  /**
   * Validate chunk size parameter
   * @param size The chunk size to validate
   * @throws {Error} If size is invalid
   */
  validateChunkSize(size: unknown): void {
    if (!TypeCheckers.isPositiveNumber(size)) {
      throw new Error(`Invalid chunk size: ${size}. Must be a positive number.`)
    }

    if (size > 50000) {
      throw new Error(`Chunk size too large: ${size}. Maximum allowed is 50000 characters.`)
    }
  },

  /**
   * Validate buffer size parameter
   * @param buffer The buffer size to validate
   * @param maxSize The maximum size to compare against
   * @throws {Error} If buffer size is invalid
   */
  validateBufferSize(buffer: unknown, maxSize: unknown): void {
    if (!TypeCheckers.isNonNegativeNumber(buffer)) {
      throw new Error(`Invalid buffer size: ${buffer}. Must be a non-negative number.`)
    }

    if (!TypeCheckers.isPositiveNumber(maxSize)) {
      throw new Error(`Invalid max size: ${maxSize}. Must be a positive number.`)
    }

    if (buffer >= maxSize) {
      throw new Error(`Buffer size (${buffer}) must be smaller than max size (${maxSize}).`)
    }
  },

  /**
   * Validate indent level parameter
   * @param level The indent level to validate
   * @throws {Error} If level is invalid
   */
  validateIndentLevel(level: unknown): void {
    if (!TypeCheckers.isValidIndentLevel(level)) {
      throw new Error(`Invalid indent level: ${level}. Must be a non-negative integer.`)
    }

    if (level > 20) {
      throw new Error(`Indent level too deep: ${level}. Maximum allowed is 20 levels.`)
    }
  },

  /**
   * Validate that hierarchical lines array is valid
   * @param lines The lines array to validate
   * @throws {Error} If lines array is invalid
   */
  validateHierarchicalLines(lines: unknown): void {
    if (!Array.isArray(lines)) {
      throw new Error(`Expected array of lines, got: ${typeof lines}`)
    }

    if (!isValidLineArray(lines)) {
      throw new Error('Invalid hierarchical lines: array contains invalid Line objects')
    }
  },

  /**
   * Validate string content parameter
   * @param content The content to validate
   * @param paramName The parameter name for error messages
   * @throws {Error} If content is invalid
   */
  validateStringContent(content: unknown, paramName: string = 'content'): void {
    if (typeof content !== 'string') {
      throw new Error(`${paramName} must be a string, got: ${typeof content}`)
    }
  },

  /**
   * Validate non-empty string content parameter
   * @param content The content to validate
   * @param paramName The parameter name for error messages
   * @throws {Error} If content is invalid
   */
  validateNonEmptyStringContent(content: unknown, paramName: string = 'content'): void {
    this.validateStringContent(content, paramName)

    // After validating it's a string, check if it's non-empty
    if ((content as string).trim().length === 0) {
      throw new Error(`${paramName} cannot be empty or whitespace-only`)
    }
  },
} as const
