import { BrowserExtension } from '@raycast/api'
import TurndownService from 'turndown'

/**
 * Shared utilities for page content extraction and processing
 */

export interface PageInfo {
  title: string
  url: string
  description?: string
  author?: string
  content: string
}

/**
 * Timeout wrapper for Browser Extension API calls
 */
export async function withTimeout<T>(
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
 * Get active tab content and metadata using the most reliable approach
 * Uses getContent() without tabId to target the focused window's active tab
 */
export async function getActiveTabContent(): Promise<{
  content: string
  tabInfo: { id: number; url: string; title: string }
}> {
  try {
    console.log('🔍 Getting content from active tab of focused window...')

    // Step 1: Get title from focused tab to identify it
    const focusedTabTitle = await withTimeout(
      BrowserExtension.getContent({
        format: 'text',
        cssSelector: 'title',
      }),
      3000,
      'Getting focused tab title',
    ).catch(() => '')

    console.log(`🔍 Focused tab title: "${focusedTabTitle}"`)

    // Step 2: Get all tabs and find the one that matches our focused tab
    const tabs = await withTimeout(
      BrowserExtension.getTabs(),
      6000,
      'Getting browser tabs',
    )

    if (!tabs || tabs.length === 0) {
      throw new Error('Could not access browser tabs')
    }

    // Find the tab that matches our focused tab title
    let targetTab = tabs.find(tab => tab.title === focusedTabTitle)
    
    if (!targetTab) {
      // Fallback: try partial match
      targetTab = tabs.find(tab => 
        tab.title && focusedTabTitle && 
        (tab.title.includes(focusedTabTitle.substring(0, 10)) || 
         focusedTabTitle.includes(tab.title.substring(0, 10)))
      )
    }
    
    if (!targetTab) {
      // Last fallback: use the most recent tab (highest ID)
      const sortedTabs = [...tabs].sort((a, b) => b.id - a.id)
      targetTab = sortedTabs[0]
    }

    if (!targetTab) {
      throw new Error('Could not identify target tab')
    }

    console.log(`✅ Target tab identified: "${targetTab.title}" - ${targetTab.url}`)

    // Step 3: Use the EXACT same approach as tab selection - extractMainContent + extractPageMetadata
    const [content, metadata] = await Promise.all([
      extractMainContent(targetTab.id, targetTab.url),
      extractPageMetadata(targetTab.id, targetTab.url, targetTab.title),
    ])

    return {
      content,
      tabInfo: {
        id: targetTab.id,
        url: metadata.url || targetTab.url,
        title: metadata.title || targetTab.title || 'Untitled',
      },
    }
  } catch (error) {
    console.log(`❌ Active tab content extraction failed: ${error}`)
    throw error
  }
}

/**
 * Extract page metadata using targeted selectors
 */
export async function extractPageMetadata(
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
export function makeAbsoluteUrl(url: string, baseUrl: string): string {
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
export function fixBrokenLinks(content: string, baseUrl: string = ''): string {
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
        const urlMatch = nextLine.match(/^]\(([^)]+)\)(.*)$/)
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
export function cleanContentForTana(content: string, baseUrl: string = ''): string {
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

      // Remove image references (both !Image url and ![](url) formats)
      if (cleanLine.match(/^!.*https?:\/\//)) {
        return ''
      }

      // Note: :: escaping is now handled earlier in the pipeline
      // This section is kept for other content cleaning

      return line
    })
    .filter((line) => line.trim().length > 0 || line === '') // Keep structure but remove completely empty content
    .join('\n')

  return cleanedContent
}

/**
 * Extract main content using Raycast's reader mode
 */
export async function extractMainContent(tabId: number, pageUrl: string = ''): Promise<string> {
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

    // Unescape Raycast's escaped markdown syntax
    content = unescapeRaycastMarkdown(content)

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
export function convertTanaHeadersToParentNodes(tanaText: string): string {
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
 * Remove :: in content to prevent field creation (apply BEFORE Tana conversion)
 */
export function removeColonsInContent(content: string): string {
  return content
    .split('\n')
    .map((line) => {
      // Remove all :: to prevent any field creation in content
      return line.replace(/::/g, ':')
    })
    .join('\n')
}

/**
 * Unescape Raycast's escaped markdown syntax to get proper markdown
 */
export function unescapeRaycastMarkdown(content: string): string {
  return content
    .split('\n')
    .map((line) => {
      let unescapedLine = line
      
      // Unescape headings: \# -> #
      unescapedLine = unescapedLine.replace(/\\#/g, '#')
      
      // Unescape other common markdown escapes
      unescapedLine = unescapedLine.replace(/\\\*/g, '*')
      unescapedLine = unescapedLine.replace(/\\\_/g, '_')
      unescapedLine = unescapedLine.replace(/\\\[/g, '[')
      unescapedLine = unescapedLine.replace(/\\\]/g, ']')
      unescapedLine = unescapedLine.replace(/\\\./g, '.')
      
      // Note: Don't convert numbered sections here - TurndownService already handles <h2> -> ## conversion
      // We were double-processing and breaking the proper headings
      
      return unescapedLine
    })
    .join('\n')
}

/**
 * Detect if text is a Limitless Pendant transcription
 */
function isLimitlessPendantTranscription(text: string): boolean {
  const pendantFormatCount = text
    .split('\n')
    .filter((line) => line.match(/^>\s*\[(.*?)\]\(#startMs=\d+&endMs=\d+\):/)).length
  return pendantFormatCount >= 2 // At least 2 lines to consider it a transcript
}

/**
 * Detect if text is in the new Limitless App transcription format
 */
function isNewTranscriptionFormat(text: string): boolean {
  const lines = text.split('\n')
  const speakerCount = lines
    .map((line, i) => ({ line: line.trim(), index: i }))
    .filter(
      ({ line, index }) =>
        line && 
        index < lines.length - 1 && 
        !lines[index + 1].trim(),
    ).length

  const timestampCount = lines.filter((line) =>
    line
      .trim()
      .match(
        /(Yesterday|Today|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+\d{1,2}:\d{2}\s+(AM|PM)/,
      ),
  ).length

  return speakerCount >= 2 && timestampCount >= 2
}

/**
 * Process a Limitless Pendant transcription into a single line for chunking
 */
function processLimitlessPendantTranscriptToSingleLine(text: string): string {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .filter((line) => line.startsWith('>'))
    .map((line) => {
      const match = line.match(/^>\s*\[(.*?)\]\(#startMs=(\d+)&endMs=\d+\):\s*(.*?)$/)
      if (!match) return line
      const [, speaker, , content] = match
      return `${speaker}: ${content}`
    })
    .filter((processedContent) => processedContent !== '')
    .join(' ')
}

/**
 * Process a Limitless App transcription into a single line with timestamps removed
 */
function processLimitlessAppTranscriptToSingleLine(text: string): string {
  const lines = text.split('\n')
  const combinedContent: string[] = []
  let currentSpeaker = ''
  let contentParts: string[] = []

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim()
    if (!line) continue

    // Check if this is a speaker line (followed by empty line)
    if (i < lines.length - 1 && !lines[i + 1].trim()) {
      if (currentSpeaker && contentParts.length > 0) {
        combinedContent.push(`${currentSpeaker}: ${contentParts.join(' ')}`)
        contentParts = []
      }
      currentSpeaker = line
      continue
    }

    // Skip timestamp lines
    if (
      line.match(
        /(Yesterday|Today|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+\d{1,2}:\d{2}\s+(AM|PM)/,
      )
    ) {
      continue
    }

    contentParts.push(line)
  }

  if (currentSpeaker && contentParts.length > 0) {
    combinedContent.push(`${currentSpeaker}: ${contentParts.join(' ')}`)
  }

  return combinedContent.join(' ')
}

/**
 * Chunk transcript content into smaller pieces for Tana
 */
function chunkTranscriptContent(content: string, maxChunkSize: number = 7000): Array<{ content: string }> {
  if (content.length <= maxChunkSize) {
    return [{ content }]
  }

  const words = content.split(' ')
  const chunks: Array<{ content: string }> = []
  let currentChunk = ''

  for (const word of words) {
    if (currentChunk.length + word.length + 1 > maxChunkSize && currentChunk.length > 0) {
      chunks.push({ content: currentChunk.trim() })
      currentChunk = word
    } else {
      if (currentChunk.length > 0) {
        currentChunk += ' '
      }
      currentChunk += word
    }
  }

  if (currentChunk.length > 0) {
    chunks.push({ content: currentChunk.trim() })
  }

  return chunks
}

/**
 * General Tana formatting utility for different content types
 */
export function formatForTana(options: {
  title?: string
  url?: string
  description?: string
  author?: string
  content?: string
  lines?: string[]
  useSwipeTag?: boolean
}): string {
  let tanaText = '%%tana%%\n'
  
  // Check if we have content that might be a Limitless transcript
  const rawContent = options.content || (options.lines ? options.lines.join('\n') : '')
  
  // Handle Limitless transcripts
  if (rawContent && isLimitlessPendantTranscription(rawContent)) {
    const singleLineTranscript = processLimitlessPendantTranscriptToSingleLine(rawContent)
    const chunks = chunkTranscriptContent(singleLineTranscript)
    
    chunks.forEach((chunk) => {
      tanaText += `- ${chunk.content}\n`
    })
    return tanaText
  }
  
  if (rawContent && isNewTranscriptionFormat(rawContent)) {
    const singleLineTranscript = processLimitlessAppTranscriptToSingleLine(rawContent)
    const chunks = chunkTranscriptContent(singleLineTranscript)
    
    chunks.forEach((chunk) => {
      tanaText += `- ${chunk.content}\n`
    })
    return tanaText
  }
  
  // Handle different content types (existing logic)
  if (options.title) {
    // Page/structured content with metadata
    const swipeTag = options.useSwipeTag ? ' #swipe' : ''
    tanaText += `- ${options.title}${swipeTag}\n`
    
    if (options.url) {
      tanaText += `  - URL::${options.url}\n`
    }
    
    if (options.description) {
      tanaText += `  - Description::${options.description}\n`
    }
    
    if (options.author) {
      tanaText += `  - Author::${options.author}\n`
    }
    
    if (options.content) {
      tanaText += `  - Content::\n`
      const contentLines = options.content.split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => {
          const trimmedLine = line.trim()
          
          // Convert markdown headers to Tana headings and escape # symbols
          const headerMatch = trimmedLine.match(/^(#{1,6})\s+(.+)$/)
          let processedLine: string
          if (headerMatch) {
            const text = headerMatch[2]
            processedLine = `!! ${text}`
          } else {
            processedLine = trimmedLine.replace(/#/g, '\\#')
          }
          
          // Convert to bullet points under Content:: field
          if (processedLine.startsWith('- ')) {
            return `    ${processedLine}`
          }
          return `    - ${processedLine}`
        })
      
      tanaText += contentLines.join('\n')
    }
  } else if (options.lines && options.lines.length > 0) {
    // Simple lines-based content (selected text, etc.)
    const lines = options.lines.filter(line => line.trim().length > 0)
    
    if (lines.length === 1) {
      // Single line
      const escapedLine = lines[0].trim().replace(/#/g, '\\#')
      tanaText += `- ${escapedLine}\n`
    } else if (lines.length > 1) {
      // Multiple lines - first as parent, rest as children
      const escapedParent = lines[0].trim().replace(/#/g, '\\#')
      tanaText += `- ${escapedParent}\n`
      lines.slice(1).forEach(line => {
        const escapedLine = line.trim().replace(/#/g, '\\#')
        tanaText += `  - ${escapedLine}\n`
      })
    }
  }
  
  return tanaText
}

/**
 * Format page info for Tana in structured format (legacy wrapper)
 */
export function formatForTanaMarkdown(pageInfo: PageInfo): string {
  // IMPORTANT: Remove all :: in content BEFORE formatting to prevent field creation
  const cleanedContent = removeColonsInContent(pageInfo.content)
  
  return formatForTana({
    title: pageInfo.title,
    url: pageInfo.url,
    description: pageInfo.description,
    author: pageInfo.author,
    content: cleanedContent,
    useSwipeTag: true,
  })
}