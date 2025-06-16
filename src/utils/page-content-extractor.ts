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
function unescapeRaycastMarkdown(content: string): string {
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
 * Format page info for Tana in structured format
 */
export function formatForTanaMarkdown(pageInfo: PageInfo): string {
  let markdown = `%%tana%%\n- ${pageInfo.title} #swipe\n`
  markdown += `  - URL::${pageInfo.url}\n`

  if (pageInfo.description) {
    markdown += `  - Description::${pageInfo.description}\n`
  }

  if (pageInfo.author) {
    markdown += `  - Author::${pageInfo.author}\n`
  }

  // Add the content in a Content:: field
  markdown += `  - Content::\n`

  // IMPORTANT: Remove all :: in content BEFORE formatting to prevent field creation
  const cleanedContent = removeColonsInContent(pageInfo.content)

  // Convert all content lines to flat bullet points under Content:: field
  const contentLines = cleanedContent.split('\n')
  const bulletContent = contentLines
    .filter((line) => line.trim().length > 0) // Remove empty lines
    .map((line) => {
      const trimmedLine = line.trim()
      
      // Process the line to handle special characters
      let processedLine = trimmedLine
      
      // Convert markdown headers to Tana headings to avoid unwanted tags
      // ## Header -> !! Header
      // ### Header -> !! Header  
      const headerMatch = processedLine.match(/^(#{1,6})\s+(.+)$/)
      if (headerMatch) {
        const text = headerMatch[2]
        processedLine = `!! ${text}`
      } else {
        // Escape any remaining # symbols to prevent unwanted tag creation
        processedLine = processedLine.replace(/#/g, '\\#')
      }
      
      // If line already starts with a bullet, just indent it
      if (processedLine.startsWith('- ')) {
        return `    ${processedLine}`
      }
      
      // Convert to bullet point and indent under Content:: field
      return `    - ${processedLine}`
    })
    .join('\n')

  markdown += bulletContent

  return markdown
}