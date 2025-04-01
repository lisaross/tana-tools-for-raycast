#!/usr/bin/env python3
"""
A Python script to convert markdown text to Tana Paste format.
This script implements the same conversion logic as the Raycast extension.
"""

import re
from datetime import datetime

class Line:
    """Represents a line of text with its structure."""
    def __init__(self, content, indent, raw, is_header, is_code_block, parent=None):
        self.content = content
        self.indent = indent
        self.raw = raw
        self.is_header = is_header
        self.is_code_block = is_code_block
        self.parent = parent

class ParsedDate:
    """Represents a parsed date with its type and value."""
    def __init__(self, type, value, is_processed=False):
        self.type = type  # 'simple', 'time', 'week', or 'duration'
        self.value = value
        self.is_processed = is_processed

def parse_line(line):
    """Parse a line to determine its structure."""
    raw = line
    
    # Calculate indent level based on spaces
    match = re.match(r'^(\s*)', line)
    spaces = len(match.group(1)) if match else 0
    indent = spaces // 2
    
    # Get content without indentation
    content = line[spaces:].rstrip()
    
    # Detect if it's a header
    is_header = content.startswith('#')
    
    # Detect if it's a code block
    is_code_block = content.startswith('```')
    
    return Line(content, indent, raw, is_header, is_code_block)

def build_hierarchy(lines):
    """Build the hierarchy by linking lines to their parents."""
    if not lines:
        return lines
    
    result = lines.copy()
    last_header = None
    last_parent_at_level = [-1]
    in_code_block = False
    code_block_parent = None
    
    for i, line in enumerate(result):
        content = line.content.strip()
        
        # Skip empty lines
        if not content:
            continue
        
        # Handle code blocks
        if line.is_code_block or in_code_block:
            if not in_code_block:
                in_code_block = True
                code_block_parent = last_parent_at_level[-1]
            line.parent = code_block_parent
            if line.is_code_block and in_code_block:
                in_code_block = False
                code_block_parent = None
            continue
        
        # Handle headers
        if line.is_header:
            level = len(re.match(r'^#+', content).group(0)) if re.match(r'^#+', content) else 1
            line.parent = -1
            last_header = i
            # Reset parent tracking at this level
            last_parent_at_level = last_parent_at_level[:level]
            last_parent_at_level.append(i)
            continue
        
        # Handle list items and content
        effective_indent = line.indent
        
        # Find the appropriate parent
        while len(last_parent_at_level) > effective_indent + 1:
            last_parent_at_level.pop()
        
        # If we're at the first level under a header, link to the header
        if effective_indent == 0 and last_header is not None:
            line.parent = last_header
        else:
            # Otherwise link to the last item at the previous level
            line.parent = last_parent_at_level[effective_indent - 1] if effective_indent > 0 else -1
        
        # Update parent tracking at this level
        if effective_indent >= len(last_parent_at_level):
            last_parent_at_level.append(i)
        else:
            last_parent_at_level[effective_indent] = i
    
    return result

def get_month_number(month):
    """Convert month abbreviation to number (01-12)."""
    months = {
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
    }
    return months.get(month, '01')

def parse_date(text):
    """Parse a date string into its components."""
    # Already a Tana date reference
    if text.startswith('[[date:') and text.endswith(']]'):
        return ParsedDate('simple', text, True)

    # Week format
    week_match = re.match(r'^Week (\d{1,2}),\s*(\d{4})$', text)
    if week_match:
        _, week, year = week_match.groups()
        return ParsedDate('week', f"{year}-W{week.zfill(2)}")

    # Week range
    week_range_match = re.match(r'^Weeks (\d{1,2})-(\d{1,2}),\s*(\d{4})$', text)
    if week_range_match:
        _, week1, week2, year = week_range_match.groups()
        return ParsedDate('duration', f"{year}-W{week1.zfill(2)}/W{week2.zfill(2)}")

    # ISO date with time
    iso_time_match = re.match(r'^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})$', text)
    if iso_time_match:
        _, date, time = iso_time_match.groups()
        return ParsedDate('time', f"{date} {time}")

    # Legacy format with time
    legacy_time_match = re.match(
        r'^(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+)?([A-Z][a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,\s*(\d{4})(?:,\s*(\d{1,2}):(\d{2})\s*(AM|PM))?$',
        text
    )
    if legacy_time_match:
        _, month, day, year, hour, min, ampm = legacy_time_match.groups()
        if hour and min and ampm:
            h = int(hour)
            adjusted_hour = (h + 12 if ampm == 'PM' and h < 12 else 0 if ampm == 'AM' and h == 12 else h)
            return ParsedDate('time', f"{year}-{get_month_number(month)}-{day.zfill(2)} {adjusted_hour:02d}:{min}")
        return ParsedDate('simple', f"{year}-{get_month_number(month)}-{day.zfill(2)}")

    # Duration with mixed formats
    duration_match = re.match(
        r'^([A-Z][a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s*-\s*([A-Z][a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,\s*(\d{4})$',
        text
    )
    if duration_match:
        _, month1, day1, month2, day2, year = duration_match.groups()
        return ParsedDate('duration', f"{year}-{get_month_number(month1)}-{day1.zfill(2)}/{year}-{get_month_number(month2)}-{day2.zfill(2)}")

    # ISO duration
    iso_duration_match = re.match(r'^(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})$', text)
    if iso_duration_match:
        _, start, end = iso_duration_match.groups()
        return ParsedDate('duration', f"{start}/{end}")

    # Simple ISO date
    iso_match = re.match(r'^(\d{4}-\d{2}-\d{2})$', text)
    if iso_match:
        return ParsedDate('simple', iso_match.group(1))

    # Month and year
    month_year_match = re.match(r'^(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+)?([A-Z][a-z]+)(?:\s+)?(?:⌘\s+)?(\d{4})$', text)
    if month_year_match:
        _, month, year = month_year_match.groups()
        return ParsedDate('simple', f"{year}-{get_month_number(month)}")

    # Year only
    year_match = re.match(r'^(?:⌘\s+)?(\d{4})$', text)
    if year_match:
        return ParsedDate('simple', year_match.group(1))

    return None

def format_tana_date(date):
    """Format a parsed date into Tana format."""
    if date.is_processed:
        return date.value
    
    return f"[[date:{date.value}]]"

def convert_dates(text):
    """Convert markdown date formats to Tana date format."""
    # First protect URLs and existing references
    protected_items = []
    text = re.sub(r'(?:\[\[.*?\]\]|https?://[^\s)]+|\[[^\]]+\]\([^)]+\))', 
                 lambda m: f"__PROTECTED_{len(protected_items)}__" and protected_items.append(m.group(0)) or f"__PROTECTED_{len(protected_items)-1}__",
                 text)

    # Process dates
    date_pattern = r'(?:\[\[date:)?(?:\[\[.*?\]\]|\d{4}(?:-\d{2}(?:-\d{2})?)?(?:\s+\d{2}:\d{2})?(?:\/(?:\[\[.*?\]\]|\d{4}(?:-\d{2}(?:-\d{2})?)?(?:\s+\d{2}:\d{2})?))?)(?:\]\])?|(?:Week \d{1,2},\s*\d{4})|(?:Weeks \d{1,2}-\d{1,2},\s*\d{4})|(?:[A-Z][a-z]+\s+(?:⌘\s+)?\d{4})|(?:[A-Z][a-z]+ \d{1,2}(?:st|nd|rd|th)?,\s*\d{4}(?:,\s*\d{1,2}:\d{2}\s*(?:AM|PM))?)|(?:[A-Z][a-z]+ \d{1,2}(?:st|nd|rd|th)?\s*-\s*[A-Z][a-z]+ \d{1,2}(?:st|nd|rd|th)?,\s*\d{4})'
    text = re.sub(date_pattern, 
                 lambda m: format_tana_date(parse_date(m.group(0))) if parse_date(m.group(0)) else m.group(0),
                 text)

    # Restore protected content
    text = re.sub(r'__PROTECTED_(\d+)__', 
                 lambda m: protected_items[int(m.group(1))],
                 text)

    return text

def convert_fields(text):
    """Convert markdown fields to Tana fields."""
    # Skip if already contains a field marker
    if '::' in text:
        return text
    
    # Skip if it's a table row
    if '|' in text:
        return text
    
    return re.sub(r'^(\s*[-*+]\s+)?([^:\n]+):\s+([^\n]+)$',
                 lambda m: f"{m.group(1) or ''}{m.group(2)}::{m.group(3)}" if not m.group(3).startswith('[[') else m.group(0),
                 text,
                 flags=re.MULTILINE)

def process_inline_formatting(text):
    """Process inline formatting."""
    # First protect URLs and existing references
    protected_items = []
    text = re.sub(r'(?:\[\[.*?\]\]|https?://[^\s)]+|\[[^\]]+\]\([^)]+\))',
                 lambda m: f"__PROTECTED_{len(protected_items)}__" and protected_items.append(m.group(0)) or f"__PROTECTED_{len(protected_items)-1}__",
                 text)

    # Process formatting
    text = re.sub(r'\*\*([^*]+)\*\*', r'**\1**', text)  # Bold
    text = re.sub(r'\*([^*]+)\*', r'__\1__', text)      # Italic
    text = re.sub(r'==([^=]+)==', r'^^\1^^', text)      # Highlight
    text = re.sub(r'!\[([^\]]*)\]\(([^)]+)\)',          # Images
                 lambda m: f"{m.group(1)}::!{m.group(1)} {m.group(2)}" if m.group(1) else f"!Image {m.group(2)}",
                 text)
    text = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'\1 \2', text)  # Links
    text = re.sub(r'\(([^)]+)\)',                        # Tags
                 lambda m: f"#[[{m.group(1)}]]" if ' ' in m.group(1) else f"#{m.group(1)}" if not m.group(1).startswith('[[') else f"({m.group(1)})",
                 text)

    # Restore protected content
    text = re.sub(r'__PROTECTED_(\d+)__',
                 lambda m: protected_items[int(m.group(1))],
                 text)

    return text

def process_code_block(lines):
    """Process code blocks - just extract the content as plain text."""
    return '\n'.join(line.strip() for line in lines[1:-1])

def process_table_row(text):
    """Process table row."""
    return ' | '.join(cell.strip() for cell in text.split('|') if cell.strip())

def convert_to_tana(input_text):
    """Convert markdown to Tana format."""
    if not input_text:
        return "No text selected."
    
    # Split into lines and parse
    lines = [parse_line(line) for line in input_text.split('\n')]
    
    # Build hierarchy
    hierarchical_lines = build_hierarchy(lines)
    
    # Generate output
    output = ["%%tana%%"]
    in_code_block = False
    code_block_lines = []
    
    for line in hierarchical_lines:
        content = line.content.strip()
        if not content:
            continue
        
        # Calculate indent based on parent chain
        indent = ""
        if line.parent is not None and line.parent >= 0:
            depth = 1
            current_parent = hierarchical_lines[line.parent]
            while current_parent.parent is not None and current_parent.parent >= 0:
                depth += 1
                current_parent = hierarchical_lines[current_parent.parent]
            indent = "  " * depth
        
        # Handle code blocks
        if line.is_code_block or in_code_block:
            if not in_code_block:
                in_code_block = True
                code_block_lines = [line.raw]
            elif line.is_code_block:
                in_code_block = False
                code_block_lines.append(line.raw)
                output.append(f"{indent}- {process_code_block(code_block_lines)}")
                code_block_lines = []
            else:
                code_block_lines.append(line.raw)
            continue
        
        # Process line content
        processed_content = content
        
        # Handle headers
        if line.is_header:
            match = re.match(r'^(#{1,6})\s+(.+)$', content)
            if match:
                processed_content = f"!! {match.group(2)}"
        else:
            # Remove list markers but preserve checkboxes
            processed_content = re.sub(r'^[-*+]\s+(?!\[[ x]\])', '', processed_content)
            
            # Convert fields first
            processed_content = convert_fields(processed_content)
            
            # Then convert dates
            processed_content = convert_dates(processed_content)
            
            # Finally process inline formatting
            processed_content = process_inline_formatting(processed_content)
        
        output.append(f"{indent}- {processed_content}")
    
    return '\n'.join(output)

def chunk_content(content, max_chunk_size=90000):
    """
    Split content into chunks that are smaller than the specified size.
    Each chunk will try to break at a logical point (after a complete node).
    Each chunk will start with the Tana header.
    """
    if len(content) <= max_chunk_size:
        return [content]
    
    chunks = []
    current_chunk = ["%%tana%%"]  # Start with header
    current_size = len("%%tana%%\n")  # Account for header and newline
    
    # Split content into lines, skipping the header if it exists
    lines = content.split('\n')
    if lines[0] == "%%tana%%":
        lines = lines[1:]
    
    for line in lines:
        line_size = len(line) + 1  # +1 for the newline character
        
        # If adding this line would exceed the chunk size and we already have content
        if current_size + line_size > max_chunk_size and len(current_chunk) > 1:  # > 1 because we always have the header
            # Join the current chunk and add it to chunks
            chunks.append('\n'.join(current_chunk))
            current_chunk = ["%%tana%%"]  # Start new chunk with header
            current_size = len("%%tana%%\n")  # Reset size with header
        
        current_chunk.append(line)
        current_size += line_size
    
    # Add the last chunk if it exists
    if len(current_chunk) > 1:  # > 1 because we always have the header
        chunks.append('\n'.join(current_chunk))
    
    return chunks

def main():
    """Main function to handle command line arguments and file processing."""
    import argparse
    import sys
    import os
    
    parser = argparse.ArgumentParser(description='Convert markdown text to Tana Paste format')
    parser.add_argument('input_file', help='Input markdown file to convert')
    parser.add_argument('-o', '--output', help='Output file (default: stdout)')
    parser.add_argument('--chunk-size', type=int, default=90000, help='Maximum size of each chunk in characters (default: 90000)')
    
    args = parser.parse_args()
    
    try:
        with open(args.input_file, 'r', encoding='utf-8') as f:
            input_text = f.read()
        
        tana_output = convert_to_tana(input_text)
        
        # Split into chunks if needed
        chunks = chunk_content(tana_output, args.chunk_size)
        
        if args.output:
            # If output is specified, create numbered files
            base_name, ext = os.path.splitext(args.output)
            for i, chunk in enumerate(chunks, 1):
                chunk_file = f"{base_name}_{i}{ext}"
                with open(chunk_file, 'w', encoding='utf-8') as f:
                    f.write(chunk)
                print(f"Created chunk {i} in {chunk_file}")
        else:
            # If no output specified, print chunks with separators
            for i, chunk in enumerate(chunks, 1):
                print(f"\n=== Chunk {i} ===\n")
                print(chunk)
                print("\n" + "="*50 + "\n")
            
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main() 