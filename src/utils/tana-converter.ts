/**
 * Represents different types of text elements that can be detected
 */
export type TextElement = {
  type: 'text' | 'url' | 'email' | 'lineBreak' | 'listItem' | 'header';
  content: string;
  level?: number;
};

interface Line {
  content: string;
  indent: number;
  raw: string;
  isHeader: boolean;
  isCodeBlock: boolean;
  parent?: number;
}

/**
 * Parse a line to determine its structure
 */
function parseLine(line: string): Line {
  const raw = line;
  
  // Calculate indent level based on spaces
  const match = line.match(/^(\s*)/);
  const spaces = match ? match[1].length : 0;
  const indent = Math.floor(spaces / 2);
  
  // Get content without indentation
  const content = line.slice(spaces).trimEnd();
  
  // Detect if it's a header
  const isHeader = content.startsWith('#');
  
  // Detect if it's a code block
  const isCodeBlock = content.startsWith('```');
  
  return { content, indent, raw, isHeader, isCodeBlock, parent: undefined };
}

/**
 * Build the hierarchy by linking lines to their parents
 */
function buildHierarchy(lines: Line[]): Line[] {
  if (lines.length === 0) return lines;
  
  const result = [...lines];
  let lastHeader: number | undefined = undefined;
  let lastParentAtLevel: number[] = [-1];
  let inCodeBlock = false;
  let codeBlockParent: number | undefined = undefined;
  
  for (let i = 0; i < result.length; i++) {
    const line = result[i];
    const content = line.content.trim();
    
    // Skip empty lines
    if (!content) continue;
    
    // Handle code blocks
    if (line.isCodeBlock || inCodeBlock) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockParent = lastParentAtLevel[lastParentAtLevel.length - 1];
      }
      line.parent = codeBlockParent;
      if (line.isCodeBlock && inCodeBlock) {
        inCodeBlock = false;
        codeBlockParent = undefined;
      }
      continue;
    }
    
    // Handle headers
    if (line.isHeader) {
      const level = content.match(/^#+/)?.[0].length ?? 1;
      // Headers at same level as content
      line.parent = -1;
      lastHeader = i;
      // Reset parent tracking at this level
      lastParentAtLevel = lastParentAtLevel.slice(0, level);
      lastParentAtLevel[level - 1] = i;
      continue;
    }
    
    // Handle list items and content
    const effectiveIndent = line.indent;
    
    // Find the appropriate parent
    while (lastParentAtLevel.length > effectiveIndent + 1) {
      lastParentAtLevel.pop();
    }
    
    // If we're at the first level under a header, link to the header
    if (effectiveIndent === 0 && lastHeader !== undefined) {
      line.parent = lastHeader;
    } else {
      // Otherwise link to the last item at the previous level
      line.parent = lastParentAtLevel[effectiveIndent - 1] ?? -1;
    }
    
    // Update parent tracking at this level
    lastParentAtLevel[effectiveIndent] = i;
  }
  
  return result;
}

interface ParsedDate {
  type: 'simple' | 'time' | 'week' | 'duration';
  value: string;
  isProcessed?: boolean;
}

/**
 * Parse a date string into its components
 */
function parseDate(text: string): ParsedDate | null {
  // Already a Tana date reference
  if (text.startsWith('[[date:') && text.endsWith(']]')) {
    return {
      type: 'simple',
      value: text,
      isProcessed: true
    };
  }

  // Week format
  const weekMatch = text.match(/^Week (\d{1,2}),\s*(\d{4})$/);
  if (weekMatch) {
    const [_, week, year] = weekMatch;
    return {
      type: 'week',
      value: `${year}-W${week.padStart(2, '0')}`
    };
  }

  // Week range
  const weekRangeMatch = text.match(/^Weeks (\d{1,2})-(\d{1,2}),\s*(\d{4})$/);
  if (weekRangeMatch) {
    const [_, week1, week2, year] = weekRangeMatch;
    return {
      type: 'duration',
      value: `${year}-W${week1.padStart(2, '0')}/W${week2.padStart(2, '0')}`
    };
  }

  // ISO date with time
  const isoTimeMatch = text.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})$/);
  if (isoTimeMatch) {
    const [_, date, time] = isoTimeMatch;
    return {
      type: 'time',
      value: `${date} ${time}`
    };
  }

  // Legacy format with time
  const legacyTimeMatch = text.match(/^(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+)?([A-Z][a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,\s*(\d{4})(?:,\s*(\d{1,2}):(\d{2})\s*(AM|PM))?$/);
  if (legacyTimeMatch) {
    const [_, month, day, year, hour, min, ampm] = legacyTimeMatch;
    if (hour && min && ampm) {
      const h = parseInt(hour);
      const adjustedHour = ampm === 'PM' && h < 12 ? h + 12 : (ampm === 'AM' && h === 12 ? 0 : h);
      return {
        type: 'time',
        value: `${year}-${getMonthNumber(month)}-${day.padStart(2, '0')} ${adjustedHour.toString().padStart(2, '0')}:${min}`
      };
    }
    return {
      type: 'simple',
      value: `${year}-${getMonthNumber(month)}-${day.padStart(2, '0')}`
    };
  }

  // Duration with mixed formats
  const durationMatch = text.match(/^([A-Z][a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s*-\s*([A-Z][a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,\s*(\d{4})$/);
  if (durationMatch) {
    const [_, month1, day1, month2, day2, year] = durationMatch;
    return {
      type: 'duration',
      value: `${year}-${getMonthNumber(month1)}-${day1.padStart(2, '0')}/${year}-${getMonthNumber(month2)}-${day2.padStart(2, '0')}`
    };
  }

  // ISO duration
  const isoDurationMatch = text.match(/^(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})$/);
  if (isoDurationMatch) {
    const [_, start, end] = isoDurationMatch;
    return {
      type: 'duration',
      value: `${start}/${end}`
    };
  }

  // Simple ISO date
  const isoMatch = text.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (isoMatch) {
    return {
      type: 'simple',
      value: isoMatch[1]
    };
  }

  // Month and year
  const monthYearMatch = text.match(/^(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+)?([A-Z][a-z]+)(?:\s+)?(?:⌘\s+)?(\d{4})$/);
  if (monthYearMatch) {
    const [_, month, year] = monthYearMatch;
    return {
      type: 'simple',
      value: `${year}-${getMonthNumber(month)}`
    };
  }

  // Year only
  const yearMatch = text.match(/^(?:⌘\s+)?(\d{4})$/);
  if (yearMatch) {
    return {
      type: 'simple',
      value: yearMatch[1]
    };
  }

  return null;
}

/**
 * Format a parsed date into Tana format
 */
function formatTanaDate(date: ParsedDate): string {
  if (date.isProcessed) return date.value;
  
  switch (date.type) {
    case 'simple':
      return `[[date:${date.value}]]`;
    case 'time':
      return `[[date:${date.value}]]`;
    case 'week':
      return `[[date:${date.value}]]`;
    case 'duration':
      return `[[date:${date.value}]]`;
    default:
      return date.value;
  }
}

/**
 * Convert markdown date formats to Tana date format
 */
function convertDates(text: string): string {
  // First protect URLs and existing references
  const protectedItems: string[] = [];
  text = text.replace(/(?:\[\[.*?\]\]|https?:\/\/[^\s)]+|\[[^\]]+\]\([^)]+\))/g, (match) => {
    protectedItems.push(match);
    return `__PROTECTED_${protectedItems.length - 1}__`;
  });

  // Process dates
  text = text.replace(/(?:\[\[date:)?(?:\[\[.*?\]\]|\d{4}(?:-\d{2}(?:-\d{2})?)?(?:\s+\d{2}:\d{2})?(?:\/(?:\[\[.*?\]\]|\d{4}(?:-\d{2}(?:-\d{2})?)?(?:\s+\d{2}:\d{2})?))?)(?:\]\])?|(?:Week \d{1,2},\s*\d{4})|(?:Weeks \d{1,2}-\d{1,2},\s*\d{4})|(?:[A-Z][a-z]+\s+(?:⌘\s+)?\d{4})|(?:[A-Z][a-z]+ \d{1,2}(?:st|nd|rd|th)?,\s*\d{4}(?:,\s*\d{1,2}:\d{2}\s*(?:AM|PM))?)|(?:[A-Z][a-z]+ \d{1,2}(?:st|nd|rd|th)?\s*-\s*[A-Z][a-z]+ \d{1,2}(?:st|nd|rd|th)?,\s*\d{4})/g, 
    (match) => {
      const parsed = parseDate(match);
      return parsed ? formatTanaDate(parsed) : match;
    });

  // Restore protected content
  text = text.replace(/__PROTECTED_(\d+)__/g, (_, index) => protectedItems[parseInt(index)]);

  return text;
}

/**
 * Convert month abbreviation to number (01-12)
 */
function getMonthNumber(month: string): string {
  const months: { [key: string]: string } = {
    'January': '01', 'Jan': '01',
    'February': '02', 'Feb': '02',
    'March': '03', 'Mar': '03',
    'April': '04', 'Apr': '04',
    'May': '05',
    'June': '06', 'Jun': '06',
    'July': '07', 'Jul': '07',
    'August': '08', 'Aug': '08',
    'September': '09', 'Sep': '09',
    'October': '10', 'Oct': '10',
    'November': '11', 'Nov': '11',
    'December': '12', 'Dec': '12'
  };
  return months[month] || '01';
}

/**
 * Convert markdown fields to Tana fields
 */
function convertFields(text: string): string {
  // Skip if already contains a field marker
  if (text.includes('::')) return text;
  
  // Skip if it's a table row
  if (text.includes('|')) return text;
  
  return text.replace(/^(\s*[-*+]\s+)?([^:\n]+):\s+([^\n]+)$/gm, (match, prefix, key, value) => {
    // Skip if value is already a reference
    if (value.match(/^\[\[/)) return match;
    return `${prefix || ''}${key}::${value}`;
  });
}

/**
 * Process inline formatting
 */
function processInlineFormatting(text: string): string {
  // First protect URLs and existing references
  const protectedItems: string[] = [];
  text = text.replace(/(\[\[.*?\]\]|https?:\/\/[^\s)]+)/g, (match) => {
    protectedItems.push(match);
    return `__PROTECTED_${protectedItems.length - 1}__`;
  });
  
  // Process formatting first
  text = text
    // Bold/italic
    .replace(/\*\*([^*]+)\*\*/g, '**$1**')
    .replace(/\*([^*]+)\*/g, '__$1__')
    // Highlight
    .replace(/==([^=]+)==/g, '^^$1^^');
  
  // Handle image syntax first
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, title, url) => 
    title ? `${title}::!${title} ${url}` : `!Image ${url}`);
  
  // Handle link syntax next (but preserve the bracketed text for now)
  let linkItems: {[key: string]: string} = {};
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, linkText, url) => {
    const key = `__LINK_${Object.keys(linkItems).length}__`;
    linkItems[key] = `${linkText} ${url}`;
    return key;
  });
  
  // Preserve bracketed elements that are not links
  // Fix for issue #1: "bracketed elements in text become supertags when they shouldn't"
  // We need to preserve regular bracketed text [like this] so it doesn't get converted
  text = text.replace(/\[([^\]]+)\]/g, (match) => {
    protectedItems.push(match);
    return `__PROTECTED_${protectedItems.length - 1}__`;
  });
  
  // Note: We are deliberately NOT converting parentheses to tags anymore.
  // Previous behavior:
  // text = text.replace(/\(([^)]+)\)/g, (_, tag) => {
  //   if (tag.match(/^\[\[.*\]\]$/)) return `(${tag})`;
  //   return tag.includes(' ') ? `#[[${tag}]]` : `#${tag}`;
  // });
  // This was causing regular text in parentheses to be incorrectly converted to tags.
  // Tags in Markdown should already use the # symbol, which will be preserved.
  
  // Restore links
  text = text.replace(/__LINK_(\d+)__/g, (_, index) => linkItems[`__LINK_${index}__`]);
  
  // Restore protected content
  text = text.replace(/__PROTECTED_(\d+)__/g, (_, index) => protectedItems[parseInt(index)]);
  
  return text;
}

/**
 * Process code blocks - just extract the content as plain text
 */
function processCodeBlock(lines: string[]): string {
  // Skip the first and last lines (the ```)
  return lines
    .slice(1, -1)
    .map(line => line.trim())
    .join('\n');
}

/**
 * Process table row
 * @param row - Table row text
 * @returns Processed row text
 */
function processTableRow(text: string): string {
  return text
    .split('|')
    .map(cell => cell.trim())
    .filter(Boolean)
    .join(' | ');
}

/**
 * Convert markdown to Tana format
 */
export function convertToTana(inputText: string | undefined | null): string {
  if (!inputText) return "No text selected.";
  
  // Split into lines and parse
  const lines = inputText.split('\n')
    .map(line => parseLine(line));
  
  // Build hierarchy
  const hierarchicalLines = buildHierarchy(lines);
  
  // Generate output
  let output = "%%tana%%\n";
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];
  
  for (const line of hierarchicalLines) {
    const content = line.content.trim();
    if (!content) continue;
    
    // Calculate indent based on parent chain
    let indent = "";
    if (line.parent !== undefined && line.parent >= 0) {
      let depth = 1;
      let currentParent = hierarchicalLines[line.parent];
      while (currentParent?.parent !== undefined && currentParent.parent >= 0) {
        depth++;
        currentParent = hierarchicalLines[currentParent.parent];
      }
      indent = "  ".repeat(depth);
    }
    
    // Handle code blocks
    if (line.isCodeBlock || inCodeBlock) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockLines = [line.raw];
      } else if (line.isCodeBlock) {
        inCodeBlock = false;
        codeBlockLines.push(line.raw);
        output += `${indent}- ${processCodeBlock(codeBlockLines)}\n`;
        codeBlockLines = [];
      } else {
        codeBlockLines.push(line.raw);
      }
      continue;
    }
    
    // Process line content
    let processedContent = content;
    
    // Handle headers
    if (line.isHeader) {
      const match = content.match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        processedContent = `!! ${match[2]}`;
      }
    } else {
      // Remove list markers but preserve checkboxes
      processedContent = processedContent.replace(/^[-*+]\s+(?!\[[ x]\])/, '');
      
      // Convert fields first
      processedContent = convertFields(processedContent);
      
      // Then convert dates
      processedContent = convertDates(processedContent);
      
      // Finally process inline formatting
      processedContent = processInlineFormatting(processedContent);
    }
    
    output += `${indent}- ${processedContent}\n`;
  }
  
  return output;
}