# Tana Tools for Raycast Changelog

## [1.0.0-beta.3] - 2024-12-01

### Fixed

- **YouTube Command Zen Browser Compatibility**: Fixed YouTube transcript and metacontent extraction not working in Zen Browser (Firefox-based browsers)
- **AppleScript Fallback Enhancement**: Improved AppleScript fallback method with better error handling and multiple keyboard shortcut approaches
- **Improved URL Validation**: Added strict validation for YouTube URL detection to prevent false positives from Tana-formatted clipboard content
- **Transcript Reliability**: Enhanced transcript extraction with retry logic and language fallbacks

### Enhanced

- **Browser-Specific CSS Selectors**: Added multiple fallback CSS selectors optimized for Firefox/Zen Browser DOM structures
- **Enhanced Retry Logic**: Improved transcript extraction with exponential backoff and multiple language fallbacks
- **Keyboard Shortcut Methods**: Multiple AppleScript keyboard shortcut approaches (`Cmd+Shift+C`, `Cmd+L`+`Cmd+C`) for browsers without direct API access
- **Error Handling**: Enhanced error messages and logging for better debugging of browser compatibility issues

### Technical Improvements

- Enhanced `getFrontmostYouTubeTab()` with frontmost app verification (limited effectiveness due to BrowserExtension API constraints)
- Improved `getYouTubeUrlFromAppleScript()` with better keyboard automation and validation
- Added `validateTranscriptQuality()` function for transcript reliability
- Enhanced URL validation with protocol, format, and content checks

### Notes

- Zen Browser support now works through AppleScript fallback when BrowserExtension API is not available
- **Known limitation**: Cannot reliably detect frontmost browser window when multiple browsers with YouTube tabs are open due to BrowserExtension API constraints
- Manual URL copying (select address bar, Cmd+C) remains the most reliable method for complex multi-browser scenarios
- Performance optimized for Firefox-based browsers with enhanced timing and retry logic

## [1.0.0-beta.2] - 2024-11-30

### Added

- **Enhanced Browser Compatibility**: YouTube extraction now works with Zen Browser (Firefox-based)
- **Auto-open Tana**: YouTube to Tana command now automatically opens Tana app after processing
- **Robust Transcript Extraction**: Added retry logic and multiple language fallbacks for YouTube transcripts
- **Transcript Quality Validation**: Validates transcript completeness to prevent empty or invalid results

### Fixed

- **Zen Browser Support**: YouTube transcript and metadata extraction now works reliably in Zen Browser
- **Intermittent Transcript Issues**: Fixed issue where transcript extraction would sometimes fail and work on retry
- **Transcript Formatting**: Ensures transcripts always appear in the Transcript field instead of being split into separate nodes
- **Browser-specific CSS Selectors**: Added fallback selectors for Firefox-based browsers with different DOM structures

### Improved

- **Multi-strategy Extraction**: Primary extraction with language-specific fallbacks (English, auto-generated, etc.)
- **Enhanced Error Handling**: More specific error messages for different transcript failure scenarios
- **Timing Adjustments**: Added delays and retry mechanisms for Firefox/Zen Browser content loading
- **Content Validation**: Better detection of incomplete or invalid transcript data
- **Consistent Behavior**: All commands now follow the same auto-open Tana pattern

### Technical

- **Browser Detection**: Added browser-specific handling for different DOM rendering patterns
- **Exponential Backoff**: Retry logic with increasing delays for failed transcript extraction
- **Quality Checks**: Minimum length and word count validation for transcript content
- **Safe Formatting**: Comprehensive text cleaning to prevent Tana parsing issues

## [1.0.0-beta] - 2025-05-24

### Features

- Convert clipboard or selected text to Tana Paste format
- Edit and preview before converting
- Extract and format YouTube video metadata and transcripts (with transcript chunking for large videos)
- Supports Limitless Pendant and Limitless App transcriptions
- Supports most Markdown transformations (headings, lists, paragraphs, nesting, etc.)
- Clip the main content of any web page and instantly convert it to a clean, organized Tana outline
- Add page title and URL as parent/child nodes when converting from web content
- Add #swipe supertag automatically for web and selected content
- Instant feedback via Raycast HUD
