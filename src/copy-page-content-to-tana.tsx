import { Clipboard, BrowserExtension, Toast, showToast } from '@raycast/api'
import { exec } from 'child_process'
import { promisify } from 'util'
import {
  PageInfo,
  getActiveTabContent,
  extractPageMetadata,
  formatForTanaMarkdown,
} from './utils/page-content-extractor'

const execAsync = promisify(exec)

/**
 * Enhanced Copy Page Content to Tana
 *
 * Uses the Raycast Browser Extension's reader mode to extract clean content,
 * then applies comprehensive metadata extraction and proper hierarchical formatting.
 *
 * FEATURES:
 * - Leverages Raycast's built-in reader mode for intelligent content extraction
 * - Extracts rich metadata (title, description, author, URL)
 * - Converts headings to parent nodes (not Tana headings)
 * - Maintains proper content hierarchy under headings
 * - Automatically filters out ads, navigation, and other noise
 */


/**
 * Main command entry point
 */
export default async function Command() {
  const toast = await showToast({
    style: Toast.Style.Animated,
    title: 'Extracting Page Content',
  })

  try {
    // Get content and tab info from focused window's active tab
    const { content, tabInfo } = await getActiveTabContent()

    toast.message = 'Getting page metadata...'

    // Extract metadata
    const metadata = await extractPageMetadata(tabInfo.id, tabInfo.url, tabInfo.title)

    // Combine all info
    const pageInfo: PageInfo = {
      title: metadata.title || tabInfo.title || 'Web Page',
      url: metadata.url || tabInfo.url,
      description: metadata.description,
      author: metadata.author,
      content,
    }

    console.log(
      `🔍 Final page info - Title: "${pageInfo.title}", Content length: ${pageInfo.content.length}`,
    )

    toast.message = 'Converting to Tana format...'

    // Format for Tana (bypass complex converter)
    const tanaFormat = formatForTanaMarkdown(pageInfo)
    await Clipboard.copy(tanaFormat)

    // Open Tana and update toast to success
    try {
      await execAsync('open tana://')
      toast.style = Toast.Style.Success
      toast.title = 'Success!'
      toast.message = 'Page content copied to clipboard and Tana opened'
    } catch (error) {
      console.error('Error opening Tana:', error)
      toast.style = Toast.Style.Success
      toast.title = 'Success!'
      toast.message = 'Page content copied to clipboard (could not open Tana)'
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'

    toast.style = Toast.Style.Failure
    toast.title = 'Failed to extract page content'
    toast.message = errorMessage

    console.error('Page content extraction error:', error)
  }
}