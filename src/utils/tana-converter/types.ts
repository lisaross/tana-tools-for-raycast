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
  MAX_TRANSCRIPT_CHUNK_SIZE: 7000,
}
