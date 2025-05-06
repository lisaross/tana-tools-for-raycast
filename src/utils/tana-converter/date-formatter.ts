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

  // Week format
  const weekMatch = text.match(/^Week (\d{1,2}),\s*(\d{4})$/)
  if (weekMatch) {
    const [, week, year] = weekMatch
    return {
      type: 'week',
      value: `${year}-W${week.padStart(2, '0')}`,
    }
  }

  // Week range
  const weekRangeMatch = text.match(/^Weeks (\d{1,2})-(\d{1,2}),\s*(\d{4})$/)
  if (weekRangeMatch) {
    const [, week1, week2, year] = weekRangeMatch
    return {
      type: 'duration',
      value: `${year}-W${week1.padStart(2, '0')}/W${week2.padStart(2, '0')}`,
    }
  }

  // ISO date with time
  const isoTimeMatch = text.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})$/)
  if (isoTimeMatch) {
    const [, date, time] = isoTimeMatch
    return {
      type: 'time',
      value: `${date} ${time}`,
    }
  }

  // Legacy format with time
  const legacyTimeMatch = text.match(
    /^(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+)?([A-Z][a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,\s*(\d{4})(?:,\s*(\d{1,2}):(\d{2})\s*(AM|PM))?$/
  )
  if (legacyTimeMatch) {
    const [, month, day, year, hour, min, ampm] = legacyTimeMatch
    if (hour && min && ampm) {
      const h = parseInt(hour)
      const adjustedHour = ampm === 'PM' && h < 12 ? h + 12 : ampm === 'AM' && h === 12 ? 0 : h
      return {
        type: 'time',
        value: `${year}-${getMonthNumber(month)}-${day.padStart(2, '0')} ${adjustedHour.toString().padStart(2, '0')}:${min}`,
      }
    }
    return {
      type: 'simple',
      value: `${year}-${getMonthNumber(month)}-${day.padStart(2, '0')}`,
    }
  }

  // Duration with mixed formats
  const durationMatch = text.match(
    /^([A-Z][a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s*-\s*([A-Z][a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,\s*(\d{4})$/
  )
  if (durationMatch) {
    const [, month1, day1, month2, day2, year] = durationMatch
    return {
      type: 'duration',
      value: `${year}-${getMonthNumber(month1)}-${day1.padStart(2, '0')}/${year}-${getMonthNumber(month2)}-${day2.padStart(2, '0')}`,
    }
  }

  // ISO duration
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

  // Month and year
  const monthYearMatch = text.match(
    /^(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+)?([A-Z][a-z]+)(?:\s+)?(?:⌘\s+)?(\d{4})$/
  )
  if (monthYearMatch) {
    const [, month, year] = monthYearMatch
    return {
      type: 'simple',
      value: `${year}-${getMonthNumber(month)}`,
    }
  }

  // Year only
  const yearMatch = text.match(/^(?:⌘\s+)?(\d{4})$/)
  if (yearMatch) {
    return {
      type: 'simple',
      value: yearMatch[1],
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

  // Process dates
  // Breaking down the complex regex into named patterns for better readability
  const datePatterns = {
    // [[date:YYYY-MM-DD]] format or YYYY-MM-DD format, optionally with time
    isoDate:
      /(?:\[\[date:)?(?:\[\[.*?\]\]|\d{4}(?:-\d{2}(?:-\d{2})?)?(?:\s+\d{2}:\d{2})?(?:\/(?:\[\[.*?\]\]|\d{4}(?:-\d{2}(?:-\d{2})?)?(?:\s+\d{2}:\d{2})?))?)(?:\]\])?/,

    // Week X, YYYY format
    weekFormat: /(?:Week \d{1,2},\s*\d{4})/,

    // Weeks X-Y, YYYY format
    weekRangeFormat: /(?:Weeks \d{1,2}-\d{1,2},\s*\d{4})/,

    // Month YYYY or Month ⌘ YYYY
    monthYearFormat: /(?:[A-Z][a-z]+\s+(?:⌘\s+)?\d{4})/,

    // Month Day, YYYY or Month Day, YYYY, HH:MM AM/PM
    monthDayYearFormat:
      /(?:[A-Z][a-z]+ \d{1,2}(?:st|nd|rd|th)?,\s*\d{4}(?:,\s*\d{1,2}:\d{2}\s*(?:AM|PM))?)/,

    // Month Day - Month Day, YYYY (date ranges)
    dateRangeFormat:
      /(?:[A-Z][a-z]+ \d{1,2}(?:st|nd|rd|th)?\s*-\s*[A-Z][a-z]+ \d{1,2}(?:st|nd|rd|th)?,\s*\d{4})/,
  }

  // Combine all patterns with the OR operator
  const dateRegex = new RegExp(
    Object.values(datePatterns)
      .map((pattern) => pattern.source)
      .join('|'),
    'g'
  )

  text = text.replace(dateRegex, (match) => {
    // Skip pure numeric IDs
    if (match.match(/^\d+$/) && match.length < 5) {
      return match
    }
    const parsed = parseDate(match)
    return parsed ? formatTanaDate(parsed) : match
  })

  // Restore protected content
  text = text.replace(/__PROTECTED_(\d+)__/g, (_, index) => protectedItems[parseInt(index)])

  return text
}
