/**
 * Factory for selecting the appropriate input processor strategy
 */
import {
  isLimitlessPendantTranscription,
  isNewTranscriptionFormat,
  containsYouTubeTranscript,
} from './transcript-processor'
import {
  InputProcessor,
  PendantTranscriptProcessor,
  LimitlessAppTranscriptProcessor,
  YouTubeTranscriptProcessor,
  StandardMarkdownProcessor,
} from './input-processors'
import { ProcessorSelectionError, ErrorUtils, InvalidInputError } from './errors'

/**
 * Factory class for creating appropriate input processors
 */
export class InputProcessorFactory {
  /**
   * Create the appropriate processor based on input content
   * @param input The input text to analyze
   * @returns The appropriate processor for the input type
   * @throws {InvalidInputError} When input is invalid
   * @throws {ProcessorSelectionError} When processor selection fails
   */
  static createProcessor(input: string): InputProcessor {
    try {
      // Validate input
      ErrorUtils.validateNotEmpty(input, 'input')

      // Check for Limitless Pendant transcription
      if (
        ErrorUtils.safeExecuteSync(
          () => isLimitlessPendantTranscription(input),
          ProcessorSelectionError,
          { processorType: 'PendantTranscript', inputLength: input.length },
        )
      ) {
        return new PendantTranscriptProcessor()
      }

      // Check for new transcription format (Limitless App)
      if (
        ErrorUtils.safeExecuteSync(() => isNewTranscriptionFormat(input), ProcessorSelectionError, {
          processorType: 'LimitlessApp',
          inputLength: input.length,
        })
      ) {
        return new LimitlessAppTranscriptProcessor()
      }

      // Check for YouTube transcript
      if (
        ErrorUtils.safeExecuteSync(
          () => containsYouTubeTranscript(input),
          ProcessorSelectionError,
          { processorType: 'YouTube', inputLength: input.length },
        )
      ) {
        return new YouTubeTranscriptProcessor()
      }

      // Default to standard markdown processing
      return new StandardMarkdownProcessor()
    } catch (error) {
      if (error instanceof InvalidInputError || error instanceof ProcessorSelectionError) {
        throw error
      }

      throw new ProcessorSelectionError(
        `Failed to select processor: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {
          inputLength: input?.length,
          inputPreview: input?.substring(0, 100) + (input && input.length > 100 ? '...' : ''),
          originalError: error instanceof Error ? error.name : 'Unknown',
        },
      )
    }
  }
}

/**
 * Convenience function for processing input with the appropriate strategy
 * @param input The input text to process
 * @returns Tana-formatted output
 * @throws {InvalidInputError} When input validation fails
 * @throws {ProcessorSelectionError} When processor selection fails
 * @throws {TranscriptProcessingError} When transcript processing fails
 * @throws {HierarchyBuildingError} When hierarchy building fails
 */
export function processInput(input: string): string {
  try {
    // Create and validate processor
    const processor = InputProcessorFactory.createProcessor(input)

    // Process with error handling
    return ErrorUtils.safeExecuteSync(() => processor.process(input), ProcessorSelectionError, {
      processorType: processor.constructor.name,
      inputLength: input.length,
      inputPreview: input.substring(0, 100) + (input.length > 100 ? '...' : ''),
    })
  } catch (error) {
    // Re-throw our custom errors
    if (error instanceof InvalidInputError || error instanceof ProcessorSelectionError) {
      throw error
    }

    // Wrap unexpected errors
    throw new ProcessorSelectionError(
      `Processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      {
        inputLength: input?.length,
        inputPreview: input?.substring(0, 100) + (input && input.length > 100 ? '...' : ''),
        originalError: error instanceof Error ? error.name : 'Unknown',
      },
    )
  }
}
