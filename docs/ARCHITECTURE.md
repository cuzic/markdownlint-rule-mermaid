# アーキテクチャ設計ドキュメント

## 概要

`markdownlint-rule-mermaid` は、Markdown ファイル内の Mermaid ダイアグラム構文を検証する markdownlint カスタムルールです。

### 目的

- Markdown 内の Mermaid コードブロックの構文エラーを早期検出
- 開発者に分かりやすいエラーメッセージとヒントを提供
- CI/CD パイプラインでの自動検証を可能に

### 技術スタック

| レイヤー | 技術 |
|----------|------|
| 言語 | TypeScript |
| ビルド | tsup |
| テスト | Vitest |
| リンター | Biome |
| 依存関係 | mermaid, jsdom, neverthrow |

## システム構成図

```
┌─────────────────────────────────────────────────────────────────┐
│                        markdownlint                              │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Custom Rules                            │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │           markdownlint-rule-mermaid                  │  │  │
│  │  │                                                      │  │  │
│  │  │  ┌──────────────┐    ┌──────────────────────────┐   │  │  │
│  │  │  │ Token Parser │───▶│ Mermaid Block Extractor  │   │  │  │
│  │  │  └──────────────┘    └──────────────────────────┘   │  │  │
│  │  │          │                       │                   │  │  │
│  │  │          ▼                       ▼                   │  │  │
│  │  │  ┌──────────────┐    ┌──────────────────────────┐   │  │  │
│  │  │  │ Fence Blocks │    │     HTML Blocks          │   │  │  │
│  │  │  └──────────────┘    └──────────────────────────┘   │  │  │
│  │  │          │                       │                   │  │  │
│  │  │          └───────────┬───────────┘                   │  │  │
│  │  │                      ▼                               │  │  │
│  │  │           ┌──────────────────────┐                   │  │  │
│  │  │           │  Validation Pipeline │                   │  │  │
│  │  │           │  (neverthrow Result) │                   │  │  │
│  │  │           └──────────────────────┘                   │  │  │
│  │  │                      │                               │  │  │
│  │  │          ┌───────────┴───────────┐                   │  │  │
│  │  │          ▼                       ▼                   │  │  │
│  │  │  ┌──────────────┐    ┌──────────────────────────┐   │  │  │
│  │  │  │ Empty Check  │    │   Mermaid Parser         │   │  │  │
│  │  │  │   (sync)     │    │   (async + jsdom)        │   │  │  │
│  │  │  └──────────────┘    └──────────────────────────┘   │  │  │
│  │  │          │                       │                   │  │  │
│  │  │          └───────────┬───────────┘                   │  │  │
│  │  │                      ▼                               │  │  │
│  │  │           ┌──────────────────────┐                   │  │  │
│  │  │           │   Error Transformer  │                   │  │  │
│  │  │           │   (TOKEN_HINTS)      │                   │  │  │
│  │  │           └──────────────────────┘                   │  │  │
│  │  │                      │                               │  │  │
│  │  │                      ▼                               │  │  │
│  │  │           ┌──────────────────────┐                   │  │  │
│  │  │           │   onError Callback   │                   │  │  │
│  │  │           └──────────────────────┘                   │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## コンポーネント設計

### 1. エントリーポイント (`mermaidSyntaxRule`)

```typescript
const mermaidSyntaxRule: MarkdownlintRule = {
  names: ['mermaid-syntax'],
  description: 'Mermaid diagram syntax should be valid',
  tags: ['mermaid-diagram', 'code'],
  parser: 'markdownit',
  asynchronous: true,
  function: async function rule(params, onError) { ... }
};
```

**責務:**
- markdownlint との統合インターフェース
- 設定の読み込み（`basic` モード）
- 検証パイプラインの起動
- エラーの収集と報告

### 2. ブロック抽出 (`extractMermaidBlocks`)

```typescript
function extractMermaidBlocks(tokens: Token[]): CodeBlock[]
```

**責務:**
- markdown-it トークンから Mermaid コードブロックを抽出
- フェンスブロック（` ```mermaid `）の検出
- HTML ブロック（`<pre class="mermaid">`）の検出
- 行番号の計算

### 3. HTML パース (`extractMermaidFromHtml`)

```typescript
function extractMermaidFromHtml(html: string, startLine: number): CodeBlock[]
```

**責務:**
- HTML タグ内の Mermaid コードを抽出
- 正規表現パターンマッチング
- HTML エンティティのデコード
- 行オフセットの計算

### 4. 検証パイプライン

#### 4.1 空チェック (`checkNotEmpty`)

```typescript
function checkNotEmpty(block: CodeBlock): Result<CodeBlock, ValidationError>
```

**責務:**
- 空の Mermaid ブロックを検出
- 同期的な Result 型を返却

#### 4.2 構文検証 (`parseMermaidSyntax`)

```typescript
function parseMermaidSyntax(block: CodeBlock): ResultAsync<CodeBlock, ValidationError>
```

**責務:**
- mermaid パーサーによる構文検証
- 非同期 ResultAsync 型を返却
- エラーの変換

### 5. エラー変換 (`parseErrorMessage`)

```typescript
function parseErrorMessage(errorMessage: string, code: string): ParsedError
```

**責務:**
- mermaid エラーメッセージのパース
- 行番号の抽出
- トークンヒントの付与
- ユーザーフレンドリーなメッセージ生成

## データフロー

### 検証フロー

```
Markdown File
     │
     ▼
┌─────────────────┐
│  markdown-it    │
│  tokenization   │
└─────────────────┘
     │
     ▼ tokens[]
┌─────────────────┐
│ extractMermaid  │
│    Blocks()     │
└─────────────────┘
     │
     ▼ CodeBlock[]
┌─────────────────┐
│ validateMermaid │◀─── basic: true ──▶ validateBasicBlock()
│    Block()      │
└─────────────────┘
     │
     ├─── checkNotEmpty()
     │         │
     │         ▼ Result<CodeBlock, ValidationError>
     │
     └─── parseMermaidSyntax()
               │
               ▼ ResultAsync<CodeBlock, ValidationError>
┌─────────────────┐
│ combineWith     │
│ AllErrors()     │
└─────────────────┘
     │
     ▼ Result<CodeBlock[], ValidationError[]>
┌─────────────────┐
│   onError()     │
│   callback      │
└─────────────────┘
```

### エラー変換フロー

```
mermaid.parse() throws Error
          │
          ▼
┌─────────────────────┐
│ parseErrorMessage() │
└─────────────────────┘
          │
          ├─── Parse error on line X
          │         │
          │         ▼
          │    handleParseError()
          │         │
          │         ▼
          │    getTokenHint() ──▶ TOKEN_HINTS
          │
          ├─── Lexical error on line X
          │
          ├─── No diagram type detected
          │         │
          │         ▼
          │    handleNoDiagramType()
          │
          ├─── unexpected character
          │         │
          │         ▼
          │    handleUnexpectedChar()
          │
          └─── default
                    │
                    ▼
               Generic error message
```

## 型システム

### コア型定義

```typescript
// 検証対象のコードブロック
interface CodeBlock {
  code: string;      // Mermaid コード
  startLine: number; // 開始行番号
}

// 検証エラー（markdownlint に報告）
interface ValidationError {
  lineNumber: number;
  detail: string;
  context?: string;
}

// パース済みエラー（内部使用）
interface ParsedError {
  line: number | null;
  message: string;
  hint: string | null;
  context: string | null;
}
```

### Result 型（neverthrow）

```typescript
// 同期検証結果
type SyncValidation = Result<CodeBlock, ValidationError>;

// 非同期検証結果
type AsyncValidation = ResultAsync<CodeBlock, ValidationError>;

// 複数エラー収集
type CombinedResult = Result<CodeBlock[], ValidationError[]>;
```

## 設計原則

### 1. 関数型プログラミング

- **純粋関数**: 副作用を最小化
- **Result 型**: 例外ではなく値としてエラーを扱う
- **パイプライン**: 関数の合成による処理フロー

```typescript
// パイプライン例
checkNotEmpty(block)
  .asyncAndThen(parseMermaidSyntax)
  .mapErr(onError);
```

### 2. 単一責任の原則

各関数は単一の責務を持つ:

| 関数 | 責務 |
|------|------|
| `extractMermaidBlocks` | ブロック抽出のみ |
| `checkNotEmpty` | 空チェックのみ |
| `parseMermaidSyntax` | 構文検証のみ |
| `parseErrorMessage` | エラー変換のみ |

### 3. 遅延初期化

mermaid インスタンスは初回使用時に初期化:

```typescript
let mermaidInstance: MermaidAPI | null = null;

async function getMermaid(): Promise<MermaidAPI> {
  if (mermaidInstance) {
    return mermaidInstance;  // キャッシュ利用
  }
  // DOM セットアップ + 初期化
  ...
}
```

### 4. 並列処理

複数ブロックの検証は並列実行:

```typescript
const results = await ResultAsync.combineWithAllErrors(
  blocks.map(block => validateMermaidBlock(block))
);
```

## 依存関係

### 依存グラフ

```
markdownlint-rule-mermaid
├── mermaid (Mermaid パーサー)
│   └── (内部で DOM API を使用)
├── jsdom (Node.js 用 DOM 実装)
│   └── mermaid が必要とする DOM 環境を提供
└── neverthrow (Result 型)
    └── 型安全なエラーハンドリング
```

### DOM 環境のセットアップ

mermaid は DOM API を必要とするため、Node.js 環境では jsdom で DOM をエミュレート:

```typescript
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.DOMParser = dom.window.DOMParser;
```

## エラーハンドリング戦略

### TOKEN_HINTS マッピング

mermaid パーサーのトークンエラーをユーザーフレンドリーなメッセージに変換:

```typescript
const TOKEN_HINTS: Record<string, { message: string; hint: string }> = {
  SQS: {
    message: 'Unclosed square bracket',
    hint: 'Add closing ] to complete the node shape: A[text]',
  },
  // ... 20+ トークン対応
};
```

### エラーパターン

| パターン | 正規表現 | 処理関数 |
|----------|----------|----------|
| Parse error | `/Parse error on line (\d+):/i` | `handleParseError` |
| Lexical error | `/Lexical error on line (\d+)/i` | 直接処理 |
| No diagram type | `includes('No diagram type')` | `handleNoDiagramType` |
| Unexpected char | `/unexpected character: ->(.)<-/` | `handleUnexpectedChar` |

## パフォーマンス考慮事項

### 最適化ポイント

1. **mermaid インスタンスのキャッシュ**
   - 初回のみ初期化、以降は再利用

2. **並列検証**
   - 複数ブロックを `Promise.all` 相当で並列処理

3. **早期リターン**
   - 空チェックで失敗したら構文検証をスキップ

### 制限事項

- 初回検証は DOM 初期化のため遅い（約1-2秒）
- 大量の図表（100+）は `combineWithAllErrors` でメモリ使用増加の可能性

## テスト戦略

### テストカテゴリ

```
tests/
└── index.test.ts
    ├── valid mermaid diagrams (10 tests)
    │   └── 各図表タイプの正常系
    ├── invalid mermaid diagrams (6 tests)
    │   └── エラー検出・メッセージ確認
    ├── multiple code blocks (2 tests)
    │   └── 複数ブロックの処理
    ├── configuration (2 tests)
    │   └── basic モード
    └── HTML embedded mermaid (11 tests)
        └── HTML パターンの検証
```

### テスト実行

```bash
npm test          # watch モード
npm run test:run  # 単発実行
```

## 拡張ポイント

### 新しい HTML パターンの追加

`HTML_MERMAID_PATTERNS` 配列に正規表現を追加:

```typescript
const HTML_MERMAID_PATTERNS: RegExp[] = [
  // 既存パターン...
  /新しいパターン/gi,
];
```

### 新しいトークンヒントの追加

`TOKEN_HINTS` オブジェクトにエントリを追加:

```typescript
const TOKEN_HINTS = {
  // 既存ヒント...
  NEW_TOKEN: {
    message: 'エラーメッセージ',
    hint: '修正方法のヒント',
  },
};
```

### 設定オプションの追加

1. `MermaidRuleConfig` インターフェースを拡張
2. ルール関数内で設定を読み取り
3. README とテストを更新

## ファイル構成

```
markdownlint-rule-mermaid/
├── src/
│   └── index.ts          # メインソースコード
├── tests/
│   └── index.test.ts     # テストスイート
├── dist/                  # ビルド成果物
│   ├── index.js          # ESM
│   ├── index.cjs         # CommonJS
│   └── index.d.ts        # 型定義
├── docs/
│   └── ARCHITECTURE.md   # このドキュメント
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── biome.json
└── README.md
```

## バージョニング

セマンティックバージョニング（SemVer）に従う:

- **MAJOR**: 破壊的変更（API 変更、最小 Node.js バージョン変更）
- **MINOR**: 新機能追加（後方互換）
- **PATCH**: バグ修正、ドキュメント更新

## ライセンス

MIT License
