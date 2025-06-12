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

/**
 * Factory class for creating appropriate input processors
 */
export class InputProcessorFactory {
  /**
   * Create the appropriate processor based on input content
   * @param input The input text to analyze
   * @returns The appropriate processor for the input type
   */
  static createProcessor(input: string): InputProcessor {
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
 */
export function processInput(input: string): string {
  const processor = InputProcessorFactory.createProcessor(input)
  return processor.process(input)
} 