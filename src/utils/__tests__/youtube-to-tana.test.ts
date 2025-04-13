import { describe, it, expect } from '@jest/globals'
import { convertToTana } from '../tana-converter'

/**
 * Placeholder tests for YouTube to Tana functionality
 *
 * NOTE: Full tests are temporarily disabled while we work on the core functionality.
 * Will re-enable with proper TypeScript compatibility once the feature is working.
 */

// Import the private functions for testing
// Since we can't directly import private functions from YouTube-to-tana.tsx,
// we'll recreate the essential functions here for testing

/**
 * Decodes HTML entities in a string (duplicated from youtube-to-tana.tsx)
 */
function decodeHTMLEntities(text: string): string {
  const entities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&nbsp;': ' ',
  }

  // Replace all encoded entities
  let decoded = text
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.replace(new RegExp(entity, 'g'), char)
  }

  // Additionally handle numeric entities like &#39;
  decoded = decoded.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))

  return decoded
}

/**
 * Test version of formatForTanaMarkdown
 */
function formatForTanaMarkdown(videoInfo: {
  title: string
  channelName: string
  channelUrl: string
  url: string
  videoId: string
  description: string
  transcript?: string
}): string {
  // Create a Markdown representation
  let markdown = `# ${videoInfo.title} #video\n`
  markdown += `URL::${videoInfo.url}\n`
  markdown += `Channel URL::${videoInfo.channelUrl}\n`
  markdown += `Author::${videoInfo.channelName}\n`

  // Add transcript as a field if available, only using first paragraph
  if (videoInfo.transcript) {
    const transcriptParagraphs = videoInfo.transcript.split('\n\n')
    markdown += `Transcript::${transcriptParagraphs[0]}\n`

    // Add additional transcript paragraphs as separate nodes
    for (let i = 1; i < transcriptParagraphs.length; i++) {
      if (transcriptParagraphs[i].trim()) {
        markdown += `\n${transcriptParagraphs[i].trim()}`
      }
    }
  }

  markdown += `\nDescription::${videoInfo.description.split('\n\n')[0] || 'No description available'}\n`

  // Add additional description paragraphs as separate nodes
  const descriptionParagraphs = videoInfo.description.split('\n\n').slice(1)
  for (const paragraph of descriptionParagraphs) {
    if (paragraph.trim()) {
      markdown += `\n${paragraph.trim()}`
    }
  }

  return markdown
}

describe('YouTube to Tana Conversion', () => {
  describe('HTML entity decoding', () => {
    it('should decode basic HTML entities', () => {
      const input = 'I &amp; you are &lt;great&gt; together'
      const expected = 'I & you are <great> together'
      expect(decodeHTMLEntities(input)).toBe(expected)
    })

    it('should decode apostrophes properly', () => {
      const input = 'I&#39;ve been working'
      const expected = "I've been working"
      expect(decodeHTMLEntities(input)).toBe(expected)
    })

    it('should handle multiple entity types in the same string', () => {
      const input = 'Tom &amp; Jerry&#39;s &quot;Fun&quot; Time'
      const expected = 'Tom & Jerry\'s "Fun" Time'
      expect(decodeHTMLEntities(input)).toBe(expected)
    })
  })

  describe('Markdown formatting for Tana', () => {
    const basicVideoInfo = {
      title: 'Test Video Title',
      channelName: 'Test Channel',
      channelUrl: 'https://www.youtube.com/@testchannel',
      url: 'https://www.youtube.com/watch?v=12345',
      videoId: '12345',
      description: 'This is the description of the video.',
    }

    it('should format basic video info without transcript', () => {
      const markdown = formatForTanaMarkdown(basicVideoInfo)
      expect(markdown).toContain('# Test Video Title #video')
      expect(markdown).toContain('URL::https://www.youtube.com/watch?v=12345')
      expect(markdown).toContain('Channel URL::https://www.youtube.com/@testchannel')
      expect(markdown).toContain('Author::Test Channel')
      expect(markdown).toContain('Description::This is the description of the video.')
      expect(markdown).not.toContain('Transcript::')
    })

    it('should format video info with transcript', () => {
      const videoInfoWithTranscript = {
        ...basicVideoInfo,
        transcript: 'This is a transcript of the video.',
      }

      const markdown = formatForTanaMarkdown(videoInfoWithTranscript)
      expect(markdown).toContain('Transcript::This is a transcript of the video.')
    })

    it('should handle multi-paragraph transcripts correctly', () => {
      const videoInfoWithMultiParagraphTranscript = {
        ...basicVideoInfo,
        transcript:
          'This is paragraph one of the transcript.\n\nThis is paragraph two.\n\nThis is paragraph three.',
      }

      const markdown = formatForTanaMarkdown(videoInfoWithMultiParagraphTranscript)

      // First paragraph should be in the Transcript field
      expect(markdown).toContain('Transcript::This is paragraph one of the transcript.')

      // Additional paragraphs should be separate nodes
      expect(markdown).toContain('\nThis is paragraph two.')
      expect(markdown).toContain('\nThis is paragraph three.')
    })

    it('should handle multi-paragraph descriptions correctly', () => {
      const videoInfoWithMultiParagraphDescription = {
        ...basicVideoInfo,
        description:
          'First paragraph of description.\n\nSecond paragraph of description.\n\nThird paragraph.',
      }

      const markdown = formatForTanaMarkdown(videoInfoWithMultiParagraphDescription)

      // First paragraph should be in the Description field
      expect(markdown).toContain('Description::First paragraph of description.')

      // Additional paragraphs should be separate nodes
      expect(markdown).toContain('\nSecond paragraph of description.')
      expect(markdown).toContain('\nThird paragraph.')
    })
  })

  describe('Full Tana conversion', () => {
    it('should generate valid Tana nodes from formatted markdown', () => {
      const basicVideoInfo = {
        title: 'Test Video Title',
        channelName: 'Test Channel',
        channelUrl: 'https://www.youtube.com/@testchannel',
        url: 'https://www.youtube.com/watch?v=12345',
        videoId: '12345',
        description: 'This is the description.',
        transcript: 'This is the transcript.',
      }

      const markdown = formatForTanaMarkdown(basicVideoInfo)
      const tanaFormat = convertToTana(markdown)

      // Check for Tana's node format indicators
      expect(tanaFormat).toContain('- Test Video Title #video')
      expect(tanaFormat).toContain('URL::https://www.youtube.com/watch?v=12345')
      expect(tanaFormat).toContain('Transcript::This is the transcript.')
      expect(tanaFormat).toContain('Description::This is the description.')
    })

    it('should preserve hierarchy in Tana format for multi-paragraph content', () => {
      const complexVideoInfo = {
        title: 'Complex Video',
        channelName: 'Test Channel',
        channelUrl: 'https://youtube.com/@test',
        url: 'https://youtube.com/watch?v=12345',
        videoId: '12345',
        description: 'Description paragraph 1.\n\nDescription paragraph 2.',
        transcript: 'Transcript paragraph 1.\n\nTranscript paragraph 2.',
      }

      const markdown = formatForTanaMarkdown(complexVideoInfo)
      const tanaFormat = convertToTana(markdown)

      // Check that main node is properly formatted
      expect(tanaFormat).toContain('- Complex Video #video')

      // Check that fields are properly converted
      expect(tanaFormat).toContain('Transcript::Transcript paragraph 1.')
      expect(tanaFormat).toContain('Description::Description paragraph 1.')

      // Check for proper inclusion of additional paragraphs
      expect(tanaFormat).toContain('Transcript paragraph 2.')
      expect(tanaFormat).toContain('Description paragraph 2.')

      // Ensure proper indentation
      const lines = tanaFormat.split('\n')

      // Find the main node line
      const mainNodeIndex = lines.findIndex((line) => line.includes('Complex Video #video'))
      expect(mainNodeIndex).toBeGreaterThan(0)

      // Check that all content is properly indented under main node
      const contentLines = lines.slice(mainNodeIndex + 1).filter((line) => line.trim() !== '')
      contentLines.forEach((line) => {
        expect(line.startsWith('  ')).toBeTruthy()
      })
    })
  })
})
