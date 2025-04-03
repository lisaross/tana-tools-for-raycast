import { convertToTana } from "../tana-converter";

describe("Tana Converter", () => {
  test("converts basic markdown bullet points", () => {
    const input = `- First item
- Second item
- Third item`;
    const expected = `%%tana%%
  - First item
  - Second item
  - Third item
`;
    expect(convertToTana(input)).toBe(expected);
  });

  test("converts numbered lists", () => {
    const input = `1. First item
2. Second item
3. Third item`;
    const expected = `%%tana%%
  - First item
  - Second item
  - Third item
`;
    expect(convertToTana(input)).toBe(expected);
  });

  test("converts markdown headings", () => {
    const input = `# Heading 1
## Heading 2
### Heading 3`;
    const expected = `%%tana%%
- Heading 1
  - Heading 2
    - Heading 3
`;
    expect(convertToTana(input)).toBe(expected);
  });

  test("handles nested lists", () => {
    const input = `- Parent
  - Child 1
  - Child 2
- Another parent`;
    const expected = `%%tana%%
  - Parent
    - Child 1
    - Child 2
  - Another parent
`;
    expect(convertToTana(input)).toBe(expected);
  });

  test("handles colons", () => {
    const input = `Topic: Some details about the topic`;
    const expected = `%%tana%%
  - Topic: Some details about the topic
`;
    expect(convertToTana(input)).toBe(expected);
  });

  test("handles real fields", () => {
    const input = `field::value`;
    const expected = `%%tana%%
  - field::value
`;
    expect(convertToTana(input)).toBe(expected);
  });

  test("handles real tags", () => {
    const input = `#tag`;
    const expected = `%%tana%%
- #tag
`;
    expect(convertToTana(input)).toBe(expected);
  });

  test("handles YouTube timestamps", () => {
    const input = `[00:00] Introduction
[01:23] Main topic`;
    const expected = `%%tana%%
  - [00:00] Introduction
  - [01:23] Main topic
`;
    expect(convertToTana(input)).toBe(expected);
  });

  test("preserves bold text and correct indentation hierarchy", () => {
    const input = `## The Context Intelligence Framework

### 1. Context Awareness: Knowing What You Know (and Don't)

**Definition:** The ability to identify, inventory, and evaluate the contextual assets your business possesses.

**Key Components:**
- **Knowledge Mapping:** Systematically documenting what your organization knows
- **Context Gaps:** Identifying critical missing contextual elements`;

    const result = convertToTana(input);

    // Check that output starts with %%tana%%
    expect(result.startsWith("%%tana%%")).toBe(true);

    // Check that bold text is preserved correctly
    expect(result.includes("**Definition:**")).toBe(true);
    expect(result.includes("*__Definition:__*")).toBe(false);
    expect(result.includes("**Key Components:**")).toBe(true);
    expect(result.includes("**Knowledge Mapping:**")).toBe(true);
    expect(result.includes("**Context Gaps:**")).toBe(true);

    // Check indentation hierarchy
    const lines = result.split("\n");
    const frameworkLine = lines.findIndex((line) =>
      line.includes("The Context Intelligence Framework"),
    );
    const awarenessLine = lines.findIndex((line) =>
      line.includes("1. Context Awareness"),
    );
    const definitionLine = lines.findIndex((line) =>
      line.includes("**Definition:**"),
    );

    // Verify correct line order
    expect(frameworkLine).toBeLessThan(awarenessLine);
    expect(awarenessLine).toBeLessThan(definitionLine);

    // Verify correct indentation
    const frameworkIndent = lines[frameworkLine].indexOf("-");
    const awarenessIndent = lines[awarenessLine].indexOf("-");
    const definitionIndent = lines[definitionLine].indexOf("-");

    expect(frameworkIndent).toBeLessThan(awarenessIndent);
    expect(awarenessIndent).toBeLessThan(definitionIndent);
  });
});
