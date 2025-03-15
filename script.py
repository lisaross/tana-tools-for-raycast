#!/usr/bin/python3

import sys
import re

def markdown_to_tana(markdown_text):
    # Start with the Tana Paste identifier
    tana_output = "%%tana%%\n"
    
    # Split into lines
    lines = markdown_text.strip().split('\n')
    
    # Track the current heading level and content
    current_level = 0
    paragraph_buffer = []
    is_in_list = False
    had_text_after_heading = False
    
    i = 0
    while i < len(lines):
        line = lines[i]
        
        # Check for headings
        heading_match = re.match(r'^(#{1,6})\s+(.+)$', line)
        
        # Check for bullet or numbered lists
        list_match = re.match(r'^(\s*)([\*\-\+]|\d+\.)\s+(.+)$', line)
        
        if heading_match:
            # Process any buffered paragraph
            if paragraph_buffer:
                indent = "  " * current_level
                tana_output += f"{indent}- {' '.join(paragraph_buffer)}\n"
                paragraph_buffer = []
            
            level = len(heading_match.group(1))
            heading_text = heading_match.group(2)
            
            # Add heading as a node with heading style
            indent = "  " * (level - 1)
            tana_output += f"{indent}- !! {heading_text}\n"
            
            current_level = level
            is_in_list = False
            had_text_after_heading = False
            
        elif list_match:
            # Process any buffered paragraph before starting a list
            if paragraph_buffer and not is_in_list:
                indent = "  " * current_level
                tana_output += f"{indent}- {' '.join(paragraph_buffer)}\n"
                paragraph_buffer = []
                had_text_after_heading = True
            
            # Extract list content
            leading_space = list_match.group(1)
            list_marker = list_match.group(2)
            list_content = list_match.group(3)
            
            # Calculate list level based on indentation in original markdown
            # Each 2 spaces or 1 tab is one level of indentation
            list_indent_level = len(leading_space.replace('\t', '  ')) // 2
            
            # If list is directly under a heading (no text in between), add only one level
            # Otherwise, add one extra level of indentation (list_indent_level + 1)
            if not had_text_after_heading and list_indent_level == 0:
                total_indent_level = current_level
            else:
                total_indent_level = current_level + list_indent_level + 1
                
            indent = "  " * total_indent_level
            
            # Add as a node
            tana_output += f"{indent}- {list_content}\n"
            is_in_list = True
            
        elif line.strip() == '':
            # Empty line - flush paragraph buffer
            if paragraph_buffer:
                indent = "  " * current_level
                tana_output += f"{indent}- {' '.join(paragraph_buffer)}\n"
                paragraph_buffer = []
                had_text_after_heading = True
            is_in_list = False
            
        else:
            # If not in a list, treat as regular paragraph text
            if not is_in_list:
                if paragraph_buffer:
                    paragraph_buffer.append(line)
                else:
                    paragraph_buffer = [line]
                had_text_after_heading = True
            else:
                # This could be a continuation of a list item or a new paragraph within a list
                # Check if the next line is indented and not a new list item
                if line.startswith('    ') and not re.match(r'^\s*([\*\-\+]|\d+\.)\s+', line):
                    # It's a continuation of the previous list item or a code block
                    # Get the current indentation level and add the content
                    if not had_text_after_heading:
                        # If list is directly under a heading with no text in between
                        total_indent_level = current_level
                    else:
                        total_indent_level = current_level + 1  # One extra level for being in a list
                    indent = "  " * total_indent_level
                    tana_output += f"{indent}- {line.strip()}\n"
                else:
                    # It's regular text, add it as a new node
                    total_indent_level = current_level
                    indent = "  " * total_indent_level
                    tana_output += f"{indent}- {line.strip()}\n"
        
        i += 1
    
    # Process any remaining paragraph
    if paragraph_buffer:
        indent = "  " * current_level
        tana_output += f"{indent}- {' '.join(paragraph_buffer)}\n"
    
    return tana_output

if __name__ == "__main__":
    # Read from stdin
    markdown_input = sys.stdin.read()
    
    # Convert to Tana Paste format
    tana_output = markdown_to_tana(markdown_input)
    
    # Output to stdout
    print(tana_output)