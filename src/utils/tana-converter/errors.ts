/**
 * Custom error types for the tana-converter
 * Provides specific error classes for different failure scenarios
 */

/**
 * Base class for all tana-converter errors
 */
export abstract class TanaConverterError extends Error {
  public readonly code: string
  public readonly context?: Record<string, unknown>

  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message)
    this.name = this.constructor.name
    this.code = code
    this.context = context

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }
  }

  /**
   * Get a user-friendly error message
   */
  getUserMessage(): string {
    return this.message
  }

  /**
   * Get technical details for debugging
   */
  getDebugInfo(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      stack: this.stack,
    }
  }
}

/**
 * Error thrown when input validation fails
 */
export class InvalidInputError extends TanaConverterError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'INVALID_INPUT', context)
  }

  getUserMessage(): string {
    return `Invalid input: ${this.message}`
  }
}

/**
 * Error thrown during transcript processing operations
 */
export class TranscriptProcessingError extends TanaConverterError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'TRANSCRIPT_PROCESSING', context)
  }

  getUserMessage(): string {
    return `Failed to process transcript: ${this.message}`
  }
}

/**
 * Error thrown when building hierarchical structure fails
 */
export class HierarchyBuildingError extends TanaConverterError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'HIERARCHY_BUILDING', context)
  }

  getUserMessage(): string {
    return `Failed to build content hierarchy: ${this.message}`
  }
}

/**
 * Error thrown during content chunking operations
 */
export class ChunkingError extends TanaConverterError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CHUNKING', context)
  }

  getUserMessage(): string {
    return `Failed to chunk content: ${this.message}`
  }
}

/**
 * Error thrown during field formatting operations
 */
export class FieldFormattingError extends TanaConverterError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'FIELD_FORMATTING', context)
  }

  getUserMessage(): string {
    return `Failed to format fields: ${this.message}`
  }
}

/**
 * Error thrown during date parsing and formatting
 */
export class DateFormattingError extends TanaConverterError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'DATE_FORMATTING', context)
  }

  getUserMessage(): string {
    return `Failed to format date: ${this.message}`
  }
}

/**
 * Error thrown when processor selection fails
 */
export class ProcessorSelectionError extends TanaConverterError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'PROCESSOR_SELECTION', context)
  }

  getUserMessage(): string {
    return `Failed to select appropriate processor: ${this.message}`
  }
}

/**
 * Error thrown when configuration validation fails
 */
export class ConfigurationError extends TanaConverterError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CONFIGURATION', context)
  }

  getUserMessage(): string {
    return `Configuration error: ${this.message}`
  }
}

/**
 * General converter error for unexpected failures
 */
export class GeneralConverterError extends TanaConverterError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'GENERAL_CONVERTER', context)
  }

  getUserMessage(): string {
    return `Conversion failed: ${this.message}`
  }
}

/**
 * Utility functions for error handling
 */
export const ErrorUtils = {
  /**
   * Wraps a function call with error handling
   * @param fn Function to execute
   * @param errorType Error type to throw on failure
   * @param context Additional context for error reporting
   * @returns Result of function execution
   */
  async safeExecute<T>(
    fn: () => T | Promise<T>,
    errorType: new (message: string, context?: Record<string, unknown>) => TanaConverterError,
    context?: Record<string, unknown>,
  ): Promise<T> {
    try {
      const result = await fn()
      return result
    } catch (error) {
      // If the error is already a TanaConverterError, preserve it to maintain error specificity
      if (error instanceof TanaConverterError) {
        throw error
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      throw new errorType(errorMessage, {
        ...context,
        originalError: error instanceof Error ? error.name : 'Unknown',
        originalStack: error instanceof Error ? error.stack : undefined,
      })
    }
  },

  /**
   * Synchronous version of safeExecute
   */
  safeExecuteSync<T>(
    fn: () => Exclude<T, Promise<unknown>>,
    errorType: new (message: string, context?: Record<string, unknown>) => TanaConverterError,
    context?: Record<string, unknown>,
  ): Exclude<T, Promise<unknown>> {
    try {
      const result = fn()
      // Runtime guard to ensure no Promises are accidentally returned
      if (result instanceof Promise) {
        throw new Error('safeExecuteSync received a Promise - use safeExecute for async operations')
      }
      return result
    } catch (error) {
      // If the error is already a TanaConverterError, preserve it to maintain error specificity
      if (error instanceof TanaConverterError) {
        throw error
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      throw new errorType(errorMessage, {
        ...context,
        originalError: error instanceof Error ? error.name : 'Unknown',
        originalStack: error instanceof Error ? error.stack : undefined,
      })
    }
  },

  /**
   * Validates that a value is not null or undefined
   */
  validateNotNull<T>(value: T | null | undefined, fieldName: string): T {
    if (value === null || value === undefined) {
      throw new InvalidInputError(`${fieldName} cannot be null or undefined`)
    }
    return value
  },

  /**
   * Validates that a string is not empty
   */
  validateNotEmpty(value: string, fieldName: string): string {
    if (typeof value !== 'string') {
      throw new InvalidInputError(`${fieldName} must be a string`)
    }
    if (value.trim().length === 0) {
      throw new InvalidInputError(`${fieldName} cannot be empty`)
    }
    return value
  },

  /**
   * Validates that an array is not empty
   */
  validateNotEmptyArray<T>(value: T[], fieldName: string): T[] {
    if (!Array.isArray(value)) {
      throw new InvalidInputError(`${fieldName} must be an array`)
    }
    if (value.length === 0) {
      throw new InvalidInputError(`${fieldName} cannot be empty`)
    }
    return value
  },
} as const
