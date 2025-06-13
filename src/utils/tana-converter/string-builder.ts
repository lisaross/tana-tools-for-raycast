/**
 * StringBuilder utility for efficient string construction
 * Replaces string concatenation with array-based operations for better performance
 */

/**
 * StringBuilder class for efficient string building operations
 * Uses internal array to collect string parts and joins them at the end
 */
export class StringBuilder {
  private readonly lines: string[] = []

  /**
   * Add a line to the output
   * @param content Content to add
   * @param indent Number of indentation levels (0 = no indent)
   * @param prefix Optional prefix (defaults to "- " for Tana format)
   */
  addLine(content: string, indent: number = 0, prefix: string = '- '): void {
    const indentStr = '  '.repeat(indent)
    this.lines.push(`${indentStr}${prefix}${content}`)
  }

  /**
   * Add raw content without formatting
   * @param content Raw content to add
   */
  addRaw(content: string): void {
    this.lines.push(content)
  }

  /**
   * Add the Tana header (%%tana%%)
   */
  addTanaHeader(): void {
    this.lines.push('%%tana%%')
  }

  /**
   * Add multiple lines with the same indentation
   * @param contents Array of content strings
   * @param indent Number of indentation levels
   * @param prefix Optional prefix for each line
   */
  addLines(contents: string[], indent: number = 0, prefix: string = '- '): void {
    const indentStr = '  '.repeat(indent)
    for (const content of contents) {
      this.lines.push(`${indentStr}${prefix}${content}`)
    }
  }

  /**
   * Add an empty line
   */
  addEmptyLine(): void {
    this.lines.push('')
  }

  /**
   * Check if the builder is empty
   */
  isEmpty(): boolean {
    return this.lines.length === 0
  }

  /**
   * Get the number of lines
   */
  getLineCount(): number {
    return this.lines.length
  }

  /**
   * Get a preview of the first few lines (for debugging)
   * @param maxLines Maximum number of lines to return
   */
  getPreview(maxLines: number = 5): string[] {
    return this.lines.slice(0, maxLines)
  }

  /**
   * Clear all content
   */
  clear(): void {
    this.lines.length = 0
  }

  /**
   * Build the final string by joining all lines
   * @param separator Line separator (defaults to newline)
   */
  toString(separator: string = '\n'): string {
    return this.lines.join(separator)
  }

  /**
   * Build the final string and ensure it ends with a newline
   */
  toStringWithNewline(): string {
    const result = this.lines.join('\n')
    return result.endsWith('\n') ? result : result + '\n'
  }

  /**
   * Create a new StringBuilder with Tana header already added
   */
  static withTanaHeader(): StringBuilder {
    const builder = new StringBuilder()
    builder.addTanaHeader()
    return builder
  }

  /**
   * Utility method to join string arrays efficiently
   * @param parts Array of strings to join
   * @param separator Separator between parts
   */
  static join(parts: string[], separator: string = '\n'): string {
    return parts.join(separator)
  }
}

/**
 * Utility functions for efficient string operations
 */
export const StringUtils = {
  /**
   * Build indented Tana lines efficiently
   * @param contents Array of content strings
   * @param indent Number of indentation levels
   * @param prefix Line prefix (defaults to "- ")
   */
  buildTanaLines(contents: string[], indent: number = 0, prefix: string = '- '): string[] {
    const indentStr = '  '.repeat(indent)
    return contents.map(content => `${indentStr}${prefix}${content}`)
  },

  /**
   * Build a complete Tana output from content lines
   * @param contents Array of content strings
   * @param indent Base indentation level
   */
  buildTanaOutput(contents: string[], indent: number = 0): string {
    if (contents.length === 0) {
      return '%%tana%%\n'
    }

    const lines = ['%%tana%%', ...StringUtils.buildTanaLines(contents, indent)]
    return lines.join('\n')
  },

  /**
   * Efficiently concatenate template literal parts
   * @param template Template function that returns string parts
   */
  template(template: () => string[]): string {
    return template().join('')
  }
} as const 