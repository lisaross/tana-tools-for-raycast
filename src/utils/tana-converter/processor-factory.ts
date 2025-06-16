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
 * Processes the input text using the appropriate processor and returns Tana-formatted output.
 *
 * Selects the correct input processor based on the content and format of {@link input}, then transforms it for Tana.
 *
 * @param input - The input text to process.
 * @returns The processed output formatted for Tana.
 *
 * @throws {InvalidInputError} If the input is empty or invalid.
 * @throws {ProcessorSelectionError} If no suitable processor can be selected.
 * @throws {TranscriptProcessingError} If an error occurs during transcript processing.
 * @throws {HierarchyBuildingError} If building the output hierarchy fails.
 */
export function processInput(input: string): string {
  // Create and validate processor
  const processor = InputProcessorFactory.createProcessor(input)

  // Process the input - error handling is done by individual processors
  return processor.process(input)
}
