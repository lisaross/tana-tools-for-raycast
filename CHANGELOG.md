# Tana Paste For Raycast Changelog

## [2.1.0] - 2025-05-24

### Added
- The "Convert Selected Text to Tana" command now automatically adds a URL field and the #swipe supertag when text is selected from a web page.
- The URL is placed above the selected text as a child node under the page title.
- The page title is used as the parent node for the selection when available.

## [2.0.0] - 2025-05-07

### Added
- Comprehensive documentation for the Tana converter module

### Changed
- Complete refactoring of the Tana converter into a modular architecture
- Enhanced date formatting with improved pattern recognition and conversion
- Improved text formatting capabilities
- Optimized transcript processing with dedicated module
- Better type definitions for improved code maintainability

## [1.6.1] - 2025-05-06

### Changed
- Updated project structure to comply with Raycast store requirements
- Removed Python script dependency for streamlined installation
- Improved documentation for clarity and focus on Raycast extension functionality
- Updated ESLint configuration to match Raycast recommendations

## [1.6.0] - 2025-04-18

### Added
- Enhanced YouTube transcript processing with improved formatting (#33)
- Added transcript chunking functionality for better organization
- Enhanced Limitless Pendant transcription processing
- Added Limitless App transcription support

## [1.5.4] - 2025-04-17

### Fixed
- Fixed incorrect indentation in Tana converter that was causing all content to be placed under a single node (#27)
- Fixed bullet point conversion for mixed format lists (#24)
  - Fixed nested bullets not being properly separated
  - Added support for multiple bullet formats (numbers, symbols, letters)
  - Improved handling of nested bullet points
  - Added proper indentation for mixed format lists

## [1.5.2] - 2025-04-13

### Changed

- Updated extension icon

## [1.5.1] - 2025-04-13

### Added

- Transcript extraction for YouTube videos in the YouTube to Tana command (into Transcript field)
- Graceful fallback when transcript is unavailable

## [1.5.0] - 2025-04-13

### Added

- YouTube to Tana command to extract video metadata and convert to Tana format (#15)
- Support for extracting video title, URL, channel, author and description from YouTube pages

## [1.4.3] - 2025-04-08

### Changed

- Updated memory bank with correct GitHub CLI usage instructions
- Fixed documentation about handling newlines in GitHub commands

## [1.4.2] - 2025-04-08

### Changed

- Renamed extension to "tana-paste-for-raycast" to avoid naming conflicts
- Refactored complex date pattern regex into named components for improved readability and maintainability
- Extracted magic indentation numbers to named constants
- Enhanced code quality through better naming and organization

## [1.4.1] - 2025-04-06

### Changed

- Cleaned up directory structure
- Removed duplicate example files
- Updated documentation approach

## [1.4.0] - 2025-04-05

### Fixed

- Corrected indentation hierarchy for bullet points under deeper heading levels (H3+) (#11)
- Improved handling of Limitless Pendant transcription indentation
- Made output more robust by checking content and hierarchy

## [1.3.0] - 2025-04-03

### Added

- Support for YouTube transcript timestamps as separate nodes in Tana (#4)

### Fixed

- Properly preserve bold text formatting in standard markdown (no longer converts to italic-underscore format) (#5)
- Correct indentation hierarchy for numbered headings and their content (#5)
- Improved error handling and stability

## [1.1.0] - 2023-04-02

### Added

- Improved output formatting
- Support for more complex Markdown formatting
- Better handling of fields with colons
- Proper preservation of URL syntax

## [1.0.0] - 2023-03-15

### Added

- Initial release with main features:
  - Convert Markdown bullet points to Tana nodes
  - Support for headings as parent nodes
  - Handle nested content with proper indentation
  - Parse fields with colons and convert to Tana format
  - Process inline formatting
  - Support for timestamps

### Features
- Convert Markdown headings to Tana nodes with proper indentation
- Intelligent field detection to distinguish between actual fields and regular text with colons
- Preserve bracketed elements in text that shouldn't be converted to tags
- Proper handling of URL and link syntax
- Process inline formatting (bold, italic, highlights)
- Convert dates to Tana's date format
- Handle nested lists and indented content
- Automatic opening of Tana after conversion 