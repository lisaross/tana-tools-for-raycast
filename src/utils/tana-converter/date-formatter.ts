/**
 * Date formatting functionality for tana-converter
 */
import { ParsedDate } from './types'

/**
 * Convert month abbreviation to number (01-12)
 * @param month Month name (e.g. "January", "Jan")
 * @returns Month number as string (e.g. "01", "12")
 */
export function getMonthNumber(month: string): string {
  const months: { [key: string]: string } = {
    January: '01',
    Jan: '01',
    February: '02',
    Feb: '02',
    March: '03',
    Mar: '03',
    April: '04',
    Apr: '04',
    May: '05',
    June: '06',
    Jun: '06',
    July: '07',
    Jul: '07',
    August: '08',
    Aug: '08',
    September: '09',
    Sep: '09',
    October: '10',
    Oct: '10',
    November: '11',
    Nov: '11',
    December: '12',
    Dec: '12',
  }
  return months[month] || '01'
}

/**
 * Parse a date string into its components
 * @param text Date string to parse
 * @returns Parsed date object or null if not a recognized date format
 */
export function parseDate(text: string): ParsedDate | null {
  // Already a Tana date reference
  if (text.startsWith('[[date:') && text.endsWith(']]')) {
    return {
      type: 'simple',
      value: text,
      isProcessed: true,
    }
  }

  // Week format - simplified pattern
  const weekMatch = text.match(/^Week (\d{1,2}),\s*(\d{4})$/)
  if (weekMatch) {
    const [, week, year] = weekMatch
    const wk = parseInt(week, 10)
    if (wk < 1 || wk > 53) {
      return null // Invalid week number, return null to keep current API
    }
    return {
      type: 'week',
      value: `${year}-W${week.padStart(2, '0')}`,
    }
  }

  // Week range - simplified pattern
  const weekRangeMatch = text.match(/^Weeks (\d{1,2})-(\d{1,2}),\s*(\d{4})$/)
  if (weekRangeMatch) {
    const [, week1, week2, year] = weekRangeMatch
    const wk1 = parseInt(week1, 10)
    const wk2 = parseInt(week2, 10)
    if (wk1 < 1 || wk1 > 53 || wk2 < 1 || wk2 > 53) {
      return null // Invalid week number(s), return null to keep current API
    }
    return {
      type: 'duration',
      value: `${year}-W${week1.padStart(2, '0')}/W${week2.padStart(2, '0')}`,
    }
  }

  // ISO date with time - simple pattern
  const isoTimeMatch = text.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})$/)
  if (isoTimeMatch) {
    const [, date, time] = isoTimeMatch
    return {
      type: 'time',
      value: `${date} ${time}`,
    }
  }

  // Numeric date formats - DD/MM/YYYY or MM/DD/YYYY (ambiguous, assume DD/MM)
  const numericMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (numericMatch) {
    const [, first, second, year] = numericMatch
    // Assume DD/MM/YYYY format (British) - could be made configurable
    const day = first.padStart(2, '0')
    const month = second.padStart(2, '0')
    return {
      type: 'simple',
      value: `${year}-${month}-${day}`,
    }
  }

  // British format: Day Month Year - "14 March 2016" or "14th March 2016"
  const britishMatch = text.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Z][a-z]+)\s+(\d{4})$/)
  if (britishMatch) {
    const [, day, month, year] = britishMatch
    return {
      type: 'simple',
      value: `${year}-${getMonthNumber(month)}-${day.padStart(2, '0')}`,
    }
  }

  // "of" formats - "1st of February, 2023" or "The 14th of January 2018"
  const ofMatch = text.match(
    /^(?:The\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+of\s+([A-Z][a-z]+),?\s+(\d{4})$/,
  )
  if (ofMatch) {
    const [, day, month, year] = ofMatch
    return {
      type: 'simple',
      value: `${year}-${getMonthNumber(month)}-${day.padStart(2, '0')}`,
    }
  }

  // Day of week prefix with British format - "Wednesday, 1st February 2023"
  const weekdayBritishMatch = text.match(
    /^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+(\d{1,2})(?:st|nd|rd|th)?\s+([A-Z][a-z]+)\s+(\d{4})$/,
  )
  if (weekdayBritishMatch) {
    const [, day, month, year] = weekdayBritishMatch
    return {
      type: 'simple',
      value: `${year}-${getMonthNumber(month)}-${day.padStart(2, '0')}`,
    }
  }

  // Day of week prefix with American format - "Wednesday, February 1st, 2023"
  const weekdayAmericanMatch = text.match(
    /^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+([A-Z][a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/,
  )
  if (weekdayAmericanMatch) {
    const [, month, day, year] = weekdayAmericanMatch
    return {
      type: 'simple',
      value: `${year}-${getMonthNumber(month)}-${day.padStart(2, '0')}`,
    }
  }

  // American format: Month day (no year) - "February 1st"
  const monthDayMatch = text.match(/^([A-Z][a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?$/)
  if (monthDayMatch) {
    const [, month, day] = monthDayMatch
    const currentYear = new Date().getFullYear()
    return {
      type: 'simple',
      value: `${currentYear}-${getMonthNumber(month)}-${day.padStart(2, '0')}`,
    }
  }

  // Legacy format with time - broken into simpler parts to avoid nested quantifiers
  // First check for basic month day year pattern
  const basicLegacyMatch = text.match(/^([A-Z][a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,\s*(\d{4})$/)
  if (basicLegacyMatch) {
    const [, month, day, year] = basicLegacyMatch
    return {
      type: 'simple',
      value: `${year}-${getMonthNumber(month)}-${day.padStart(2, '0')}`,
    }
  }

  // Then check for the time variant separately to avoid complex nested groups
  const legacyTimeMatch = text.match(
    /^([A-Z][a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,\s*(\d{4}),\s*(\d{1,2}):(\d{2})\s*(AM|PM)$/,
  )
  if (legacyTimeMatch) {
    const [, month, day, year, hour, min, ampm] = legacyTimeMatch
    const h = parseInt(hour)
    const adjustedHour = ampm === 'PM' && h < 12 ? h + 12 : ampm === 'AM' && h === 12 ? 0 : h
    return {
      type: 'time',
      value: `${year}-${getMonthNumber(month)}-${day.padStart(2, '0')} ${adjustedHour.toString().padStart(2, '0')}:${min}`,
    }
  }

  // Duration with mixed formats - simplified pattern
  const durationMatch = text.match(
    /^([A-Z][a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s*-\s*([A-Z][a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,\s*(\d{4})$/,
  )
  if (durationMatch) {
    const [, month1, day1, month2, day2, year] = durationMatch
    return {
      type: 'duration',
      value: `${year}-${getMonthNumber(month1)}-${day1.padStart(2, '0')}/${year}-${getMonthNumber(month2)}-${day2.padStart(2, '0')}`,
    }
  }

  // ISO duration - simple pattern
  const isoDurationMatch = text.match(/^(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})$/)
  if (isoDurationMatch) {
    const [, start, end] = isoDurationMatch
    return {
      type: 'duration',
      value: `${start}/${end}`,
    }
  }

  // Simple ISO date
  const isoMatch = text.match(/^(\d{4}-\d{2}-\d{2})$/)
  if (isoMatch) {
    return {
      type: 'simple',
      value: isoMatch[1],
    }
  }

  // Month and year - simplified to avoid complex nested groups
  const monthYearMatch = text.match(/^([A-Z][a-z]+)\s+(\d{4})$/)
  if (monthYearMatch) {
    const [, month, year] = monthYearMatch
    return {
      type: 'simple',
      value: `${year}-${getMonthNumber(month)}`,
    }
  }

  // Month with command symbol and year - separate pattern for clarity
  const monthCommandYearMatch = text.match(/^([A-Z][a-z]+)\s+⌘\s+(\d{4})$/)
  if (monthCommandYearMatch) {
    const [, month, year] = monthCommandYearMatch
    return {
      type: 'simple',
      value: `${year}-${getMonthNumber(month)}`,
    }
  }

  // Year only - simple pattern
  const yearMatch = text.match(/^(\d{4})$/)
  if (yearMatch) {
    return {
      type: 'simple',
      value: yearMatch[1],
    }
  }

  // Year with command symbol - separate pattern
  const yearCommandMatch = text.match(/^⌘\s+(\d{4})$/)
  if (yearCommandMatch) {
    return {
      type: 'simple',
      value: yearCommandMatch[1],
    }
  }

  return null
}

/**
 * Format a parsed date into Tana format
 * @param date Parsed date object
 * @returns Date formatted in Tana syntax
 */
export function formatTanaDate(date: ParsedDate): string {
  if (date.isProcessed) return date.value

  switch (date.type) {
    case 'simple':
      return `[[date:${date.value}]]`
    case 'time':
      return `[[date:${date.value}]]`
    case 'week':
      return `[[date:${date.value}]]`
    case 'duration':
      return `[[date:${date.value}]]`
    default:
      return date.value
  }
}

/**
 * Convert dates in text to Tana date format
 *
 * Modified to preserve purely numeric values that aren't dates
 * and to properly handle ID fields that might contain numbers
 *
 * @param text Text to process
 * @returns Text with dates converted to Tana format
 */
export function convertDates(text: string): string {
  // Check if this is likely to be a numeric ID and not a date
  if (
    text.toLowerCase().includes('id') &&
    text.match(/\d{4,}/) &&
    !text.match(/\d{4}-\d{2}-\d{2}/)
  ) {
    return text
  }

  // First protect URLs and existing references
  const protectedItems: string[] = []
  text = text.replace(/(?:\[\[.*?\]\]|https?:\/\/[^\s)]+|\[[^\]]+\]\([^)]+\))/g, (match) => {
    protectedItems.push(match)
    return `__PROTECTED_${protectedItems.length - 1}__`
  })

  // Process dates using individual, simple regex patterns tested sequentially
  // This approach avoids both dynamic construction and catastrophic backtracking

  // Simple static patterns without nested quantifiers to prevent ReDoS
  const datePatterns = [
    // Already processed Tana dates - keep as-is
    /\[\[date:[^\]]+\]\]/g,

    // ISO date formats (simple, non-nested)
    /\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}/g, // ISO duration
    /\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/g, // ISO date with time
    /\d{4}-\d{2}-\d{2}/g, // Simple ISO date

    // Numeric date formats (DD/MM/YYYY and MM/DD/YYYY)
    /\d{1,2}\/\d{1,2}\/\d{4}/g, // Numeric dates

    // Week formats (simple, bounded)
    /Weeks\s+\d{1,2}-\d{1,2},\s*\d{4}/g, // Week range
    /Week\s+\d{1,2},\s*\d{4}/g, // Single week

    // British format: Day Month Year
    /\d{1,2}(?:st|nd|rd|th)?\s+[A-Z][a-z]+\s+\d{4}/g, // "14th March 2016"
    /\d{1,2}\s+[A-Z][a-z]+\s+\d{4}/g, // "14 March 2016"

    // "of" formats
    /\d{1,2}(?:st|nd|rd|th)?\s+of\s+[A-Z][a-z]+,?\s+\d{4}/g, // "1st of February, 2023"
    /The\s+\d{1,2}(?:st|nd|rd|th)?\s+of\s+[A-Z][a-z]+\s+\d{4}/g, // "The 14th of January 2018"

    // Day of week prefixes
    /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+\d{1,2}(?:st|nd|rd|th)?\s+[A-Z][a-z]+\s+\d{4}/g, // "Wednesday, 1st February 2023"
    /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+[A-Z][a-z]+\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}/g, // "Wednesday, February 1st, 2023"

    // American format: Month Day, Year with optional time
    /[A-Z][a-z]+\s+\d{1,2}(?:st|nd|rd|th)?\s*-\s*[A-Z][a-z]+\s+\d{1,2}(?:st|nd|rd|th)?,\s*\d{4}/g, // Date range
    /[A-Z][a-z]+\s+\d{1,2}(?:st|nd|rd|th)?,\s*\d{4}(?:,\s*\d{1,2}:\d{2}\s*(?:AM|PM))?/g, // Month day year with optional time

    // Month/year formats (simple, bounded)
    /[A-Z][a-z]+\s+(?:⌘\s+)?\d{4}/g, // Month year
    /[A-Z][a-z]+\s+\d{1,2}(?:st|nd|rd|th)?/g, // Month day (no year) - "February 1st"

    // Year only (simple)
    /(?:⌘\s+)?\d{4}/g, // Year only
  ]

  // Apply each pattern individually to avoid complex alternations
  for (const pattern of datePatterns) {
    text = text.replace(pattern, (match) => {
      // Skip pure numeric IDs
      if (match.match(/^\d+$/) && match.length < 5) {
        return match
      }

      // Skip already processed dates
      if (match.startsWith('[[date:')) {
        return match
      }

      const parsed = parseDate(match)
      return parsed ? formatTanaDate(parsed) : match
    })
  }

  // Restore protected content
  text = text.replace(/__PROTECTED_(\d+)__/g, (_, index) => protectedItems[parseInt(index)])

  return text
}
