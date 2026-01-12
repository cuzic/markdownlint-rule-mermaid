/**
 * markdownlint-rule-mermaid
 * Validates Mermaid diagram syntax in Markdown code blocks
 */

import { JSDOM } from 'jsdom';
import { err, errAsync, ok, type Result, ResultAsync } from 'neverthrow';

export interface MermaidRuleConfig {
  /** Use basic validation only (skip mermaid parser) */
  basic?: boolean;
}

interface OnErrorParams {
  lineNumber: number;
  detail?: string;
  context?: string;
}

interface Token {
  type: string;
  info: string;
  content: string;
  lineNumber: number;
}

interface RuleParams {
  parsers: {
    markdownit: {
      tokens: Token[];
    };
  };
  config: MermaidRuleConfig;
}

type OnErrorCallback = (params: OnErrorParams) => void;

interface ParsedError {
  line: number | null;
  message: string;
  hint: string | null;
  context: string | null;
}

/**
 * Validation error that will be reported to markdownlint
 */
interface ValidationError {
  lineNumber: number;
  detail: string;
  context?: string;
}

interface MarkdownlintRule {
  names: string[];
  description: string;
  tags: string[];
  parser: string;
  asynchronous: boolean;
  function: (params: RuleParams, onError: OnErrorCallback) => Promise<void>;
}

/**
 * Code block to validate
 */
interface CodeBlock {
  code: string;
  startLine: number;
}

// Mermaid instance (lazy loaded)
let mermaidInstance: typeof import('mermaid').default | null = null;

/**
 * Setup DOM environment and initialize mermaid
 */
async function getMermaid(): Promise<typeof import('mermaid').default> {
  if (mermaidInstance) {
    return mermaidInstance;
  }

  // Setup minimal DOM environment for mermaid before importing
  if (typeof (globalThis as Record<string, unknown>).window === 'undefined') {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      pretendToBeVisual: true,
    });
    const g = globalThis as Record<string, unknown>;
    g.window = dom.window;
    g.document = dom.window.document;
    g.DOMParser = dom.window.DOMParser;
  }

  // Dynamic import after DOM setup
  const mermaid = (await import('mermaid')).default;

  mermaid.initialize({
    startOnLoad: false,
    suppressErrorRendering: true,
  });

  mermaidInstance = mermaid;
  return mermaid;
}

/**
 * Token hints mapping for mermaid parser errors
 * Maps token names to user-friendly messages and hints
 */
const TOKEN_HINTS: Record<string, { message: string; hint: string }> = {
  // Flowchart node shape errors (unclosed brackets)
  SQS: {
    message: 'Unclosed square bracket',
    hint: 'Add closing ] to complete the node shape: A[text]',
  },
  PS: {
    message: 'Unclosed parenthesis',
    hint: 'Add closing ) to complete the node shape: A(text) or A((text))',
  },
  DIAMOND_START: {
    message: 'Unclosed curly brace or diamond',
    hint: 'Add closing } to complete the shape: A{text} or A{{text}}',
  },
  SUBROUTINESTART: {
    message: 'Unclosed subroutine shape',
    hint: 'Add closing ]] to complete the subroutine: A[[text]]',
  },
  STADIUMSTART: {
    message: 'Unclosed stadium shape',
    hint: 'Add closing ]) to complete the stadium: A([text])',
  },
  CYLINDERSTART: {
    message: 'Unclosed cylinder shape',
    hint: 'Add closing ]) to complete the cylinder: A[(text)]',
  },
  DOUBLECIRCLESTART: {
    message: 'Unclosed double circle shape',
    hint: 'Add closing ))) to complete the double circle: A(((text)))',
  },
  TRAPSTART: {
    message: 'Unclosed trapezoid shape',
    hint: 'Add closing /] to complete the trapezoid: A[/text/]',
  },
  INVTRAPSTART: {
    message: 'Unclosed inverse trapezoid shape',
    hint: 'Add closing \\] to complete the inverse trapezoid: A[\\text\\]',
  },
  TAGEND: {
    message: 'Unclosed asymmetric shape',
    hint: 'Add closing ] to complete the asymmetric shape: A>text]',
  },

  // Block structure errors (unclosed blocks)
  '1': {
    message: 'Unclosed block',
    hint: 'Add "end" to close subgraph, loop, alt, opt, par, critical, rect, or state block',
  },
  EOF_IN_STRUCT: {
    message: 'Unclosed namespace or struct block',
    hint: 'Add closing } to complete the namespace or class definition',
  },
  STRUCT_START: {
    message: 'Invalid struct declaration',
    hint: 'Check class syntax: class ClassName { ... }',
  },

  // Syntax errors
  NODE_STRING: {
    message: 'Unexpected text',
    hint: 'Check for missing arrows (-->, ---) or invalid syntax',
  },
  NEWLINE: {
    message: 'Incomplete statement',
    hint: 'Add missing parts (e.g., colon for messages: Alice->>Bob: message)',
  },
  EOF: {
    message: 'Unexpected end of diagram',
    hint: 'Statement is incomplete - add missing node, message, or closing element',
  },
  LINK: {
    message: 'Missing link source',
    hint: 'Add source node before arrow: A --> B',
  },

  // Sequence diagram specific
  ACTOR: {
    message: 'Invalid participant reference',
    hint: 'Check participant name in note/over statement',
  },
  TXT: {
    message: 'Missing message text',
    hint: 'Add message after colon: Alice->>Bob: Hello',
  },

  // ER diagram specific
  IDENTIFYING: {
    message: 'Invalid ER relationship',
    hint: 'Use valid relationship: ||--o{, }o--||, etc.',
  },
  ONLY_ONE: {
    message: 'Invalid ER cardinality',
    hint: 'Check cardinality symbols: ||, |o, o|, }|, |{, etc.',
  },
  BLOCK_STOP: {
    message: 'Invalid ER attribute block',
    hint: 'Check attribute syntax: EntityName { type attrName }',
  },

  // State diagram specific
  INVALID: {
    message: 'Invalid state transition',
    hint: 'Use --> for transitions: StateA --> StateB',
  },

  // Gantt specific
  taskData: {
    message: 'Invalid task data',
    hint: 'Check task format: taskName :status, startDate, duration',
  },

  // Class diagram specific
  GENERICTYPE: {
    message: 'Invalid generic type',
    hint: 'Check generic syntax: class ClassName~Type~',
  },
  STYLE_SEPARATOR: {
    message: 'Invalid style syntax',
    hint: 'Check style definition syntax',
  },

  // Git graph specific
  COMMIT_ID: {
    message: 'Invalid commit reference',
    hint: 'Use valid commit command: commit id: "message"',
  },
  COMMIT_TAG: {
    message: 'Invalid commit tag',
    hint: 'Use valid tag: commit tag: "v1.0"',
  },
};

/**
 * Get hint for a token
 */
function getTokenHint(token: string): { message: string; hint: string } | null {
  return TOKEN_HINTS[token] || null;
}

/**
 * Extract context from error message
 */
function extractContext(errorLines: string[]): string | null {
  for (let i = 0; i < errorLines.length; i++) {
    if (errorLines[i].includes('^')) {
      // Get the previous line which shows the actual code
      if (i > 0) {
        return errorLines[i - 1].replace(/^\.{3}/, '').trim();
      }
      break;
    }
  }
  return null;
}

/**
 * Handle parse error pattern: "Parse error on line X:"
 */
function handleParseError(errorMessage: string, match: RegExpMatchArray): ParsedError {
  const line = Number.parseInt(match[1], 10);
  const lines = errorMessage.split('\n');

  const expectingMatch = errorMessage.match(/Expecting .+?, got '([^']+)'/);
  let hint: string | null = null;
  let message: string;

  if (expectingMatch) {
    const got = expectingMatch[1];
    const tokenInfo = getTokenHint(got);
    if (tokenInfo) {
      message = tokenInfo.message;
      hint = tokenInfo.hint;
    } else {
      message = `Syntax error: unexpected "${got}"`;
      hint = 'Check the syntax near this position';
    }
  } else {
    message = lines[0].replace(/^Parse error on line \d+:\s*/, '');
  }

  const context = extractContext(lines);
  return { line, message, hint, context };
}

/**
 * Handle "No diagram type detected" error
 */
function handleNoDiagramType(code: string): ParsedError {
  const firstLine = code.split('\n')[0]?.trim() || '';
  const displayLine = firstLine || '(empty)';
  return {
    line: 1,
    message: `Unknown diagram type: "${displayLine}"`,
    hint: 'Valid types: flowchart, sequenceDiagram, classDiagram, stateDiagram, erDiagram, gantt, pie, mindmap, timeline, gitGraph',
    context: firstLine.substring(0, 40) || null,
  };
}

/**
 * Handle unexpected character error
 */
function handleUnexpectedChar(match: RegExpMatchArray, code: string): ParsedError {
  const char = match[1];
  const offset = Number.parseInt(match[2], 10);
  let line = 1;
  let pos = 0;
  for (const codeLine of code.split('\n')) {
    if (pos + codeLine.length >= offset) {
      break;
    }
    pos += codeLine.length + 1;
    line++;
  }
  return {
    line,
    message: `Unexpected character "${char}"`,
    hint: 'Check for typos, missing quotes, or invalid characters',
    context: null,
  };
}

/**
 * Parse and categorize mermaid error message
 */
function parseErrorMessage(errorMessage: string, code: string): ParsedError {
  // Pattern 1: "Parse error on line X:"
  const parseErrorMatch = errorMessage.match(/Parse error on line (\d+):/i);
  if (parseErrorMatch) {
    return handleParseError(errorMessage, parseErrorMatch);
  }

  // Pattern 2: "Lexical error on line X"
  const lexicalMatch = errorMessage.match(/Lexical error on line (\d+)/i);
  if (lexicalMatch) {
    return {
      line: Number.parseInt(lexicalMatch[1], 10),
      message: 'Unrecognized text or keyword',
      hint: 'Check for typos, invalid keywords, or unsupported syntax',
      context: null,
    };
  }

  // Pattern 3: "No diagram type detected"
  if (errorMessage.includes('No diagram type detected')) {
    return handleNoDiagramType(code);
  }

  // Pattern 4: "Parsing failed: unexpected character"
  const unexpectedCharMatch = errorMessage.match(/unexpected character: ->(.)<- at offset: (\d+)/);
  if (unexpectedCharMatch) {
    return handleUnexpectedChar(unexpectedCharMatch, code);
  }

  // Pattern 5: "Parsing failed: Expecting token"
  const expectingTokenMatch = errorMessage.match(/Expecting(?: token of type)? '?([^']+)'? but/i);
  if (expectingTokenMatch) {
    return {
      line: 1,
      message: `Expected ${expectingTokenMatch[1]}`,
      hint: 'Check the diagram syntax and structure',
      context: null,
    };
  }

  // Pattern 6: "Parsing failed: Expecting: one of these possible"
  if (errorMessage.includes('Expecting: one of these possible')) {
    return {
      line: 1,
      message: 'Invalid syntax',
      hint: 'Check command syntax (e.g., branch name, checkout target)',
      context: null,
    };
  }

  // Default: unknown error format
  return {
    line: null,
    message: errorMessage.split('\n')[0].substring(0, 150),
    hint: 'Check the diagram syntax for errors',
    context: null,
  };
}

/**
 * Format error detail with hint
 */
function formatErrorDetail(parsed: ParsedError): string {
  let detail = parsed.message;
  if (parsed.hint) {
    detail += `. ${parsed.hint}`;
  }
  return detail;
}

/**
 * Convert ParsedError to ValidationError with line offset
 */
function toValidationError(parsed: ParsedError, startLine: number, code: string): ValidationError {
  return {
    lineNumber: parsed.line ? startLine + parsed.line - 1 : startLine,
    detail: formatErrorDetail(parsed),
    context: parsed.context || code.split('\n')[0]?.substring(0, 40),
  };
}

/**
 * Check if code is not empty
 */
function checkNotEmpty(block: CodeBlock): Result<CodeBlock, ValidationError> {
  const trimmed = block.code.trim();
  if (!trimmed) {
    return err({
      lineNumber: block.startLine,
      detail:
        'Empty Mermaid diagram. Add a diagram type (e.g., flowchart, sequenceDiagram) and content',
    });
  }
  return ok({ code: trimmed, startLine: block.startLine });
}

/**
 * Parse mermaid code using mermaid parser
 * Returns ResultAsync for async error handling
 */
function parseMermaidSyntax(block: CodeBlock): ResultAsync<CodeBlock, ValidationError> {
  return ResultAsync.fromPromise(
    getMermaid().then(async (mermaid) => {
      await mermaid.parse(block.code);
      return block;
    }),
    (error): ValidationError => {
      const errorMessage = error instanceof Error ? error.message : 'Unknown parse error';
      const parsed = parseErrorMessage(errorMessage, block.code);
      return toValidationError(parsed, block.startLine, block.code);
    }
  );
}

/**
 * Validate a single mermaid code block using Result pipeline
 */
function validateMermaidBlock(block: CodeBlock): ResultAsync<CodeBlock, ValidationError> {
  const emptyCheck = checkNotEmpty(block);

  if (emptyCheck.isErr()) {
    return errAsync(emptyCheck.error);
  }

  return parseMermaidSyntax(emptyCheck.value);
}

/**
 * Basic validation without mermaid parser
 */
function validateBasicBlock(block: CodeBlock): Result<CodeBlock, ValidationError> {
  // Check empty first
  const emptyCheck = checkNotEmpty(block);
  if (emptyCheck.isErr()) {
    return emptyCheck;
  }

  const trimmedBlock = emptyCheck.value;
  const lines = trimmedBlock.code.split('\n');

  // Check for diagram type on first non-comment line
  let foundType = false;
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('%%')) {
      continue;
    }

    const match = trimmedLine.match(/^([a-zA-Z][a-zA-Z0-9_-]*)/);
    if (match) {
      foundType = true;
    }
    break;
  }

  if (!foundType) {
    return err({
      lineNumber: block.startLine,
      detail:
        'Missing diagram type declaration. Start with a diagram type like: flowchart, sequenceDiagram, classDiagram',
      context: lines[0]?.trim().substring(0, 40),
    });
  }

  return ok(trimmedBlock);
}

/**
 * Patterns for detecting mermaid in HTML blocks
 */
const HTML_MERMAID_PATTERNS: RegExp[] = [
  // <pre class="mermaid">...</pre>
  /<pre[^>]*\bclass\s*=\s*["'][^"']*\bmermaid\b[^"']*["'][^>]*>([\s\S]*?)<\/pre>/gi,
  // <div class="mermaid">...</div>
  /<div[^>]*\bclass\s*=\s*["'][^"']*\bmermaid\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi,
  // <code class="language-mermaid">...</code>
  /<code[^>]*\bclass\s*=\s*["'][^"']*\blanguage-mermaid\b[^"']*["'][^>]*>([\s\S]*?)<\/code>/gi,
];

/**
 * Decode common HTML entities in mermaid code
 */
function decodeHtmlEntities(code: string): string {
  return code
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/**
 * Extract mermaid code from HTML content
 */
function extractMermaidFromHtml(html: string, startLine: number): CodeBlock[] {
  const blocks: CodeBlock[] = [];

  for (const pattern of HTML_MERMAID_PATTERNS) {
    // Reset regex lastIndex for each pattern
    pattern.lastIndex = 0;

    for (const match of html.matchAll(pattern)) {
      const code = match[1];
      const decodedCode = decodeHtmlEntities(code);

      // Calculate line number offset within the HTML block
      const beforeMatch = html.substring(0, match.index);
      const lineOffset = (beforeMatch.match(/\n/g) || []).length;

      blocks.push({
        code: decodedCode.trim(),
        startLine: startLine + lineOffset,
      });
    }
  }

  return blocks;
}

/**
 * Extract mermaid code blocks from tokens (both fence and HTML blocks)
 */
function extractMermaidBlocks(tokens: Token[]): CodeBlock[] {
  const blocks: CodeBlock[] = [];

  for (const token of tokens) {
    // Handle markdown fence blocks
    if (token.type === 'fence') {
      const lang = token.info.trim().toLowerCase();
      if (lang === 'mermaid') {
        blocks.push({
          code: token.content,
          startLine: token.lineNumber,
        });
      }
      continue;
    }

    // Handle HTML blocks
    if (token.type === 'html_block') {
      const htmlBlocks = extractMermaidFromHtml(token.content, token.lineNumber);
      blocks.push(...htmlBlocks);
    }
  }

  return blocks;
}

/**
 * The markdownlint custom rule
 */
const mermaidSyntaxRule: MarkdownlintRule = {
  names: ['mermaid-syntax'],
  description: 'Mermaid diagram syntax should be valid',
  tags: ['mermaid-diagram', 'code'],
  parser: 'markdownit',
  asynchronous: true,
  function: async function rule(params: RuleParams, onError: OnErrorCallback): Promise<void> {
    const config = params.config ?? {};
    const useBasic = config.basic ?? false;
    const tokens = params.parsers.markdownit.tokens;

    const blocks = extractMermaidBlocks(tokens);

    if (useBasic) {
      // Basic validation: synchronous, report errors immediately
      for (const block of blocks) {
        validateBasicBlock(block).mapErr(onError);
      }
    } else {
      // Full validation: async, validate all blocks in parallel
      const results = await ResultAsync.combineWithAllErrors(
        blocks.map((block) => validateMermaidBlock(block))
      );

      // Report all errors
      results.mapErr((errors) => {
        for (const error of errors) {
          onError(error);
        }
      });
    }
  },
};

export default mermaidSyntaxRule;
export { mermaidSyntaxRule };
