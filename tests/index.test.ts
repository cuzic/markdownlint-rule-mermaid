import type { LintError } from 'markdownlint';
import { lint } from 'markdownlint/promise';
import { describe, expect, it } from 'vitest';
import mermaidSyntaxRule from '../src/index.js';

async function runLint(
  content: string,
  config: Record<string, unknown> = {}
): Promise<LintError[]> {
  const result = await lint({
    strings: { test: content },
    customRules: [mermaidSyntaxRule],
    config: {
      default: false,
      'mermaid-syntax': config,
    },
  });
  return result.test;
}

describe('mermaid-syntax rule', () => {
  describe('valid mermaid diagrams', () => {
    it('should pass valid flowchart', async () => {
      const content = `
\`\`\`mermaid
flowchart LR
  A --> B
  B --> C
\`\`\`
`;
      const errors = await runLint(content);
      expect(errors).toHaveLength(0);
    });

    it('should pass valid sequence diagram', async () => {
      const content = `
\`\`\`mermaid
sequenceDiagram
  Alice->>Bob: Hello
  Bob-->>Alice: Hi
\`\`\`
`;
      const errors = await runLint(content);
      expect(errors).toHaveLength(0);
    });

    it('should pass valid graph', async () => {
      const content = `
\`\`\`mermaid
graph TD
  A[Start] --> B{Decision}
  B -->|Yes| C[OK]
  B -->|No| D[Cancel]
\`\`\`
`;
      const errors = await runLint(content);
      expect(errors).toHaveLength(0);
    });

    it('should pass valid pie chart', async () => {
      const content = `
\`\`\`mermaid
pie title Pets
  "Dogs" : 386
  "Cats" : 85
  "Rats" : 15
\`\`\`
`;
      const errors = await runLint(content);
      expect(errors).toHaveLength(0);
    });

    it('should pass valid class diagram', async () => {
      const content = `
\`\`\`mermaid
classDiagram
  class Animal {
    +String name
    +eat()
  }
\`\`\`
`;
      const errors = await runLint(content);
      expect(errors).toHaveLength(0);
    });

    it('should pass diagram with comments', async () => {
      const content = `
\`\`\`mermaid
%% This is a comment
flowchart LR
  A --> B
\`\`\`
`;
      const errors = await runLint(content);
      expect(errors).toHaveLength(0);
    });

    it('should pass valid state diagram', async () => {
      const content = `
\`\`\`mermaid
stateDiagram-v2
  [*] --> Still
  Still --> [*]
  Still --> Moving
  Moving --> Still
\`\`\`
`;
      const errors = await runLint(content);
      expect(errors).toHaveLength(0);
    });

    it('should pass valid ER diagram', async () => {
      const content = `
\`\`\`mermaid
erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ LINE-ITEM : contains
\`\`\`
`;
      const errors = await runLint(content);
      expect(errors).toHaveLength(0);
    });

    it('should pass valid gantt chart', async () => {
      const content = `
\`\`\`mermaid
gantt
  title A Gantt Diagram
  section Section
  A task: a1, 2024-01-01, 30d
\`\`\`
`;
      const errors = await runLint(content);
      expect(errors).toHaveLength(0);
    });

    it('should ignore non-mermaid code blocks', async () => {
      const content = `
\`\`\`javascript
const x = 1;
\`\`\`

\`\`\`python
print("hello")
\`\`\`
`;
      const errors = await runLint(content);
      expect(errors).toHaveLength(0);
    });
  });

  describe('invalid mermaid diagrams', () => {
    it('should detect empty mermaid block with helpful message', async () => {
      const content = `
\`\`\`mermaid

\`\`\`
`;
      const errors = await runLint(content);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].errorDetail).toContain('Empty Mermaid diagram');
      expect(errors[0].errorDetail).toContain('flowchart');
    });

    it('should detect unknown diagram type with suggestions', async () => {
      const content = `
\`\`\`mermaid
invalidDiagram
  A --> B
\`\`\`
`;
      const errors = await runLint(content);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].errorDetail).toContain('Unknown diagram type');
      expect(errors[0].errorDetail).toContain('Valid types');
    });

    it('should detect unclosed bracket with hint', async () => {
      const content = `
\`\`\`mermaid
flowchart LR
  A --> [B
\`\`\`
`;
      const errors = await runLint(content);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].errorDetail).toContain('bracket');
    });

    it('should detect unclosed subgraph with hint', async () => {
      const content = `
\`\`\`mermaid
flowchart LR
  subgraph A
    B --> C
\`\`\`
`;
      const errors = await runLint(content);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].errorDetail).toContain('subgraph');
    });

    it('should detect syntax errors in sequence diagram', async () => {
      const content = `
\`\`\`mermaid
sequenceDiagram
  Alice->Bob Hello
\`\`\`
`;
      const errors = await runLint(content);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].errorDetail).toContain('Incomplete');
    });

    it('should report correct line number for errors', async () => {
      const content = `
\`\`\`mermaid
flowchart LR
  A --> B
  C --> [D
\`\`\`
`;
      const errors = await runLint(content);
      expect(errors.length).toBeGreaterThan(0);
      // Error on line 3 of diagram content, startLine is 2 (fence line), so 2 + 3 - 1 = 4
      expect(errors[0].lineNumber).toBe(4);
    });
  });

  describe('multiple code blocks', () => {
    it('should validate all mermaid blocks in document', async () => {
      const content = `
# Diagram 1

\`\`\`mermaid
flowchart LR
  A --> B
\`\`\`

# Diagram 2

\`\`\`mermaid
sequenceDiagram
  Alice->>Bob: Hello
\`\`\`
`;
      const errors = await runLint(content);
      expect(errors).toHaveLength(0);
    });

    it('should report errors from multiple blocks', async () => {
      const content = `
\`\`\`mermaid

\`\`\`

\`\`\`mermaid

\`\`\`
`;
      const errors = await runLint(content);
      expect(errors.length).toBe(2);
    });
  });

  describe('configuration', () => {
    it('should work with basic mode enabled', async () => {
      const content = `
\`\`\`mermaid
flowchart LR
  A --> B
\`\`\`
`;
      const errors = await runLint(content, { basic: true });
      expect(errors).toHaveLength(0);
    });

    it('should detect empty block in basic mode', async () => {
      const content = `
\`\`\`mermaid

\`\`\`
`;
      const errors = await runLint(content, { basic: true });
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
