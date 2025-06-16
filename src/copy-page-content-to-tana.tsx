import { Clipboard, BrowserExtension, Toast, showToast } from '@raycast/api'
import { exec } from 'child_process'
import { promisify } from 'util'
import {
  PageInfo,
  withTimeout,
  extractPageMetadata,
  extractMainContent,
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
 * Get best available browser tab information with improved detection
 */
async function getBestAvailableTab(): Promise<{
  url: string
  tabId: number
  title?: string
} | null> {
  try {
    console.log('🔍 Getting browser tabs via Browser Extension API...')

    const tabs = await withTimeout(BrowserExtension.getTabs(), 6000, 'Getting browser tabs')
    console.log(`🔍 Found ${tabs?.length || 0} tabs`)

    if (!tabs || tabs.length === 0) {
      throw new Error(
        'Could not access browser tabs. Please ensure Raycast has permission to access your browser.',
      )
    }

    // Log all tabs for debugging
    tabs.forEach((tab, index) => {
      console.log(
        `🔍 Tab ${index}: ${tab.active ? '[ACTIVE]' : '[INACTIVE]'} "${tab.title}" - ${tab.url}`,
      )
    })

    // Strategy 1: Look for active tab first
    let selectedTab = tabs.find((tab) => tab.active)
    if (selectedTab) {
      console.log(`✅ Using active tab: "${selectedTab.title}"`)
      return {
        url: selectedTab.url,
        tabId: selectedTab.id,
        title: selectedTab.title,
      }
    }

    // Strategy 2: Look for the most recently opened tab (highest ID)
    // Tabs are usually ordered with newer tabs having higher IDs
    const sortedTabs = [...tabs].sort((a, b) => b.id - a.id)
    selectedTab = sortedTabs[0]

    if (selectedTab) {
      console.log(`✅ Using most recent tab: "${selectedTab.title}" (no active tab found)`)
      return {
        url: selectedTab.url,
        tabId: selectedTab.id,
        title: selectedTab.title,
      }
    }

    throw new Error('No suitable tab found.')
  } catch (error) {
    console.log(`❌ Browser Extension API failed: ${error}`)
    throw error
  }
}

/**
 * Main command entry point
 */
export default async function Command() {
  const toast = await showToast({
    style: Toast.Style.Animated,
    title: 'Extracting Page Content',
  })

  try {
    // Get best available tab
    const activeTab = await getBestAvailableTab()
    if (!activeTab) {
      throw new Error('No suitable browser tab found')
    }

    toast.message = 'Getting page metadata...'

    // Extract metadata
    const metadata = await extractPageMetadata(activeTab.tabId, activeTab.url, activeTab.title)

    toast.message = 'Extracting main content...'

    // Extract main content using Raycast's reader mode
    const content = await extractMainContent(activeTab.tabId, activeTab.url)

    // Combine all info
    const pageInfo: PageInfo = {
      title: metadata.title || 'Web Page',
      url: metadata.url || activeTab.url,
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