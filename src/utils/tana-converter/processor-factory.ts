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
import { ErrorUtils } from './errors'

/**
 * Factory class for creating appropriate input processors
 */
export class InputProcessorFactory {
  /**
   * Create the appropriate processor based on input content
   * @param input The input text to analyze
   * @returns The appropriate processor for the input type
   * @throws {InvalidInputError} When input is invalid
   */
  static createProcessor(input: string): InputProcessor {
    // Validate input
    ErrorUtils.validateNotEmpty(input, 'input')

    // Check for Limitless Pendant transcription
    if (isLimitlessPendantTranscription(input)) {
      return new PendantTranscriptProcessor()
    }

    // Check for new transcription format (Limitless App)
    if (isNewTranscriptionFormat(input)) {
      return new LimitlessAppTranscriptProcessor()
    }

    // Check for YouTube transcript
    if (containsYouTubeTranscript(input)) {
      return new YouTubeTranscriptProcessor()
    }

    // Default to standard markdown processing
    return new StandardMarkdownProcessor()
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
  // Create and validate processor
  const processor = InputProcessorFactory.createProcessor(input)

  // Process the input - error handling is done by individual processors
  return processor.process(input)
}
