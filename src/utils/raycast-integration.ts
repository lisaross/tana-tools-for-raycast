import { Clipboard, showHUD, Toast, showToast } from '@raycast/api'
import { exec } from 'child_process'
import { promisify } from 'util'
import { convertToTana } from './tana-converter'

const execAsync = promisify(exec)

/**
 * Error context for better error messages
 */
export interface ErrorContext {
  /** What type of content was being processed (e.g., 'YouTube video', 'webpage') */
  contentType: string
  /** Expected URL pattern (e.g., 'youtube.com/watch') */
  urlPattern?: string
}

/**
 * Copy content to clipboard and open Tana with user feedback
 * @param markdownContent Markdown content to convert to Tana format
 * @param successMessage Base success message
 * @returns Promise that resolves when complete
 */
export async function copyToTanaAndOpen(
  markdownContent: string,
  successMessage: string,
): Promise<void> {
  // Convert to Tana format and copy to clipboard
  const tanaFormat = convertToTana(markdownContent)
  await Clipboard.copy(tanaFormat)

  // Try to open Tana automatically
  try {
    await execAsync('open tana://')
    await showHUD(`${successMessage}. Opening Tana... ✨`)
  } catch (error) {
    console.error('Error opening Tana:', error)
    await showHUD(`${successMessage} (but couldn't open Tana) ✨`)
  }
}

/**
 * Show processing toast with step-by-step progress
 * @param title Main title of the processing
 * @param steps Steps being performed (will be joined with →)
 */
export async function showProcessingToast(title: string, steps: string[]): Promise<void> {
  await showToast({
    style: Toast.Style.Animated,
    title: title,
    message: steps.join(' → '),
  })
}

/**
 * Show user-friendly error messages with specific solutions based on context
 */
export async function showContextualError(error: unknown, context: ErrorContext): Promise<void> {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'

  // Check for specific error patterns and show helpful messages
  if (errorMessage.startsWith('UNSUPPORTED_BROWSER:')) {
    const browserName = errorMessage.replace('UNSUPPORTED_BROWSER:', '')
    await showToast({
      style: Toast.Style.Failure,
      title: '🌐 Unsupported Browser',
      message: `${browserName} is not supported. Please use Chrome, Arc, or Safari instead.`,
    })
  } else if (
    errorMessage.includes('Chrome only') ||
    errorMessage.includes('Chrome and Arc only') ||
    errorMessage.includes('Chrome, Arc, and Safari')
  ) {
    await showToast({
      style: Toast.Style.Failure,
      title: '🌐 Supported Browser Required',
      message:
        'This feature only works with Chrome, Arc, or Safari. Please switch to a supported browser.',
    })
  } else if (errorMessage.includes('Could not access browser tabs')) {
    await showToast({
      style: Toast.Style.Failure,
      title: '🔗 Browser Access Issue',
      message:
        'Could not access browser tabs. Please ensure Raycast has permission to access your browser.',
    })
  } else if (
    errorMessage.includes('No tab found') ||
    errorMessage.includes('No active') ||
    errorMessage.includes('tab found')
  ) {
    // Contextual tab not found messages
    const contentDescription = context.contentType || 'content'
    const urlRequirement = context.urlPattern ? ` (${context.urlPattern})` : ''

    await showToast({
      style: Toast.Style.Failure,
      title: `📄 No ${contentDescription} Found`,
      message: `Open a ${contentDescription}${urlRequirement} in Chrome, Arc, or Safari and make sure it's the active tab`,
    })
  } else if (errorMessage.includes('Could not extract') && context.urlPattern) {
    // URL extraction specific errors
    await showToast({
      style: Toast.Style.Failure,
      title: '🔗 Invalid URL',
      message: `Make sure you're on a valid ${context.contentType} page${context.urlPattern ? ` (${context.urlPattern})` : ''}`,
    })
  } else if (
    errorMessage.includes('No transcript available') ||
    errorMessage.includes('Transcript is disabled')
  ) {
    // YouTube-specific transcript errors
    await showToast({
      style: Toast.Style.Failure,
      title: '📄 No Transcript Available',
      message: "This video doesn't have captions/transcripts available",
    })
  } else if (errorMessage.includes('frontmost browser window')) {
    await showToast({
      style: Toast.Style.Failure,
      title: '🖥️ Supported Browser Not Active',
      message: `Make sure Chrome, Arc, or Safari is the frontmost window with a ${context.contentType} open`,
    })
  } else {
    // Generic error fallback
    await showToast({
      style: Toast.Style.Failure,
      title: '❌ Something Went Wrong',
      message: errorMessage.length > 100 ? errorMessage.substring(0, 100) + '...' : errorMessage,
    })
  }
}

/**
 * Common error contexts for different content types
 */
export const ERROR_CONTEXTS = {
  YOUTUBE: {
    contentType: 'YouTube video',
    urlPattern: 'youtube.com/watch',
  } as ErrorContext,

  WEBPAGE: {
    contentType: 'webpage',
  } as ErrorContext,

  GENERAL: {
    contentType: 'content',
  } as ErrorContext,
} as const
