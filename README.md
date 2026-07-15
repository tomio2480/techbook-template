# 技術書自動組版テンプレート

Vivliostyle を使用した技術書執筆のためのテンプレートリポジトリ。Markdown で執筆し、GitHub Actions で PDF を自動生成する。

## 📋 目次

- [機能](#機能)
- [必要環境](#必要環境)
- [セットアップ](#セットアップ)
- [使い方](#使い方)
- [Markdown 執筆ガイド](#markdown-執筆ガイド)
- [アクセシビリティ（タグ付き PDF）](#アクセシビリティタグ付き-pdf)
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
- 章の扉ページ（縁取りの大きな章番号＋CHAPTER ラベル）
- コラム・Tips・注釈・警告・章まとめのテンプレートブロック
- カラーパレットファイル（`palette.css`）による配色の一括差し替え
- コラム・Tips 内の図表・数式番号の連番対応
- 付録（Appendix）のアルファベット章番号対応
- 図表キャプションのページまたぎ防止
- 2 パスビルド中断時の検証（フェイルセーフ）
- 全角文字間の文中改行を自動で詰める処理（意図しない半角スペースの防止）
- ビルド後処理によるタグ付き PDF（Tagged PDF）の自動生成
- GitHub Actions による CI/CD
- Issue テンプレートによる進捗管理

## 📦 必要環境

- Node.js 18.0.0 以上
- npm
- Java 11 以上（タグ付き PDF 生成に使う `@opendataloader/pdf` の実行に必要）

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

生成された PDF は `dist/book.pdf` に出力される．内部的にはページ番号解決のための
2 パスビルドを行っており，`scripts/verify-build.mjs` によるビルド完了検証の後，
`scripts/tag-pdf.mjs` が `dist/book.pdf` にアクセシビリティタグを付与して
上書きする．検証またはタグ付けに失敗した場合はコマンドが非 0 で終了するため，
`dist/book.pdf` の内容を確認せず配布しないこと．タグ付き PDF 対応の詳細は
「[アクセシビリティ（タグ付き PDF）](#アクセシビリティタグ付き-pdf)」を参照．

`src/chapters/toc.html` の `<nav>` 内は手動編集してよい．追加した項目や
言い換えたリンク文言は，次回 `npm run build` 実行後も保持される．

### スクリプトのテスト

```bash
npm test
```

`scripts/add-line-numbers.mjs`・`scripts/verify-build.mjs`・`scripts/tag-pdf.mjs`
の単体テストを実行する．

### プレビュー

```bash
npm run preview
```

ブラウザでプレビューが表示される。

### 装飾スタイルカタログのビルド

```bash
npm run build:samples
```

章扉・見出し・枠ものなどの装飾スタイルを一覧できるカタログ PDF が
`dist/design-samples.pdf` に出力される。配色カスタマイズの確認に使える
（`npm run preview:samples` でプレビューも可能）。

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

コラムや Tips 内に図（`<figure>`）や数式（`<span class="math display">`）を配置した場合も、図番号・式番号は正しく連番で付与される。

### 注釈・警告

補足の注釈には `note` クラス、注意喚起には `warning` クラスを使用する。タイトル帯（※ Note・！ 注意）は自動で付与される。

```html
<div class="note">
<p>本文の理解を補う周辺情報を記述する。</p>
</div>

<div class="warning">
<p>読者が誤ると問題になる注意事項を記述する。</p>
</div>
```

### 章まとめ枠

章末で要点をチェックリスト形式で振り返るには `chapter-recap` クラスを使用する。箇条書きの各項目には自動でチェック印が付く。

```html
<div class="chapter-recap">
<p class="chapter-recap-title">この章のまとめ</p>
<ul>
<li>要点1</li>
<li>要点2</li>
</ul>
</div>
```

### HTML ブロック内での数式

コラム、Tips、章の扉ページなどの HTML ブロック内では、Markdown の `$...$` 記法は使用できない。Markdown テーブルは HTML ブロックではないため、テーブル内では `$...$` がそのまま使える。

HTML ブロック内で数式を表示するには、 `data-math-typeset="true"` 属性を付けて以下の形式で記述する。

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
- テーブル内では `$...$` による数式が使用できる（HTML ブロックとは異なる）

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

### 文中改行

読みやすさのため文中で改行してよい。全角文字（ひらがな・カタカナ・漢字・
全角記号）どうしに挟まれた改行は，レンダリング時に自動で詰められる。

```markdown
これはテストです．
改行の直後にも全角文字が続く場合の
挙動を確認します．
```

出力例：これはテストです．改行の直後にも全角文字が続く場合の挙動を確認します．

コードブロック・`script`/`style`・数式（`class="math ..."` を持つ範囲）
内の改行は対象外であり，そのまま保持される。

既知の制限として，`**強調**` や `[リンク]` 等のインライン要素の直前・
直後で改行した場合，テキストノードが分割されるため詰められないことが
ある。改行位置をインライン要素の外側に置くことで回避できる。

## ♿ アクセシビリティ（タグ付き PDF）

### 対応状況

Vivliostyle CLI が生成する PDF は，タグ付き PDF（Tagged PDF）になって
いない既知の不具合がある
（[vivliostyle-cli#539](https://github.com/vivliostyle/vivliostyle-cli/issues/539)）．
本テンプレートでは，`npm run build` の後処理として
[OpenDataLoader PDF](https://github.com/opendataloader-project/opendataloader-pdf)
（`@opendataloader/pdf`，Apache License 2.0）を実行し，`dist/book.pdf` に
`/StructTreeRoot`・`/MarkInfo`・`/Marked true` 等のタグ構造を自動付与する．

無料範囲は Tagged PDF の生成までであり，PDF/UA-1・PDF/UA-2 への正式
準拠エクスポートは OpenDataLoader PDF の Enterprise 限定機能である．
また，レイアウト解析による見出し・表・読み順の自動検出は完全ではない
可能性がある．書籍ごとに，実際の読み上げ順を後述の手順で検証すること．

### 前提環境

タグ付け処理には Java 11 以上が必要である．`java -version` で確認し，
未導入の場合は [Adoptium](https://adoptium.net/) 等から JDK を導入する．
GitHub Actions（`ubuntu-latest`）では `actions/setup-java@v4` で
Java 11 を導入している．

### veraPDF による手動検証手順

タグ付き PDF の構造が妥当かは，PDF/UA 検証ツールである
[veraPDF](https://verapdf.org/) で確認できる．CI への自動組み込みは
スコープ外とし，以下の手動手順を用いる．

1. [veraPDF のインストーラ](https://verapdf.org/software/)を入手し，
   ローカル環境にインストールする．
2. GUI 版を使う場合，`dist/book.pdf` を読み込み，検証プロファイルに
   `PDF/UA-1` を選択して検証を実行する．
3. CLI 版を使う場合，以下のコマンドで検証結果を確認する．

   ```bash
   verapdf --flavour ua1 dist/book.pdf
   ```

4. 検証レポートで `/StructTreeRoot`・`/MarkInfo`・`/Marked true` の
   有無と，見出し・段落の読み上げ順が原稿の意図と一致するかを確認する．
5. 自動検出精度に起因する誤りが見つかった場合，OpenDataLoader PDF
   Enterprise 版の視覚エディタか，他の PDF 編集ツールでの手動修正を
   検討する（本テンプレートの無料構成の対応範囲外）．

## 📂 ディレクトリ構造

```
techbook-template/
├── src/
│   ├── chapters/              # 原稿ファイル
│   │   ├── cover.md           # 表紙
│   │   ├── 00-preface.md      # まえがき
│   │   ├── toc.html           # 目次（自動生成＋手動編集の保持）
│   │   ├── 01-introduction.md # 第1章
│   │   ├── 02-advanced.md     # 第2章
│   │   ├── 03-math-and-figures.md # 第3章
│   │   ├── 97-appendix.md     # 付録
│   │   ├── 98-afterword.md    # あとがき
│   │   └── 99-colophon.md     # 奥付
│   ├── design-samples/        # 装飾スタイルカタログ原稿
│   └── assets/
│       ├── images/            # 写真・スクリーンショット
│       └── diagrams/          # 回路図・図表
├── config/
│   └── themes/
│       └── techbook/
│           ├── theme.css      # メインスタイル
│           ├── palette.css    # カラーパレット（2 層トークン）
│           ├── design-variants.css # カタログ用補助スタイル
│           └── code-highlight.css
├── scripts/
│   ├── add-line-numbers.mjs   # 行番号追加・目次マージスクリプト
│   ├── verify-build.mjs       # ビルド中断検知（フェイルセーフ）
│   ├── tag-pdf.mjs            # タグ付き PDF 生成（ビルド後処理）
│   └── *.test.mjs             # 各スクリプトの単体テスト
├── dist/                      # 出力先（.gitignore 済）
├── package.json
├── vivliostyle.config.js
├── vivliostyle.design-samples.config.js # カタログ用ビルド設定
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

`vivliostyle.config.js` の `entry` 配列を編集する。以下は章を追加する場合の記述例である。

```javascript
// 例: 第4章を追加する場合
entry: [
  'src/chapters/cover.md',
  'src/chapters/00-preface.md',
  'src/chapters/toc.html',
  'src/chapters/01-introduction.md',
  'src/chapters/02-advanced.md',
  'src/chapters/03-math-and-figures.md',
  'src/chapters/04-new-chapter.md',   // 追加した章
  'src/chapters/97-appendix.md',
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

### 配色（カラーパレット）の変更

装飾の配色は `config/themes/techbook/palette.css` の 2 層トークンで
管理している。本ごとの配色替えは第 1 層（パレット層）の値だけを
書き換える。第 2 層（意味トークン層）と theme.css の変更は不要である。

```css
:root {
  /* 基調色（章扉・見出し・コラムなどの主装飾） */
  --palette-primary: #2f5b8c;       /* 例: 濃い色（文字・罫線） */
  --palette-primary-mid: #b0c4de;   /* 例: 中明度（罫線・折り返し） */
  --palette-primary-light: #f0f4f8; /* 例: 淡色（背景・帯） */
  /* ... */
}
```

グレースケール印刷でも判別できるよう、差し替え時は
濃（accent）・中（mid）・淡（light）の明度役割を守る。
変更結果は `npm run build:samples` のカタログ PDF で一覧確認できる。

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
3. PR を作成すると `npm test`（スクリプトの単体テスト）が実行され，プレビュー PDF が生成される
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

### `検証失敗: ...` と表示されビルドが失敗する

`npm run build` の最終ステップ（`scripts/verify-build.mjs`）が，2 パス
ビルドの中断を検出した状態．表示されたメッセージが原因を示す．

```bash
# ルートに index.html が残っている／設定ファイルが未復元の場合
npm run clean
npm run build
```

`vivliostyle build` を単体で実行した後など，`npm run build` を経由せずに
ビルドした場合にも発生する．必ず `npm run build` を使うこと．

### `タグ付き PDF 生成に失敗しました: ...` と表示されビルドが失敗する

`npm run build` の最終ステップ（`scripts/tag-pdf.mjs`）が失敗した状態．
主な原因は次のとおり．

- Java 11 以上が導入されていない，または `PATH` から見えない．
  `java -version` で確認し，未導入なら [Adoptium](https://adoptium.net/)
  等から JDK を導入する．詳細は
  「[アクセシビリティ（タグ付き PDF）](#アクセシビリティタグ付き-pdf)」を参照．
- `dist/book.pdf` が存在しない．`vivliostyle build` や
  `scripts/verify-build.mjs` が先に失敗していないか確認する．

## 📄 ライセンス

（プロジェクトに応じて設定）
