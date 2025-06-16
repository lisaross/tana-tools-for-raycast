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
import TurndownService from 'turndown'

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

interface PageInfo {
  title: string
  url: string
  description?: string
  author?: string
  content: string
}

/**
 * Timeout wrapper for Browser Extension API calls
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = 8000,
  operation: string = 'operation',
): Promise<T> {
  let timeoutId: NodeJS.Timeout

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${operation} timed out after ${timeoutMs}ms`))
    }, timeoutMs)
  })

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId)
  })
}

/**
 * Extract page metadata using targeted selectors
 */
async function extractPageMetadata(
  tabId: number,
  tabUrl: string,
  tabTitle?: string,
): Promise<Partial<PageInfo>> {
  try {
    console.log(`🔍 Extracting metadata from tab ${tabId}...`)

    // Extract title - prioritize clean title over tab title
    let title = 'Web Page'
    if (tabTitle && tabTitle.trim().length > 0) {
      title = tabTitle.trim()
      console.log(`✅ Using tab title: "${title}"`)
    }

    // Try to get a cleaner title from the page
    try {
      const pageTitle = await withTimeout(
        BrowserExtension.getContent({
          format: 'text',
          cssSelector: 'title',
          tabId: tabId,
        }),
        3000,
        'Getting page title',
      )

      if (pageTitle && pageTitle.trim().length > 0 && pageTitle.trim() !== title) {
        title = pageTitle.trim()
        console.log(`✅ Found cleaner title: "${title}"`)
      }
    } catch (error) {
      console.log(`❌ Could not extract page title: ${error}`)
    }

    // Extract description - try multiple selectors and methods
    let description: string | undefined
    const descriptionSelectors = [
      'meta[name="description"]',
      'meta[property="og:description"]',
      'meta[name="twitter:description"]',
    ]

    for (const selector of descriptionSelectors) {
      try {
        // Try to get the content attribute
        const metaDescription = await withTimeout(
          BrowserExtension.getContent({
            format: 'html',
            cssSelector: selector,
            tabId: tabId,
          }),
          3000,
          `Getting meta description via ${selector}`,
        )

        if (metaDescription && metaDescription.trim().length > 0) {
          // Extract content attribute from the meta tag HTML
          const contentMatch = metaDescription.match(/content=["']([^"']+)["']/i)
          if (contentMatch && contentMatch[1]) {
            description = contentMatch[1].trim()
            console.log(
              `✅ Found description via ${selector}: "${description.substring(0, 50)}..."`,
            )
            break
          }
        }
      } catch (error) {
        console.log(`❌ Selector ${selector} failed: ${error}`)
        continue
      }
    }

    // Extract author
    let author: string | undefined
    const authorSelectors = [
      'meta[name="author"]',
      'meta[property="article:author"]',
      '[rel="author"]',
      '.author',
      '.byline',
    ]

    for (const selector of authorSelectors) {
      try {
        const authorElement = await withTimeout(
          BrowserExtension.getContent({
            format: 'text',
            cssSelector: selector,
            tabId: tabId,
          }),
          2000,
          `Getting author via ${selector}`,
        )

        if (authorElement && authorElement.trim().length > 0 && authorElement.trim().length < 100) {
          author = authorElement.trim()
          console.log(`✅ Found author: "${author}" using selector: ${selector}`)
          break
        }
      } catch (error) {
        console.log(`❌ Author selector ${selector} failed: ${error}`)
        continue
      }
    }

    return {
      title,
      url: tabUrl,
      description,
      author,
    }
  } catch (error) {
    console.log(`❌ Metadata extraction failed: ${error}`)
    throw error
  }
}

/**
 * Convert relative URLs to absolute URLs
 */
function makeAbsoluteUrl(url: string, baseUrl: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }

  if (url.startsWith('/')) {
    // Relative to domain root
    const urlObj = new URL(baseUrl)
    return `${urlObj.protocol}//${urlObj.host}${url}`
  }

  // Relative to current path
  return new URL(url, baseUrl).href
}

/**
 * Fix broken markdown links and convert to Tana-clickable format
 */
function fixBrokenLinks(content: string, baseUrl: string = ''): string {
  const lines = content.split('\n')
  const result: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i].trim()

    // Check for start of a broken link pattern: line ending with just "["
    if (line === '[' || line.endsWith('- [')) {
      let linkText = ''
      let linkUrl = ''
      let linkComplete = false
      let j = i + 1

      // Look ahead to collect link text and URL
      while (j < lines.length && !linkComplete) {
        const nextLine = lines[j].trim()

        // Check if this line contains the URL part: ](url)
        const urlMatch = nextLine.match(/^\]\(([^)]+)\)(.*)$/)
        if (urlMatch) {
          linkUrl = urlMatch[1]
          const remaining = urlMatch[2].trim()
          linkComplete = true

          // Create the proper link format for Tana
          const baseIndent = lines[i].match(/^(\s*)/)?.[1] || ''
          if (linkText.trim() && linkUrl.trim()) {
            // Convert relative URLs to absolute URLs if we have a base URL
            const absoluteUrl = baseUrl ? makeAbsoluteUrl(linkUrl, baseUrl) : linkUrl

            // Format for Tana: Text [URL](URL)
            result.push(
              `${baseIndent}- ${linkText.trim()} [${absoluteUrl}](${absoluteUrl})${remaining ? ' ' + remaining : ''}`,
            )
          } else {
            // If we can't form a proper link, just add the text
            result.push(`${baseIndent}- ${linkText.trim()}${remaining ? ' ' + remaining : ''}`)
          }

          i = j + 1
          break
        } else {
          // Accumulate link text
          if (linkText) {
            linkText += ' ' + nextLine
          } else {
            linkText = nextLine
          }
          j++
        }
      }

      if (!linkComplete) {
        // If we couldn't complete the link, just add the original lines
        result.push(lines[i])
        i++
      }
    } else {
      // Regular line, just add it
      result.push(lines[i])
      i++
    }
  }

  return result.join('\n')
}

/**
 * Clean content to prevent accidental Tana field creation and other issues
 */
function cleanContentForTana(content: string, baseUrl: string = ''): string {
  // First fix broken links
  let cleanedContent = fixBrokenLinks(content, baseUrl)

  // Then apply other cleaning
  cleanedContent = cleanedContent
    .split('\n')
    .map((line) => {
      const cleanLine = line.trim()

      // Skip empty lines
      if (!cleanLine) return line

      // Remove javascript:void references that might have been missed
      if (cleanLine.includes('javascript:void')) {
        return ''
      }

      // Handle lines that might accidentally create fields due to :: syntax
      // Look for patterns like "Text:: followed by non-field content"
      const fieldMatch = cleanLine.match(/^(.+?)::(.*)$/)
      if (fieldMatch) {
        const [, , afterColon] = fieldMatch
        const trimmedAfter = afterColon.trim()

        // If the text after :: looks like it's not meant to be a field value
        // (starts with !, contains URLs, is very long, etc.), escape it
        if (
          trimmedAfter.startsWith('!') || // Alt text markers
          trimmedAfter.includes('http') || // URLs
          trimmedAfter.length > 100 || // Very long text
          trimmedAfter.includes('=') || // HTML attributes
          /\.(jpg|png|gif|webp|svg)/i.test(trimmedAfter) // Image references
        ) {
          // Escape the :: to prevent field creation
          return line.replace('::', '\\:')
        }
      }

      return line
    })
    .filter((line) => line.trim().length > 0 || line === '') // Keep structure but remove completely empty content
    .join('\n')

  return cleanedContent
}

/**
 * Extract main content using Raycast's reader mode
 */
async function extractMainContent(tabId: number, pageUrl: string = ''): Promise<string> {
  try {
    console.log(`🔍 Extracting main content using reader mode from tab ${tabId}...`)

    // Try to get markdown first
    let content = await withTimeout(
      BrowserExtension.getContent({
        format: 'markdown',
        tabId: tabId,
      }),
      10000,
      'Getting content via reader mode',
    )

    if (!content || content.trim().length === 0) {
      throw new Error('No content extracted from page')
    }

    // If the content looks like HTML (starts with < or contains HTML tags), convert it to markdown
    if (content.trim().startsWith('<') || /<[^>]+>/.test(content)) {
      console.log('⚠️ Content appears to be HTML, converting to markdown...')

      // Initialize Turndown service with optimized settings
      const turndownService = new TurndownService({
        headingStyle: 'atx',
        hr: '---',
        bulletListMarker: '-',
        codeBlockStyle: 'fenced',
        fence: '```',
        emDelimiter: '*',
        strongDelimiter: '**',
        linkStyle: 'inlined',
        linkReferenceStyle: 'full',
      })

      // Remove unwanted elements before conversion
      turndownService.remove(['script', 'style', 'meta', 'link', 'noscript'])

      // Add custom rule to remove SVG elements
      turndownService.addRule('removeSvg', {
        filter: (node: Element) => node.nodeName === 'SVG' || node.nodeName === 'PATH',
        replacement: () => '',
      })

      // Add custom rule to filter out javascript:void links and unwanted links
      turndownService.addRule('filterBadLinks', {
        filter: (node: Element) => {
          if (node.nodeName === 'A') {
            const href = node.getAttribute('href') || ''
            const text = (node.textContent || '').trim()

            // Filter out javascript:void links
            if (href.includes('javascript:void')) {
              return true
            }

            // Filter out generic "close" links
            if (text.toLowerCase() === 'close' && href.includes('javascript')) {
              return true
            }

            // Filter out empty or meaningless links
            if (text.length === 0 || href === '#' || href === '') {
              return true
            }
          }
          return false
        },
        replacement: () => '',
      })

      // Convert HTML to markdown
      content = turndownService.turndown(content)
      console.log(`✅ Converted HTML to markdown`)
    }

    if (!content || content.trim().length === 0) {
      throw new Error('No content extracted after processing')
    }

    // Clean up content to prevent accidental field creation
    content = cleanContentForTana(content, pageUrl)

    console.log(`✅ Extracted ${content.length} characters of clean content`)
    return content.trim()
  } catch (error) {
    console.log(`❌ Content extraction failed: ${error}`)
    throw error
  }
}

/**
 * Convert Tana format to use headings as parent nodes instead of !! headings
 * This processes the final Tana output to convert headings to regular parent nodes
 * and ensures all content stays properly nested under the Content:: field
 */
function convertTanaHeadersToParentNodes(tanaText: string): string {
  const lines = tanaText.split('\n')
  const result: string[] = []
  let insideContentField = false
  let contentFieldBaseIndent = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Check if we're entering the Content:: field
    if (line.includes('Content::')) {
      insideContentField = true
      contentFieldBaseIndent = (line.match(/^(\s*)/)?.[1]?.length || 0) + 2 // Base indent + 2 for field content
      result.push(line)
      continue
    }

    // Check if we're exiting the Content:: field (line with same or less indentation than Content:: field)
    if (insideContentField) {
      const currentIndent = line.match(/^(\s*)/)?.[1]?.length || 0
      const contentFieldIndent = contentFieldBaseIndent - 2 // The Content:: field itself indentation

      if (
        currentIndent <= contentFieldIndent &&
        line.trim().length > 0 &&
        !line.trim().startsWith('-')
      ) {
        insideContentField = false
      }
    }

    if (insideContentField && line.trim().length > 0) {
      // Ensure content lines have proper indentation under Content:: field
      const currentIndent = line.match(/^(\s*)/)?.[1]?.length || 0
      const minRequiredIndent = contentFieldBaseIndent

      let processedLine = line

      // Convert Tana headings to regular parent nodes
      const headingMatch = line.match(/^(\s*)- !! (.+)$/)
      if (headingMatch) {
        const [, indentation, headingText] = headingMatch
        processedLine = `${indentation}- ${headingText}`
      }

      // Ensure minimum indentation for content field
      if (currentIndent < minRequiredIndent) {
        const additionalSpaces = ' '.repeat(minRequiredIndent - currentIndent)
        processedLine = additionalSpaces + processedLine
      }

      result.push(processedLine)
    } else {
      // Convert headings outside content field
      const headingMatch = line.match(/^(\s*)- !! (.+)$/)
      if (headingMatch) {
        const [, indentation, headingText] = headingMatch
        result.push(`${indentation}- ${headingText}`)
      } else {
        result.push(line)
      }
    }
  }

  return result.join('\n')
}

/**
 * Format page info for Tana in structured format
 */
function formatForTanaMarkdown(pageInfo: PageInfo): string {
  let markdown = `# ${pageInfo.title} #swipe\n`
  markdown += `URL::${pageInfo.url}\n`

  if (pageInfo.description) {
    markdown += `Description::${pageInfo.description}\n`
  }

  if (pageInfo.author) {
    markdown += `Author::${pageInfo.author}\n`
  }

  // Add the content in a Content:: field
  markdown += `Content::\n`

  // Indent all content lines to be children of the Content:: field
  const contentLines = pageInfo.content.split('\n')
  const indentedContent = contentLines.map((line) => (line.trim() ? `  ${line}` : '')).join('\n')

  markdown += indentedContent

  return markdown
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
