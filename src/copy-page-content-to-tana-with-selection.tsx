import {
  Clipboard,
  BrowserExtension,
  Toast,
  showToast,
  List,
  Action,
  ActionPanel,
} from '@raycast/api'
import { useState, useEffect } from 'react'
import { convertToTana } from './utils/tana-converter'
import { exec } from 'child_process'
import { promisify } from 'util'
import {
  PageInfo,
  withTimeout,
  extractPageMetadata,
  extractMainContent,
  convertTanaHeadersToParentNodes,
  formatForTanaMarkdown,
} from './utils/page-content-extractor'

const execAsync = promisify(exec)

/**
 * Enhanced Copy Page Content to Tana with Tab Selection
 *
 * Provides a list of available browser tabs for selection, then extracts clean content
 * using Raycast's reader mode and applies comprehensive metadata extraction.
 */

interface BrowserTab {
  id: number
  title: string
  url: string
  active: boolean
}

/**
 * Process selected tab and extract content
 */
async function processTab(selectedTab: BrowserTab) {
  const toast = await showToast({
    style: Toast.Style.Animated,
    title: 'Extracting Page Content',
    message: `Processing "${selectedTab.title}"...`,
  })

  try {
    toast.message = 'Getting page metadata...'

    // Extract metadata
    const metadata = await extractPageMetadata(selectedTab.id, selectedTab.url, selectedTab.title)

    toast.message = 'Extracting main content...'

    // Extract main content using Raycast's reader mode
    const content = await extractMainContent(selectedTab.id, selectedTab.url)

    // Combine all info
    const pageInfo: PageInfo = {
      title: metadata.title || 'Web Page',
      url: metadata.url || selectedTab.url,
      description: metadata.description,
      author: metadata.author,
      content,
    }

    console.log(
      `🔍 Final page info - Title: "${pageInfo.title}", Content length: ${pageInfo.content.length}`,
    )

    toast.message = 'Converting to Tana format...'

    // Format and convert to Tana
    const markdownFormat = formatForTanaMarkdown(pageInfo)
    const tanaFormat = convertToTana(markdownFormat)

    // Post-process to convert !! headings to regular parent nodes
    const finalTanaFormat = convertTanaHeadersToParentNodes(tanaFormat)
    await Clipboard.copy(finalTanaFormat)

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

/**
 * Get domain name from URL for display
 */
function getDomainFromUrl(url: string): string {
  try {
    const urlObj = new URL(url)
    return urlObj.hostname.replace('www.', '')
  } catch {
    return 'Unknown'
  }
}

/**
 * Main command component with tab selection
 */
export default function Command() {
  const [tabs, setTabs] = useState<BrowserTab[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadTabs() {
      try {
        console.log('🔍 Loading browser tabs...')
        const browserTabs = await withTimeout(
          BrowserExtension.getTabs(),
          6000,
          'Getting browser tabs',
        )

        if (!browserTabs || browserTabs.length === 0) {
          throw new Error(
            'No browser tabs found. Please ensure you have browser tabs open and Raycast has permission to access your browser.',
          )
        }

        console.log(`✅ Found ${browserTabs.length} tabs`)

        // Convert to our format and sort by active status and title
        const formattedTabs: BrowserTab[] = browserTabs
          .map((tab) => ({
            id: tab.id,
            title: tab.title || 'Untitled',
            url: tab.url || '',
            active: tab.active || false,
          }))
          .sort((a, b) => {
            // Active tabs first, then sort by title
            if (a.active && !b.active) return -1
            if (!a.active && b.active) return 1
            return a.title.localeCompare(b.title)
          })

        setTabs(formattedTabs)
        setError(null)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred'
        console.error('❌ Failed to load tabs:', errorMessage)
        setError(errorMessage)
      } finally {
        setIsLoading(false)
      }
    }

    loadTabs()
  }, [])

  if (error) {
    return (
      <List>
        <List.Item title="Error Loading Tabs" subtitle={error} icon="❌" />
      </List>
    )
  }

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search browser tabs...">
      {tabs.map((tab) => (
        <List.Item
          key={tab.id}
          title={tab.title}
          subtitle={getDomainFromUrl(tab.url)}
          accessories={[
            ...(tab.active ? [{ text: 'Active' }] : []),
            { text: getDomainFromUrl(tab.url) },
          ]}
          icon={tab.active ? '✅' : '🌐'}
          actions={
            <ActionPanel>
              <Action title="Extract Content to Tana" onAction={() => processTab(tab)} />
              <Action.OpenInBrowser
                title="Open in Browser"
                url={tab.url}
                shortcut={{ modifiers: ['cmd'], key: 'o' }}
              />
              <Action.CopyToClipboard
                title="Copy URL"
                content={tab.url}
                shortcut={{ modifiers: ['cmd'], key: 'c' }}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  )
}