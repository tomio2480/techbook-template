# 技術書自動組版テンプレート

Vivliostyle を使用した技術書執筆のためのテンプレートリポジトリ。Markdown で執筆し、GitHub Actions で PDF を自動生成する。

## 📋 目次

- [機能](#機能)
- [必要環境](#必要環境)
- [セットアップ](#セットアップ)
- [使い方](#使い方)
- [Markdown 執筆ガイド](#markdown-執筆ガイド)
- [ディレクトリ構造](#ディレクトリ構造)
- [カスタマイズ](#カスタマイズ)
- [GitHub 運用](#github-運用)
- [トラブルシューティング](#トラブルシューティング)

## 🔧 機能

- Markdown による執筆
- JIS B5 サイズ PDF の自動生成
- シンタックスハイライト対応（行番号付き）
- 図・表・数式の自動番号付け
- 表紙・目次・あとがき・奥付の自動生成
- 章の扉ページ（ドッグイヤー風章番号付き）
- コラム・Tips テンプレートブロック
- 図表キャプションのページまたぎ防止
- GitHub Actions による CI/CD
- Issue テンプレートによる進捗管理

## 📦 必要環境

- Node.js 18.0.0 以上
- npm

## 🚀 セットアップ

```bash
# リポジトリをクローン
git clone https://github.com/your-username/your-book.git
cd /path/to/your/repo

# 依存関係をインストール
npm install
```

## 📖 使い方

### PDF のビルド

```bash
npm run build
```

生成された PDF は `dist/book.pdf` に出力される。

### プレビュー

```bash
npm run preview
```

ブラウザでプレビューが表示される。

### 新しい章の追加

1. `src/chapters/` に新しい Markdown ファイルを作成する
2. `vivliostyle.config.js` の `entry` 配列にファイルを追加する
3. frontmatter で章番号を設定する

## ✏️ Markdown 執筆ガイド

### 章ファイルの基本構造

各章の Markdown ファイルは以下の構造で記述する。扉ページの HTML ブロックを章の先頭に配置し、その後に通常の Markdown コンテンツを続ける。

```markdown
---
body:
  style: "counter-set: chapter 0;"
---

<section class="chapter-opening">
<p class="chapter-number">1</p>
<p class="chapter-title">章タイトル</p>
<div class="chapter-summary">
この章の概要を記述する。
</div>
<div class="chapter-topics">
<p class="chapter-topics-title">この章で学ぶこと</p>
<ul>
<li>トピック1</li>
<li>トピック2</li>
</ul>
</div>
</section>

# 章タイトル

本文...
```

 **frontmatter の設定**

| 章 | counter-set の値 |
|----|------------------|
| 第1章 | `counter-set: chapter 0;` |
| 第2章 | `counter-set: chapter 1;` |
| 第3章 | `counter-set: chapter 2;` |
| 第N章 | `counter-set: chapter N-1;` |

まえがきなど番号不要の章は以下のように設定する。

```markdown
---
class: preface
---

# まえがき
```

あとがきや奥付も同様に `class` で指定する。

| 種類 | class の値 |
|------|-----------|
| まえがき | `preface` |
| あとがき | `afterword` |
| 奥付 | `colophon` |
| 表紙 | `cover` |
| 付録 | `appendix` |

### 付録（Appendix）

付録として章番号をアルファベット（A, B, C...）にするには、frontmatter で `class: appendix` を指定する。

```yaml
---
class: appendix
body:
  style: "counter-set: chapter 0;"
---
```

`counter-set: chapter 0` の場合、h1 で A になる。`counter-set: chapter 1` の場合は B になる。図・表・数式の番号も自動的にアルファベット形式（例: 図A.-1）となる。扉ページの章番号は HTML に直接「A」等を記述する。

### 見出し

見出しには自動で番号が付与される。章番号も自動で付与されるため、Markdown では章タイトルのみを記述する。

```markdown
# 章タイトル            → 第1章 章タイトル
## 節タイトル           → 1.1. 節タイトル
### 項タイトル          → 1.1.1. 項タイトル
#### 款タイトル         → 1.1.1.1. 款タイトル
```

### コードブロック

コードブロックには自動で行番号とシンタックスハイライトが付与される。

````markdown
```python
def hello():
    print("Hello, World!")
```
````

 **対応言語**

javascript, typescript, python, rust, go, bash, json, yaml, markup（HTML）, css, markdown, c, cpp

### コラム

補足情報やコラムには `column` クラスを使用する。

```html
<div class="column">
<p class="column-title">コラムタイトル</p>
<p>コラムの本文を記述する。</p>
</div>
```

### Tips

実用的なヒントや注意事項には `tips` クラスを使用する。

```html
<div class="tips">
<p class="tips-title">Tips: ヒントのタイトル</p>
<p>ヒントの本文を記述する。</p>
</div>
```

### HTML ブロック内での数式

コラム、Tips、章の扉ページなどの HTML ブロック内では、Markdown の `$...$` 記法は使用できない。HTML ブロック内で数式を表示するには、以下の形式で記述する。

 **インライン数式**

```html
<span class="math inline" data-math-typeset="true">\(E = mc^2\)</span>
```

 **ブロック数式**

```html
<span class="math display" data-math-typeset="true">$$\int_{0}^{1} x^2 dx$$</span>
```

### 図の挿入

図は Markdown の画像記法で挿入する。キャプションと番号は自動で付与される。

```markdown
![LED点滅回路](../assets/diagrams/led-circuit.svg)
```

出力例：図3.2.-1: LED点滅回路

 **番号の形式**

図の番号は所属するセクションに応じて変化する。

| 配置場所 | 番号形式 |
|----------|----------|
| 章直下 | 図3.-1 |
| 節直下 | 図3.1.-1 |
| 項直下 | 図3.1.2.-1 |
| 款直下 | 図3.1.2.1.-1 |

 **推奨フォーマット**

- SVG: 回路図、ダイアグラム（拡大しても劣化しない）
- PNG: スクリーンショット、写真

### 表の挿入

表の直前にキャプション（タイトル）を1行で記述する。番号は自動で付与される。

```markdown
Arduino Uno を使った温度計の部品表

| 部品名 | 型番 | 数量 | 単価 |
|--------|------|------|------|
| Arduino Uno | A000066 | 1 | 3,000 |
| 温度センサ | LM35DZ | 1 | 200 |
```

出力例：表2.3.-1: Arduino Uno を使った温度計の部品表

 **注意点**

- 表の直前の段落がキャプションとして扱われる
- 表の前に説明文を入れたい場合は、キャプションの前に配置する

```markdown
以下に部品の一覧を示す。

部品表

| 部品名 | 型番 | ...
```

### 数式

数式は LaTeX 形式で記述する。

 **インライン数式**

```markdown
エネルギーと質量の関係は $E = mc^2$ で表される。
```

 **ブロック数式**

```markdown
$$
\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}
$$
```

ブロック数式には自動で番号が付与される。

出力例：(3.1.-1)

### 引用

```markdown
> 技術書は、読者が実際に手を動かして学べるように構成することが重要です。
```

### リスト

 **順序なしリスト**

```markdown
- 項目1
- 項目2
  - サブ項目2-1
  - サブ項目2-2
```

 **順序ありリスト**

```markdown
1. 最初の手順
2. 次の手順
3. 最後の手順
```

### 強調

```markdown
これは **太字** です。
これは *斜体* です。
これは `インラインコード` です。
```

## 📂 ディレクトリ構造

```
techbook-template/
├── src/
│   ├── chapters/              # 原稿ファイル
│   │   ├── cover.md           # 表紙
│   │   ├── 00-preface.md      # まえがき
│   │   ├── toc.html           # 目次（自動生成）
│   │   ├── 01-introduction.md # 第1章
│   │   ├── 02-advanced.md     # 第2章
│   │   ├── 03-math-and-figures.md # 第3章
│   │   ├── 98-afterword.md    # あとがき
│   │   └── 99-colophon.md     # 奥付
│   └── assets/
│       ├── images/            # 写真・スクリーンショット
│       └── diagrams/          # 回路図・図表
├── config/
│   └── themes/
│       └── techbook/
│           ├── theme.css      # メインスタイル
│           └── code-highlight.css
├── scripts/
│   └── add-line-numbers.mjs   # 行番号追加スクリプト
├── dist/                      # 出力先（.gitignore 済）
├── package.json
├── vivliostyle.config.js
└── README.md
```

## 🎨 カスタマイズ

### 書籍情報の変更

`vivliostyle.config.js` を編集する。

```javascript
export default {
  title: '書籍タイトル',
  author: '著者名',
  language: 'ja',
  size: 'JIS-B5',
  // ...
};
```

### 章の追加・変更

`vivliostyle.config.js` の `entry` 配列を編集する。

```javascript
entry: [
  'src/chapters/cover.md',
  'src/chapters/00-preface.md',
  'src/chapters/toc.html',
  'src/chapters/01-introduction.md',
  'src/chapters/02-advanced.md',
  // 新しい章を追加
  'src/chapters/03-new-chapter.md',
  'src/chapters/98-afterword.md',
  'src/chapters/99-colophon.md',
],
```

### スタイルの変更

`config/themes/techbook/theme.css` を編集する。主な設定項目は以下の通り。

| 項目 | 設定箇所 | デフォルト値 |
|------|----------|--------------|
| ページサイズ | `@page { size: }` | jis-b5 |
| 余白 | `@page { margin: }` | 上22mm 左右18mm 下28mm |
| 本文フォントサイズ | `--font-size-base` | 10pt |
| 行間 | `--line-height` | 1.8 |
| 本文フォント | `--font-mincho` | Noto Serif CJK JP |
| 見出しフォント | `--font-gothic` | Noto Sans CJK JP |

## 🏷️ GitHub 運用

### ラベル体系

| ラベル | 用途 |
|--------|------|
| `chapter:XX` | 章単位の管理 |
| `status:draft` | 執筆中 |
| `status:review` | レビュー待ち |
| `status:done` | 完了 |
| `type:writing` | 本文執筆 |
| `type:figure` | 図表作成 |

### ワークフロー

1. Issue を作成して執筆タスクを管理
2. ブランチを切って執筆
3. PR を作成するとプレビュー PDF が生成される
4. main へマージするとリリース PDF が生成される

## 🔍 トラブルシューティング

### ビルドエラーが発生する

```bash
# キャッシュをクリアして再ビルド
npm run clean
npm run build
```

### 行番号が表示されない

HTML ファイルが残っている可能性がある。以下を実行する。

```bash
del src\chapters\*.html   # Windows
rm src/chapters/*.html    # macOS/Linux
npm run build
```

### 章番号が正しく表示されない

各章の frontmatter で `counter-set` が正しく設定されているか確認する。

## 📄 ライセンス

（プロジェクトに応じて設定）
