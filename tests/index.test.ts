import type { LintError } from 'markdownlint';
import { lint } from 'markdownlint/promise';
import { describe, expect, it } from 'vitest';
import mermaidSyntaxRule, { katexSyntaxRule } from '../src/index.js';

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

  describe('HTML embedded mermaid', () => {
    it('should validate mermaid in pre tag with class', async () => {
      const content = `
<pre class="mermaid">
flowchart LR
  A --> B
</pre>
`;
      const errors = await runLint(content);
      expect(errors).toHaveLength(0);
    });

    it('should validate mermaid in div tag with class', async () => {
      const content = `
<div class="mermaid">
flowchart LR
  A --> B
</div>
`;
      const errors = await runLint(content);
      expect(errors).toHaveLength(0);
    });

    it('should validate mermaid in code tag with language-mermaid class', async () => {
      const content = `
<code class="language-mermaid">
flowchart LR
  A --> B
</code>
`;
      const errors = await runLint(content);
      expect(errors).toHaveLength(0);
    });

    it('should detect errors in HTML mermaid blocks', async () => {
      const content = `
<pre class="mermaid">
flowchart LR
  A --> [B
</pre>
`;
      const errors = await runLint(content);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].errorDetail).toContain('bracket');
    });

    it('should detect empty HTML mermaid blocks', async () => {
      const content = `
<div class="mermaid">
</div>
`;
      const errors = await runLint(content);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].errorDetail).toContain('Empty Mermaid diagram');
    });

    it('should handle mermaid class with other classes', async () => {
      const content = `
<pre class="diagram mermaid syntax-highlight">
flowchart LR
  A --> B
</pre>
`;
      const errors = await runLint(content);
      expect(errors).toHaveLength(0);
    });

    it('should handle HTML entities in mermaid code', async () => {
      const content = `
<pre class="mermaid">
flowchart LR
  A --&gt; B
</pre>
`;
      const errors = await runLint(content);
      expect(errors).toHaveLength(0);
    });

    it('should validate multiple HTML mermaid blocks', async () => {
      const content = `
<div class="mermaid">
flowchart LR
  A --> B
</div>

<pre class="mermaid">
sequenceDiagram
  Alice->>Bob: Hello
</pre>
`;
      const errors = await runLint(content);
      expect(errors).toHaveLength(0);
    });

    it('should report errors from multiple HTML blocks', async () => {
      const content = `
<div class="mermaid">
</div>

<pre class="mermaid">
</pre>
`;
      const errors = await runLint(content);
      expect(errors.length).toBe(2);
    });

    it('should ignore non-mermaid HTML blocks', async () => {
      const content = `
<pre class="javascript">
const x = 1;
</pre>

<div class="diagram">
some content
</div>
`;
      const errors = await runLint(content);
      expect(errors).toHaveLength(0);
    });

    it('should validate mixed fence and HTML blocks', async () => {
      const content = `
\`\`\`mermaid
flowchart LR
  A --> B
\`\`\`

<div class="mermaid">
sequenceDiagram
  Alice->>Bob: Hello
</div>
`;
      const errors = await runLint(content);
      expect(errors).toHaveLength(0);
    });
  });
});

// =============================================================================
// KaTeX/Math Rule Tests
// =============================================================================

async function runKatexLint(
  content: string,
  config: Record<string, unknown> = {}
): Promise<LintError[]> {
  const result = await lint({
    strings: { test: content },
    customRules: [katexSyntaxRule],
    config: {
      default: false,
      'katex-syntax': config,
    },
  });
  return result.test;
}

describe('katex-syntax rule', () => {
  describe('valid math expressions', () => {
    it('should pass valid simple expression in math block', async () => {
      const content = `
\`\`\`math
E = mc^2
\`\`\`
`;
      const errors = await runKatexLint(content);
      expect(errors).toHaveLength(0);
    });

    it('should pass valid expression in latex block', async () => {
      const content = `
\`\`\`latex
\\frac{a}{b}
\`\`\`
`;
      const errors = await runKatexLint(content);
      expect(errors).toHaveLength(0);
    });

    it('should pass valid expression in tex block', async () => {
      const content = `
\`\`\`tex
\\sqrt{x^2 + y^2}
\`\`\`
`;
      const errors = await runKatexLint(content);
      expect(errors).toHaveLength(0);
    });

    it('should pass valid expression in katex block', async () => {
      const content = `
\`\`\`katex
\\sum_{i=1}^{n} x_i
\`\`\`
`;
      const errors = await runKatexLint(content);
      expect(errors).toHaveLength(0);
    });

    it('should pass valid integral expression', async () => {
      const content = `
\`\`\`math
\\int_{0}^{\\infty} e^{-x} dx
\`\`\`
`;
      const errors = await runKatexLint(content);
      expect(errors).toHaveLength(0);
    });

    it('should pass valid matrix expression', async () => {
      const content = `
\`\`\`math
\\begin{pmatrix}
a & b \\\\
c & d
\\end{pmatrix}
\`\`\`
`;
      const errors = await runKatexLint(content);
      expect(errors).toHaveLength(0);
    });

    it('should pass valid Greek letters', async () => {
      const content = `
\`\`\`math
\\alpha + \\beta = \\gamma
\`\`\`
`;
      const errors = await runKatexLint(content);
      expect(errors).toHaveLength(0);
    });

    it('should ignore non-math code blocks', async () => {
      const content = `
\`\`\`javascript
const x = 1;
\`\`\`

\`\`\`python
print("hello")
\`\`\`
`;
      const errors = await runKatexLint(content);
      expect(errors).toHaveLength(0);
    });
  });

  describe('invalid math expressions', () => {
    it('should detect empty math block', async () => {
      const content = `
\`\`\`math

\`\`\`
`;
      const errors = await runKatexLint(content);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].errorDetail).toContain('Empty math block');
    });

    it('should detect undefined control sequence', async () => {
      const content = `
\`\`\`math
\\unknowncommand
\`\`\`
`;
      const errors = await runKatexLint(content);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].errorDetail).toContain('Undefined control sequence');
    });

    it('should detect unclosed brace', async () => {
      const content = `
\`\`\`math
\\frac{1}{2
\`\`\`
`;
      const errors = await runKatexLint(content);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should detect missing argument', async () => {
      const content = `
\`\`\`math
\\frac{1}
\`\`\`
`;
      const errors = await runKatexLint(content);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should detect unbalanced braces', async () => {
      const content = `
\`\`\`math
x^{2
\`\`\`
`;
      const errors = await runKatexLint(content);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should report helpful hint for undefined command', async () => {
      const content = `
\`\`\`math
\\badcmd
\`\`\`
`;
      const errors = await runKatexLint(content);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].errorDetail).toContain('typos');
    });
  });

  describe('multiple math blocks', () => {
    it('should validate all math blocks in document', async () => {
      const content = `
# Equation 1

\`\`\`math
E = mc^2
\`\`\`

# Equation 2

\`\`\`latex
F = ma
\`\`\`
`;
      const errors = await runKatexLint(content);
      expect(errors).toHaveLength(0);
    });

    it('should report errors from multiple blocks', async () => {
      const content = `
\`\`\`math

\`\`\`

\`\`\`latex

\`\`\`
`;
      const errors = await runKatexLint(content);
      expect(errors.length).toBe(2);
    });
  });

  describe('HTML embedded math', () => {
    it('should validate math in span tag with class', async () => {
      const content = `
<span class="math">
E = mc^2
</span>
`;
      const errors = await runKatexLint(content);
      expect(errors).toHaveLength(0);
    });

    it('should validate math in div tag with class', async () => {
      const content = `
<div class="math">
\\frac{a}{b}
</div>
`;
      const errors = await runKatexLint(content);
      expect(errors).toHaveLength(0);
    });

    it('should validate math in code tag with language-math class', async () => {
      const content = `
<code class="language-math">
x^2 + y^2 = z^2
</code>
`;
      const errors = await runKatexLint(content);
      expect(errors).toHaveLength(0);
    });

    it('should detect errors in HTML math blocks', async () => {
      const content = `
<span class="math">
\\unknownfunc
</span>
`;
      const errors = await runKatexLint(content);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].errorDetail).toContain('Undefined control sequence');
    });

    it('should handle HTML entities in math code', async () => {
      const content = `
<span class="math">
a &lt; b
</span>
`;
      const errors = await runKatexLint(content);
      expect(errors).toHaveLength(0);
    });
  });

  describe('configuration', () => {
    it('should work with displayMode enabled', async () => {
      const content = `
\`\`\`math
\\sum_{i=1}^{n} x_i
\`\`\`
`;
      const errors = await runKatexLint(content, { displayMode: true });
      expect(errors).toHaveLength(0);
    });
  });
});
