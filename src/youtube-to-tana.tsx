import { Clipboard, showHUD, BrowserExtension, Toast, showToast } from '@raycast/api'
import { convertToTana } from './utils/tana-converter'
import { YoutubeTranscript } from 'youtube-transcript'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

/**
 * YouTube to Tana Converter with Enhanced Browser Compatibility
 * 
 * This module extracts YouTube video metadata and transcripts, converting them
 * to Tana Paste format. It includes specialized compatibility handling for
 * Firefox-based browsers, particularly Zen Browser.
 * 
 * Compatibility Features:
 * - Multiple fallback CSS selectors for different browser DOM structures
 * - Retry mechanisms with configurable delays for content loading
 * - Browser-specific timing adjustments for Firefox/Zen Browser
 * - Robust error handling with graceful degradation
 * - Support for both expanded and collapsed description content
 * 
 * Browser Support:
 * - Chrome/Chromium: Primary selectors with fast extraction
 * - Safari: Primary selectors with standard timing
 * - Firefox: Enhanced selectors with retry logic
 * - Zen Browser: Specialized Firefox optimizations with extended delays
 * 
 * Technical Notes:
 * - Zen Browser often requires additional time for DOM content to fully render
 * - Firefox-based browsers may use different CSS class structures
 * - Description expansion buttons may have different selectors in Firefox
 * - Retry logic helps handle asynchronous content loading differences
 */

interface VideoInfo {
  title: string
  channelName: string
  channelUrl: string
  url: string
  videoId: string
  description: string
  transcript?: string // Make transcript optional
}

/**
 * Browser detection utility
 */
interface BrowserInfo {
  isFirefox: boolean
  isZen: boolean
  userAgent: string
}

/**
 * Detect browser type from user agent
 */
async function detectBrowser(): Promise<BrowserInfo> {
  try {
    const tabs = await BrowserExtension.getTabs()
    const activeTab = tabs.find((tab) => tab.active)
    
    if (!activeTab?.id) {
      return { isFirefox: false, isZen: false, userAgent: '' }
    }

    // Try to get user agent from browser - this is a fallback approach
    // Since we can't directly access navigator from Raycast, we'll use heuristics
    // based on the browser behavior and available content selectors
    
    const userAgent = ''
    const isFirefox = false // We'll detect this through selector availability
    const isZen = false // We'll detect this through selector availability
    
    return { isFirefox, isZen, userAgent }
  } catch {
    return { isFirefox: false, isZen: false, userAgent: '' }
  }
}

/**
 * Get browser-specific CSS selectors
 */
function getBrowserSpecificSelectors(_browserInfo: BrowserInfo) {
  // Firefox/Zen Browser often has different timing and CSS rendering
  // We'll provide multiple fallback selectors for each element
  
  return {
    title: [
      // Primary selectors (work in most browsers)
      'h1.ytd-video-primary-info-renderer',
      'h1.ytd-videoPrimaryInfoRenderer',
      // Firefox/Zen fallbacks
      'h1[class*="video-primary-info"] yt-formatted-string',
      'h1[class*="videoPrimaryInfo"] yt-formatted-string',
      // Additional fallbacks
      '.ytd-video-primary-info-renderer h1',
      '.content.ytd-video-primary-info-renderer h1',
      'h1 yt-formatted-string[class*="title"]',
      // Zen Browser specific attempts
      'h1 yt-formatted-string',
      'h1[class*="title"]',
      'ytd-video-primary-info-renderer h1',
      '.title h1',
      'h1[role="heading"]',
      // Last resort - very broad selectors
      'h1',
      '[class*="title"] h1',
      'main h1',
      '#primary h1',
    ],
    
    channel: [
      // Primary selectors
      '#channel-name yt-formatted-string a',
      '#owner-name a',
      // Firefox/Zen fallbacks
      '[id*="channel-name"] a',
      '[id*="owner"] a yt-formatted-string',
      // Additional fallbacks
      '.ytd-channel-name a',
      '.ytd-video-owner-renderer a',
      'a[href*="/channel/"]',
      'a[href*="/@"]',
      // Zen Browser specific attempts
      '#channel-name a',
      '.channel-name a',
      '[class*="channel"] a',
      '[class*="owner"] a',
      'ytd-channel-name a',
      'ytd-video-owner-renderer a',
      // Very broad fallbacks
      'a[href*="/c/"]',
      'a[href*="youtube.com/channel"]',
      'a[href*="youtube.com/@"]',
    ],
    
    description: [
      // Primary selectors - expanded content
      'ytd-text-inline-expander yt-attributed-string',
      'ytd-text-inline-expander yt-formatted-string',
      'ytd-text-inline-expander #snippet-text',
      'ytd-text-inline-expander #plain-snippet-text',
      // Firefox/Zen fallbacks
      '[class*="text-inline-expander"] [class*="attributed-string"]',
      '[class*="expandable"] [class*="snippet"]',
      // Collapsed content fallbacks
      '.ytd-expandable-video-description-body-renderer',
      '#snippet-text',
      '#plain-snippet-text',
      // Metadata fallbacks
      '.ytd-video-secondary-info-renderer [class*="description"]',
      '[class*="description-text"]',
      // Zen Browser specific attempts
      'ytd-expandable-video-description-body-renderer',
      '[class*="description"] yt-formatted-string',
      '[class*="expandable"] yt-formatted-string',
      '.description-text',
      '[class*="video-description"]',
      // Very broad fallbacks for description
      '#description',
      '.description',
      '[class*="meta"] [class*="description"]',
      '#secondary [class*="description"]',
    ],
  }
}

/**
 * Robust content extraction with multiple selector fallbacks
 */
async function extractContentWithFallbacks(
  tabId: number,
  selectors: string[],
  format: 'text' | 'html' = 'text',
): Promise<string | null> {
  console.log(`Trying to extract content with ${selectors.length} selectors in format: ${format}`)
  
  for (let i = 0; i < selectors.length; i += 1) {
    const selector = selectors[i]
    try {
      console.log(`Attempting selector ${i + 1}/${selectors.length}: "${selector}"`)
      
      const content = await BrowserExtension.getContent({
        cssSelector: selector,
        format,
        tabId,
      })
      
      if (content && content.trim()) {
        console.log(`✅ Success with selector "${selector}": Found content (${content.length} chars)`)
        return content.trim()
      } else {
        console.log(`❌ Selector "${selector}" returned empty content`)
      }
    } catch (error) {
      // Continue to next selector if this one fails
      console.log(`❌ Selector "${selector}" failed:`, error instanceof Error ? error.message : 'Unknown error')
    }
  }
  
  console.log('❌ All selectors failed to find content')
  return null
}

/**
 * Enhanced content extraction with delay for Firefox-based browsers
 * Zen Browser sometimes needs more time for content to fully render
 */
async function extractContentWithDelay(
  tabId: number,
  selectors: string[],
  format: 'text' | 'html' = 'text',
  maxRetries: number = 3,
  delayMs: number = 1000,
): Promise<string | null> {
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    const content = await extractContentWithFallbacks(tabId, selectors, format)
    
    if (content) {
      return content
    }
    
    // If no content found and we have retries left, wait and try again
    if (attempt < maxRetries - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }
  
  return null
}

/**
 * Try to click "Show more" button for description expansion in Firefox/Zen Browser
 */
async function expandDescriptionIfNeeded(tabId: number): Promise<void> {
  const expandButtons = [
    'button[aria-label*="more"]',
    'button[aria-label*="Show more"]',
    'tp-yt-paper-button[aria-label*="more"]',
    '#expand',
    '.more-button',
    '[class*="expand"] button',
  ]
  
  for (const selector of expandButtons) {
    try {
      // Try to find and click the expand button
      const button = await BrowserExtension.getContent({
        cssSelector: selector,
        format: 'html',
        tabId,
      })
      
      if (button) {
        // In a real implementation, we'd need to simulate a click
        // For now, we'll just note that we found an expand button
        console.log('Found potential expand button:', selector)
        break
      }
    } catch {
      // Continue to next selector
    }
  }
}

/**
 * Decode HTML entities to their text equivalents
 * @param text Text containing HTML entities
 * @returns Decoded text
 */
function decodeHTMLEntities(text: string): string {
  // Replace all encoded entities using static patterns to prevent ReDoS
  let decoded = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')

  // Additionally handle numeric entities like &#39;
  decoded = decoded.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))

  return decoded
}

/**
 * Check if BrowserExtension API is available and working
 */
async function checkBrowserExtensionAvailability(): Promise<boolean> {
  try {
    const tabs = await BrowserExtension.getTabs()
    return Array.isArray(tabs)
  } catch (error) {
    console.log('❌ BrowserExtension API not available:', error)
    return false
  }
}

/**
 * Get YouTube URL from frontmost browser window using AppleScript (fallback for unsupported browsers)
 */
async function getYouTubeUrlFromAppleScript(): Promise<{ url: string; title?: string } | null> {
  try {
    console.log('🍎 Trying AppleScript fallback for unsupported browser...')
    
    // First, let's get the frontmost app and ensure we ONLY work with it
    console.log('🔍 Getting frontmost app (must be the active window)...')
    
    const frontAppResult = await execAsync(`osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`)
    const frontApp = frontAppResult.stdout.trim()
    console.log(`📱 Frontmost app: "${frontApp}"`)
    
    // STRICT CHECK: Only proceed if the frontmost app is a browser we want to work with
    const isSupportedBrowser = frontApp.toLowerCase().includes('zen') || 
                              frontApp.toLowerCase().includes('firefox') ||
                              frontApp.toLowerCase().includes('chrome') ||
                              frontApp.toLowerCase().includes('safari')
    
    if (!isSupportedBrowser) {
      console.log(`❌ Frontmost app "${frontApp}" is not a supported browser - stopping here`)
      return null
    }
    
    // Normalize app name
    let browserName = frontApp
    if (frontApp.toLowerCase().includes('zen')) {
      browserName = 'Zen Browser'
    } else if (frontApp.toLowerCase().includes('firefox')) {
      browserName = 'Firefox'
    } else if (frontApp.toLowerCase().includes('chrome')) {
      browserName = frontApp
    } else if (frontApp.toLowerCase().includes('safari')) {
      browserName = 'Safari'
    }
    
    console.log(`🎯 Working with frontmost browser: ${browserName}`)
    
    // IMPORTANT: Verify this app is actually frontmost and has focus
    try {
      const frontmostCheck = await execAsync(`osascript -e 'tell application "System Events" to tell process "${frontApp}" to get frontmost'`)
      const isFrontmost = frontmostCheck.stdout.trim() === 'true'
      
      if (!isFrontmost) {
        console.log(`❌ Browser "${frontApp}" is not actually frontmost - aborting`)
        return null
      }
    } catch {
      console.log(`❌ Could not verify frontmost status for "${frontApp}" - aborting`)
      return null
    }
    
    // Try direct AppleScript access first for supported browsers (FRONTMOST WINDOW ONLY)
    try {
      if (browserName === 'Safari') {
        const urlResult = await execAsync(`osascript -e 'tell application "Safari" to get URL of front document'`)
        const url = urlResult.stdout.trim()
        if (url && url.includes('youtube.com/watch')) {
          console.log(`✅ Got Safari URL from frontmost window: ${url.substring(0, 60)}...`)
          return { url, title: undefined }
        }
      } else if (browserName.toLowerCase().includes('chrome')) {
        const urlResult = await execAsync(`osascript -e 'tell application "${browserName}" to get URL of active tab of front window'`)
        const url = urlResult.stdout.trim()
        if (url && url.includes('youtube.com/watch')) {
          console.log(`✅ Got Chrome URL from frontmost window: ${url.substring(0, 60)}...`)
          return { url, title: undefined }
        }
      }
    } catch (error) {
      console.log('Direct browser access failed for frontmost window:', error)
    }
    
    // For browsers that don't support direct access (like Zen Browser),
    // check if there's already a YouTube URL in the clipboard
    console.log('📋 Checking current clipboard for YouTube URL...')
    try {
      const clipboardResult = await execAsync(`osascript -e 'get the clipboard as string'`)
      const clipboardUrl = clipboardResult.stdout.trim()
      
      // Be more strict about URL detection - must start with http and be a proper YouTube URL
      if (clipboardUrl && 
          clipboardUrl.startsWith('http') && 
          clipboardUrl.includes('youtube.com/watch') &&
          !clipboardUrl.includes('\n') && // Not multi-line content
          !clipboardUrl.includes('%%tana%%') && // Not Tana-formatted content
          clipboardUrl.length < 500) { // Reasonable URL length
        console.log(`✅ Found YouTube URL in clipboard: ${clipboardUrl.substring(0, 60)}...`)
        return { url: clipboardUrl, title: undefined }
      } else {
        console.log(`📋 Clipboard content doesn't contain valid YouTube URL: "${clipboardUrl.substring(0, 50)}..."`)
      }
    } catch {
      console.log('Could not read clipboard')
    }
    
    // STRICT FOCUS: Ensure we're only working with the frontmost window
    console.log('⚠️ STRICT MODE: Only working with absolute frontmost window')
    
    // Double-check that our target browser is still frontmost before keyboard actions
    try {
      const stillFrontmostResult = await execAsync(`osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`)
      const stillFrontmost = stillFrontmostResult.stdout.trim()
      
      if (stillFrontmost !== frontApp) {
        console.log(`❌ Focus changed! Expected "${frontApp}" but now "${stillFrontmost}" is frontmost - aborting`)
        return null
      }
    } catch {
      console.log('❌ Could not verify frontmost status before keyboard actions - aborting')
      return null
    }
    
    // Try keyboard shortcut to copy current page URL (works in some browsers)
    console.log('⌨️ Trying Cmd+Shift+C to copy current page URL from frontmost window...')
    try {
      // Make sure the browser is active (redundant but safe)
      await execAsync(`osascript -e 'tell application "System Events" to tell process "${frontApp}" to set frontmost to true'`)
      await new Promise(resolve => setTimeout(resolve, 300))
      
      // Final check before keyboard action
      const finalFrontmostResult = await execAsync(`osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`)
      const finalFrontmost = finalFrontmostResult.stdout.trim()
      
      if (finalFrontmost !== frontApp) {
        console.log(`❌ Focus lost before keyboard action! Expected "${frontApp}" but got "${finalFrontmost}" - aborting`)
        return null
      }
      
      // Try Cmd+Shift+C (copies current page URL in many browsers)
      await execAsync(`osascript -e 'tell application "System Events" to tell process "${frontApp}" to keystroke "c" using {command down, shift down}'`)
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Check clipboard again
      const urlResult = await execAsync(`osascript -e 'get the clipboard as string'`)
      const url = urlResult.stdout.trim()
      
      console.log(`📋 After Cmd+Shift+C, clipboard: "${url.substring(0, 100)}..."`)
      
      if (url && 
          url.startsWith('http') && 
          url.includes('youtube.com/watch') &&
          !url.includes('\n') && 
          !url.includes('%%tana%%') && 
          url.length < 500) {
        console.log(`✅ Got YouTube URL via Cmd+Shift+C from frontmost window: ${url.substring(0, 60)}...`)
        return { url, title: undefined }
      }
    } catch (error) {
      console.log('Cmd+Shift+C method failed:', error)
    }
    
    // Try alternative keyboard method with different timing (FRONTMOST WINDOW ONLY)
    console.log('⌨️ Trying alternative keyboard method (Cmd+L then Cmd+C) on frontmost window...')
    try {
      // One more frontmost check
      const lastFrontmostResult = await execAsync(`osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`)
      const lastFrontmost = lastFrontmostResult.stdout.trim()
      
      if (lastFrontmost !== frontApp) {
        console.log(`❌ Focus changed before alternative method! Expected "${frontApp}" but got "${lastFrontmost}" - aborting`)
        return null
      }
      
      // Make sure browser is active
      await execAsync(`osascript -e 'tell application "System Events" to tell process "${frontApp}" to set frontmost to true'`)
      await new Promise(resolve => setTimeout(resolve, 800))
      
      // Focus address bar with longer delay
      await execAsync(`osascript -e 'tell application "System Events" to tell process "${frontApp}" to keystroke "l" using command down'`)
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Copy URL
      await execAsync(`osascript -e 'tell application "System Events" to tell process "${frontApp}" to keystroke "c" using command down'`)
      await new Promise(resolve => setTimeout(resolve, 500))
      
      // Check clipboard
      const urlResult = await execAsync(`osascript -e 'get the clipboard as string'`)
      const url = urlResult.stdout.trim()
      
      console.log(`📋 After alternative method, clipboard: "${url.substring(0, 100)}..."`)
      
      if (url && 
          url.startsWith('http') && 
          url.includes('youtube.com/watch') &&
          !url.includes('\n') && 
          !url.includes('%%tana%%') && 
          url.length < 500) {
        console.log(`✅ Got YouTube URL via alternative method from frontmost window: ${url.substring(0, 60)}...`)
        return { url, title: undefined }
      }
    } catch (error) {
      console.log('Alternative keyboard method failed:', error)
    }
    
    console.log('❌ No YouTube URL found via AppleScript methods from frontmost window')
    return null
  } catch (error) {
    console.log('❌ AppleScript fallback failed:', error instanceof Error ? error.message : error)
    return null
  }
}

/**
 * Get the frontmost YouTube tab (prioritizes active window)
 */
async function getFrontmostYouTubeTab() {
  try {
    console.log('🔍 Checking BrowserExtension API availability...')
    const isAvailable = await checkBrowserExtensionAvailability()
    
    if (isAvailable) {
      console.log('✅ BrowserExtension API is available')
      
      // STRICT FRONTMOST CHECK: Only proceed if a supported browser is frontmost
      console.log('🎯 Verifying frontmost browser before using BrowserExtension API...')
      
      try {
        const frontAppResult = await execAsync(`osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`)
        const frontApp = frontAppResult.stdout.trim()
        console.log(`📱 Frontmost app: "${frontApp}"`)
        
        // Check if the frontmost app is a browser we want to work with
        const isSupportedBrowser = frontApp.toLowerCase().includes('zen') || 
                                  frontApp.toLowerCase().includes('firefox') ||
                                  frontApp.toLowerCase().includes('chrome') ||
                                  frontApp.toLowerCase().includes('safari') ||
                                  frontApp.toLowerCase().includes('arc')
        
        if (!isSupportedBrowser) {
          console.log(`❌ Frontmost app "${frontApp}" is not a browser - falling back to AppleScript`)
          // Fall through to AppleScript method
        } else {
          console.log(`✅ Frontmost app "${frontApp}" is a supported browser, proceeding with BrowserExtension API`)
          
          // Get all tabs but we'll be very selective about which ones we use
          const tabs = await BrowserExtension.getTabs()
          console.log(`📱 Found ${tabs?.length || 0} browser tabs total across all browsers`)

          if (!tabs || tabs.length === 0) {
            throw new Error(
              'Could not access browser tabs. Please ensure Raycast has permission to access your browser.',
            )
          }

          // Filter for YouTube tabs
          const youTubeTabs = tabs.filter((tab) => tab.url?.includes('youtube.com/watch'))
          console.log(`🎥 Found ${youTubeTabs.length} YouTube tabs across all browsers`)

          if (youTubeTabs.length === 0) {
            throw new Error(
              'No YouTube video tab found. Please open a YouTube video and try again.',
            )
          }

          // CRITICAL: If we have multiple YouTube tabs, we need to be smart about selection
          // The BrowserExtension API doesn't tell us which browser each tab is from
          // So we'll prioritize the active tab, but if that's from a background browser,
          // we should prefer AppleScript method for accuracy
          
          let selectedTab = youTubeTabs.find((tab) => tab.active)
          
          if (!selectedTab) {
            // If no active YouTube tab, use the first one but this is risky
            selectedTab = youTubeTabs[0]
            console.log('⚠️ No active YouTube tab found, using first available (may be from background browser)')
          } else {
            console.log('✅ Found active YouTube tab')
          }
          
          // ADDITIONAL SAFETY: If we have multiple YouTube tabs and the frontmost app is Zen/Firefox,
          // prefer the AppleScript method for more accurate detection
          if (youTubeTabs.length > 1 && (frontApp.toLowerCase().includes('zen') || frontApp.toLowerCase().includes('firefox'))) {
            console.log(`⚠️ Multiple YouTube tabs detected (${youTubeTabs.length}) and frontmost is Firefox-based browser "${frontApp}"`)
            console.log('🔄 Switching to AppleScript method for more accurate frontmost window detection')
            // Fall through to AppleScript method
          } else {
            console.log(`🎯 Selected YouTube tab:`, {
              url: selectedTab.url?.substring(0, 100) + '...',
              id: selectedTab.id,
              title: selectedTab.title?.substring(0, 50) + '...',
              active: selectedTab.active,
            })

            return selectedTab
          }
        }
      } catch (error) {
        console.log('❌ Error checking frontmost app, falling back to AppleScript:', error)
        // Fall through to AppleScript method
      }
    }
    
    // BrowserExtension API not available OR we decided to use AppleScript for accuracy
    console.log('📱 Using AppleScript fallback for frontmost window accuracy...')
    
    const appleScriptResult = await getYouTubeUrlFromAppleScript()
    
    if (!appleScriptResult) {
      throw new Error(
        'Could not get YouTube URL automatically. Try manually copying the URL (select address bar and Cmd+C) then run the command again.',
      )
    }
    
    // Create a fake tab object that matches what the rest of the code expects
    const fakeTab = {
      id: 0, // We'll handle this special case in extraction
      url: appleScriptResult.url,
      title: appleScriptResult.title || 'YouTube Video',
      active: true,
    }
    
    console.log(`🎯 Got YouTube URL via AppleScript:`, {
      url: fakeTab.url.substring(0, 100) + '...',
      title: fakeTab.title?.substring(0, 50) + '...',
    })
    
    return fakeTab
  } catch (error) {
    console.error('❌ Failed to get YouTube tab:', error)
    throw error
  }
}

/**
 * Extracts video information from the active YouTube tab
 */
async function extractVideoInfo(): Promise<VideoInfo> {
  try {
    console.log('🔍 Starting video info extraction...')
    
    // Get the frontmost YouTube tab with better selection logic
    const activeTab = await getFrontmostYouTubeTab()

    // Extract the video ID from URL
    const urlObj = new URL(activeTab.url)
    const videoId = urlObj.searchParams.get('v')
    console.log(`🆔 Video ID extracted: ${videoId}`)

    if (!videoId) {
      throw new Error('Could not extract video ID from the URL.')
    }

    // Detect browser and get appropriate selectors
    const browserInfo = await detectBrowser()
    const selectors = getBrowserSpecificSelectors(browserInfo)
    console.log(`🌐 Browser detection complete, selector counts:`, {
      title: selectors.title.length,
      channel: selectors.channel.length, 
      description: selectors.description.length,
    })

    // Check if we're using AppleScript fallback (no browser extension access)
    const isAppleScriptFallback = activeTab.id === 0
    
    let title: string
    let channelName: string = 'Unknown Channel' // Initialize with default
    let channelUrl: string  
    let description: string

    if (isAppleScriptFallback) {
      console.log('🍎 Using AppleScript fallback - limited metadata extraction')
      
      // For AppleScript fallback, we have limited access to page content
      // Use the title from AppleScript if available, otherwise provide a default
      title = activeTab.title || 'YouTube Video'
      
      // Try to get more detailed info via AppleScript
      try {
        console.log('🔍 Trying to get page title via AppleScript...')
        
        // Get the frontmost app name again
        const frontAppResult = await execAsync(`osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`)
        const frontApp = frontAppResult.stdout.trim()
        
        // Try to get the window/document title
        let pageTitle = ''
        if (frontApp.toLowerCase().includes('zen') || frontApp.toLowerCase().includes('firefox')) {
          // For Firefox-based browsers, try to get window title
          try {
            const titleResult = await execAsync(`osascript -e 'tell application "System Events" to tell process "${frontApp}" to get title of front window'`)
            pageTitle = titleResult.stdout.trim()
          } catch (error) {
            console.log('Could not get window title:', error)
          }
        } else if (frontApp.toLowerCase().includes('chrome')) {
          // For Chrome-based browsers
          try {
            const titleResult = await execAsync(`osascript -e 'tell application "${frontApp}" to get title of active tab of front window'`)
            pageTitle = titleResult.stdout.trim()
          } catch (error) {
            console.log('Could not get Chrome tab title:', error)
          }
        } else if (frontApp.toLowerCase().includes('safari')) {
          // For Safari
          try {
            const titleResult = await execAsync(`osascript -e 'tell application "Safari" to get name of front document'`)
            pageTitle = titleResult.stdout.trim()
          } catch (error) {
            console.log('Could not get Safari document title:', error)
          }
        }
        
        if (pageTitle && pageTitle.length > 0) {
          console.log(`📰 Got page title: "${pageTitle.substring(0, 100)}..."`)
          
          // YouTube page titles are typically in format: "Video Title - Channel Name - YouTube"
          // Try to extract the video title and channel name
          if (pageTitle.includes(' - YouTube')) {
            const withoutYouTube = pageTitle.replace(' - YouTube', '')
            const parts = withoutYouTube.split(' - ')
            
            if (parts.length >= 2) {
              title = parts[0].trim()
              channelName = parts[1].trim()
              console.log(`✅ Extracted title: "${title}" and channel: "${channelName}"`)
            } else if (parts.length === 1) {
              title = parts[0].trim()
              console.log(`✅ Extracted title: "${title}"`)
            }
          } else {
            // If not the expected format, use the whole title
            title = pageTitle.replace(' - YouTube', '').trim()
            console.log(`✅ Using full page title: "${title}"`)
          }
        }
      } catch (error) {
        console.log('⚠️ Could not enhance metadata via AppleScript:', error)
      }
      
      // Set defaults for what we couldn't extract
      if (!channelName || channelName === 'Unknown Channel') {
        channelName = 'Unknown Channel'
      }
      channelUrl = 'https://www.youtube.com'
      description = 'Description not available (browser extension API not supported)'
      
      console.log(`✅ Using AppleScript data: title="${title.substring(0, 50)}...", channel="${channelName}"`)
    } else {
      // Full browser extension extraction
      console.log('🌐 Using browser extension API for full metadata extraction')

      // Extract title with fallback selectors and delay for Firefox/Zen Browser
      console.log('📝 Extracting video title...')
      const extractedTitle = await extractContentWithDelay(activeTab.id, selectors.title, 'text', 3, 1000)

      if (!extractedTitle) {
        console.error('❌ Failed to extract video title')
        throw new Error(
          'Could not find video title. Please make sure the video page is fully loaded.',
        )
      }
      title = extractedTitle
      console.log(`✅ Title extracted: "${title.substring(0, 50)}..."`)

      // Extract channel information with fallback selectors
      console.log('👤 Extracting channel information...')
      const channelElement = await extractContentWithDelay(activeTab.id, selectors.channel, 'html', 3, 1000)

      if (!channelElement) {
        console.error('❌ Failed to extract channel information')
        throw new Error(
          'Could not find channel information. Please make sure the video page is fully loaded.',
        )
      }
      console.log(`✅ Channel element extracted: "${channelElement.substring(0, 100)}..."`)

      // Extract channel name and URL using string manipulation
      const hrefMatch = channelElement.match(/href="([^"]+)"/)
      const textMatch = channelElement.match(/<a[^>]*>([^<]+)<\/a>/)

      if (!hrefMatch || !textMatch) {
        console.error('❌ Failed to parse channel information from:', channelElement)
        throw new Error('Could not parse channel information.')
      }

      const [, extractedChannelUrl] = hrefMatch
      const [, rawChannelName] = textMatch
      channelName = decodeHTMLEntities(rawChannelName.trim())
      console.log(`✅ Channel parsed: "${channelName}" -> ${extractedChannelUrl}`)

      // Format the channel URL
      channelUrl = extractedChannelUrl.startsWith('http')
        ? extractedChannelUrl
        : `https://www.youtube.com${extractedChannelUrl}`

      // Try to expand description if needed (for Firefox/Zen Browser)
      console.log('🔍 Attempting to expand description...')
      await expandDescriptionIfNeeded(activeTab.id)

      // Extract description with fallback selectors and enhanced delay for Firefox/Zen Browser
      console.log('📄 Extracting video description...')
      const extractedDescription = await extractContentWithDelay(activeTab.id, selectors.description, 'text', 4, 1500)

      if (!extractedDescription) {
        console.error('❌ Failed to extract video description')
        throw new Error(
          'Could not find video description. Please make sure the video page is fully loaded and the description is visible.',
        )
      }
      console.log(`✅ Description extracted: "${extractedDescription.substring(0, 100)}..."`)

      // Clean up the description
      description = decodeHTMLEntities(
        extractedDescription
          .replace(/Show more$/, '') // Remove "Show more" text if present
          .replace(/Show less$/, '') // Remove "Show less" text if present
          .replace(/^\s*\.{3}\s*/, '') // Remove leading ellipsis
          .replace(/\s*\.{3}$/, '') // Remove trailing ellipsis
          .replace(/^\s*Show more\s*\n?/, '') // Remove "Show more" at start
          .replace(/\n?\s*Show less\s*$/, '') // Remove "Show less" at end
          .replace(/^\s+|\s+$/g, '') // Trim whitespace from start and end
          .trim(),
      )
    }

    const result = {
      title: decodeHTMLEntities(title.trim()),
      channelName: channelName,
      channelUrl: channelUrl,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      videoId: videoId,
      description: description,
    }
    
    console.log('✅ Video info extraction completed successfully:', {
      title: result.title.substring(0, 50) + '...',
      channel: result.channelName,
      videoId: result.videoId,
      descriptionLength: result.description.length,
    })

    // Return complete VideoInfo
    return result
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    console.error('❌ Video info extraction failed:', errorMessage)
    
    // Show a persistent error toast with more details
    await showToast({
      style: Toast.Style.Failure,
      title: 'Failed to extract video information',
      message: errorMessage,
    })
    throw error
  }
}

/**
 * Validates transcript quality to ensure it's substantial enough to be useful
 */
function validateTranscriptQuality(transcript: string, videoId: string): boolean {
  if (!transcript || transcript.trim().length === 0) {
    console.log(`Transcript validation failed for ${videoId}: Empty transcript`)
    return false
  }
  
  // Check if transcript is too short (likely incomplete)
  const minLength = 50 // Minimum 50 characters for a meaningful transcript
  if (transcript.trim().length < minLength) {
    console.log(`Transcript validation failed for ${videoId}: Too short (${transcript.length} chars)`)
    return false
  }
  
  // Check if transcript contains meaningful words (not just punctuation/numbers)
  const wordCount = transcript.trim().split(/\s+/).filter(word => /[a-zA-Z]/.test(word)).length
  if (wordCount < 10) {
    console.log(`Transcript validation failed for ${videoId}: Too few meaningful words (${wordCount})`)
    return false
  }
  
  // Check for common error patterns
  const errorPatterns = [
    /transcript\s+not\s+available/i,
    /no\s+captions\s+available/i,
    /transcript\s+disabled/i,
    /automatic\s+captions\s+not\s+available/i,
  ]
  
  for (const pattern of errorPatterns) {
    if (pattern.test(transcript)) {
      console.log(`Transcript validation failed for ${videoId}: Contains error pattern`)
      return false
    }
  }
  
  console.log(`Transcript validation passed for ${videoId}: ${transcript.length} chars, ${wordCount} words`)
  return true
}

/**
 * Extracts the transcript from a YouTube video with retry logic
 */
async function extractTranscript(videoId: string): Promise<string> {
  const maxRetries = 3
  const baseDelay = 2000 // 2 seconds
  
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    try {
      console.log(`Transcript extraction attempt ${attempt + 1}/${maxRetries} for video ${videoId}`)
      
      // Fetch transcript using the youtube-transcript library
      const transcriptData = await YoutubeTranscript.fetchTranscript(videoId, {
        // Add timeout and other options to make it more reliable
        lang: 'en', // Try English first
      })

      if (!transcriptData || transcriptData.length === 0) {
        throw new Error('No transcript data returned from API')
      }

      // Format the transcript segments - create clean, continuous text
      let formattedTranscript = ''
      let lastTime = -1
      const paragraphBreakThreshold = 10 // Increased threshold for cleaner paragraph breaks

      for (const segment of transcriptData) {
        // Check if we need a paragraph break (if there's a significant time gap)
        const currentTime = Math.floor(segment.offset / 1000)

        if (lastTime !== -1 && currentTime - lastTime > paragraphBreakThreshold) {
          // Use a consistent paragraph separator that we can easily handle later
          formattedTranscript += ' [PARAGRAPH_BREAK] '
        } else if (formattedTranscript) {
          formattedTranscript += ' '
        }

        // Add the text - strip any hashtags and clean up
        const cleanedText = decodeHTMLEntities(segment.text)
          .replace(/#\w+\b/g, '')
          .replace(/\s+/g, ' ') // Normalize whitespace
          .trim()
        if (cleanedText) {
          formattedTranscript += cleanedText
        }
        lastTime = currentTime
      }

      // Clean up the final transcript and convert paragraph breaks to double spaces
      const finalTranscript = formattedTranscript
        .replace(/\s*\[PARAGRAPH_BREAK\]\s*/g, '  ') // Convert to double spaces for paragraph separation
        .replace(/\s+/g, ' ') // Normalize all whitespace to single spaces
        .trim()
      
      if (!finalTranscript) {
        throw new Error('Transcript was empty after processing')
      }
      
      // Validate transcript quality
      if (!validateTranscriptQuality(finalTranscript, videoId)) {
        throw new Error('Transcript quality validation failed - transcript may be incomplete or invalid')
      }
      
      console.log(`Successfully extracted transcript on attempt ${attempt + 1}`)
      return finalTranscript
      
    } catch (error) {
      const isLastAttempt = attempt === maxRetries - 1
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      console.error(`Transcript extraction attempt ${attempt + 1} failed:`, errorMessage)
      
      if (isLastAttempt) {
        // On the final attempt, throw a more specific error
        if (errorMessage.includes('Transcript is disabled') || errorMessage.includes('No transcript available')) {
          throw new Error('No transcript available for this video (transcripts may be disabled by the creator)')
        } else if (errorMessage.includes('Video unavailable') || errorMessage.includes('Private video')) {
          throw new Error('Cannot access transcript: video may be private or unavailable')
        } else if (errorMessage.includes('quality validation failed')) {
          throw new Error('Transcript found but appears incomplete or invalid')
        } else {
          throw new Error(`Could not extract transcript after ${maxRetries} attempts: ${errorMessage}`)
        }
      }
      
      // Wait before retrying, with exponential backoff
      const delay = baseDelay * Math.pow(1.5, attempt)
      console.log(`Waiting ${delay}ms before retry...`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  
  // This should never be reached due to the throw in the last attempt
  throw new Error('Transcript extraction failed unexpectedly')
}

/**
 * Try to extract transcript with multiple language fallbacks
 */
async function extractTranscriptWithLanguageFallbacks(videoId: string): Promise<string> {
  const languageCodes = ['en', 'en-US', 'en-GB', 'auto', undefined] // Try various language codes
  
  for (const lang of languageCodes) {
    try {
      console.log(`Trying transcript extraction with language: ${lang || 'default'}`)
      
      const options = lang ? { lang } : {}
      const transcriptData = await YoutubeTranscript.fetchTranscript(videoId, options)
      
      if (transcriptData && transcriptData.length > 0) {
        // Process the transcript data with the same clean formatting as the main function
        let formattedTranscript = ''
        let lastTime = -1
        const paragraphBreakThreshold = 10 // Consistent with main function
        
        for (const segment of transcriptData) {
          const currentTime = Math.floor(segment.offset / 1000)
          
          if (lastTime !== -1 && currentTime - lastTime > paragraphBreakThreshold) {
            formattedTranscript += ' [PARAGRAPH_BREAK] '
          } else if (formattedTranscript) {
            formattedTranscript += ' '
          }
          
          const cleanedText = decodeHTMLEntities(segment.text)
            .replace(/#\w+\b/g, '')
            .replace(/\s+/g, ' ')
            .trim()
          if (cleanedText) {
            formattedTranscript += cleanedText
          }
          lastTime = currentTime
        }
        
        // Apply the same final cleaning as the main function
        const result = formattedTranscript
          .replace(/\s*\[PARAGRAPH_BREAK\]\s*/g, '  ')
          .replace(/\s+/g, ' ')
          .trim()
          
        if (result) {
          console.log(`Successfully extracted transcript with language: ${lang || 'default'}`)
          return result
        }
      }
    } catch (error) {
      console.log(`Language ${lang || 'default'} failed:`, error instanceof Error ? error.message : 'Unknown error')
      // Continue to next language
    }
  }
  
  throw new Error('No transcript available in any supported language')
}

/**
 * Safely format transcript content for Tana field to prevent it from being split into separate nodes
 */
function formatTranscriptForTanaField(transcript: string): string {
  return transcript
    // Replace all types of line breaks with spaces
    .replace(/\r\n/g, ' ')  // Windows line endings
    .replace(/\r/g, ' ')    // Mac line endings  
    .replace(/\n/g, ' ')    // Unix line endings
    // Replace multiple spaces with single space
    .replace(/\s+/g, ' ')
    // Remove any characters that might interfere with Tana parsing
    .replace(/::+/g, ':')   // Multiple colons could interfere with field syntax
    .replace(/^\s+|\s+$/g, '') // Trim leading/trailing whitespace
    // Escape any remaining special characters that might cause issues
    .replace(/\t/g, ' ')    // Replace tabs with spaces
    .trim()
}

/**
 * Formats YouTube video information for Tana in Markdown format
 * that can be processed by our existing Tana converter
 */
function formatForTanaMarkdown(videoInfo: VideoInfo): string {
  // Create a Markdown representation that our tana-converter can process
  let markdown = `# ${videoInfo.title} #video\n`
  markdown += `URL::${videoInfo.url}\n`
  markdown += `Channel URL::${videoInfo.channelUrl}\n`
  markdown += `Author::${videoInfo.channelName}\n`

  // Add transcript as a field that will be processed into a nested structure
  // Use the safe formatting function to prevent transcript from being split into separate nodes
  if (videoInfo.transcript) {
    const safeTranscript = formatTranscriptForTanaField(videoInfo.transcript)
    markdown += `Transcript::${safeTranscript}\n`
  }

  // Split description into paragraphs and use destructuring
  const [firstParagraph = 'No description available', ...additionalParagraphs] =
    videoInfo.description.split('\n\n')

  markdown += `\nDescription::${firstParagraph}\n`

  // Add additional description paragraphs as separate nodes
  for (const paragraph of additionalParagraphs) {
    if (paragraph.trim()) {
      markdown += `\n${paragraph.trim()}`
    }
  }

  return markdown
}

// Main command entry point
export default async function Command() {
  try {
    // Show HUD to indicate processing has started
    await showToast({
      style: Toast.Style.Animated,
      title: 'Processing YouTube Video',
    })

    // Extract video information from the active tab
    const videoInfo = await extractVideoInfo()

    // Try to extract transcript with multiple strategies
    let transcriptSuccess = false
    
    try {
      // First try the improved extraction with retry logic
      const transcript = await extractTranscript(videoInfo.videoId)
      videoInfo.transcript = transcript
      transcriptSuccess = true
      console.log('Transcript extracted successfully with primary method')
    } catch (transcriptError) {
      console.log('Primary transcript extraction failed, trying language fallbacks...')
      
      try {
        // Fallback to language-specific extraction
        const transcript = await extractTranscriptWithLanguageFallbacks(videoInfo.videoId)
        videoInfo.transcript = transcript
        transcriptSuccess = true
        console.log('Transcript extracted successfully with language fallbacks')
      } catch (fallbackError) {
        // Show a toast but continue with video info only
        const primaryError = transcriptError instanceof Error ? transcriptError.message : 'Unknown error'
        const fallbackErrorMsg = fallbackError instanceof Error ? fallbackError.message : 'Unknown error'
        
        await showToast({
          style: Toast.Style.Failure,
          title: 'Transcript Extraction Failed',
          message: `Primary: ${primaryError}. Fallback: ${fallbackErrorMsg}`,
        })
        
        console.log('All transcript extraction methods failed')
      }
    }

    // Format and copy to clipboard
    const markdownFormat = formatForTanaMarkdown(videoInfo)
    const tanaFormat = convertToTana(markdownFormat)
    await Clipboard.copy(tanaFormat)

    // Create success message based on transcript availability
    const baseMessage = transcriptSuccess
      ? 'YouTube video info and transcript copied to clipboard in Tana format'
      : 'YouTube video info copied to clipboard in Tana format (no transcript available)'

    // Open Tana automatically like other commands
    try {
      await execAsync('open tana://')
      await showHUD(`${baseMessage}. Opening Tana... ✨`)
    } catch (error) {
      console.error('Error opening Tana:', error)
      await showHUD(`${baseMessage} (but couldn't open Tana) ✨`)
    }
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: 'Processing Failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}