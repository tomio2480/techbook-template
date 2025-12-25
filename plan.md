# 技術書自動組版システム 設計方針と作業予定

## 概要

Markdown を入力として、書籍ごとのカスタマイズ設定と共に PDF を自動生成するシステムを構築する。執筆は Git で管理し、GitHub Issue で進捗を可視化する。

---

## 要件

### コンテンツ要件

| 要素 | 詳細 |
|------|------|
| プログラムコード | シンタックスハイライト対応 |
| 回路図 | SVG/PNG 埋め込み（KiCad/Fritzing 連携） |
| 部品表 | テーブル形式 |
| 写真・地図 | 画像埋め込み |
| ページ数 | 20〜100 ページ程度（変動あり） |

### ワークフロー要件

- Markdown で執筆
- Git によるバージョン管理
- GitHub Issue / Project で進捗管理
- Claude Code / gh コマンド / GitHub MCP での執筆支援
- CI/CD による自動 PDF ビルド

---

## 技術選定

### 組版エンジン比較結果

| エンジン | Markdown対応 | Git管理 | 自動ビルド | 技術書適性 | 採用 |
|----------|:------------:|:-------:|:----------:|:----------:|:----:|
| **Vivliostyle** | ◎ | ◎ | ◎ | ◎ | ✅ |
| Pandoc + LaTeX | ◎ | ◎ | ◎ | ◎ | 次点 |
| Re:VIEW | ○ | ◎ | ◎ | ◎ | 候補 |
| Scribus | ✗ | △ | ✗ | ○ | 不採用 |

### 採用技術: Vivliostyle

**選定理由**

1. Markdown からの変換が自然
2. CSS でスタイル調整（Web 技術ベース）
3. コードブロックの highlight.js 連携が容易
4. 20〜100 ページ規模に最適
5. 日本発 OSS で日本語組版に強い
6. GitHub Actions との連携が容易

---

## リポジトリ構造（設計）

```
techbook-template/
├── .github/
│   ├── workflows/
│   │   └── build-pdf.yml          # GitHub Actions: PDF自動ビルド
│   └── ISSUE_TEMPLATE/
│       ├── chapter.md             # 章執筆用 Issue テンプレート
│       └── review.md              # レビュー依頼用テンプレート
├── src/
│   ├── chapters/
│   │   ├── 00-preface.md          # まえがき
│   │   ├── 01-introduction.md     # 第1章
│   │   └── ...
│   └── assets/
│       ├── images/                # 写真・スクリーンショット
│       └── diagrams/              # 回路図・図表
├── config/
│   ├── vivliostyle.config.js      # Vivliostyle 設定
│   ├── book.yaml                  # 書籍メタ情報
│   └── themes/
│       └── techbook/              # カスタムテーマ
│           ├── theme.css          # メインスタイル
│           └── code-highlight.css # コードハイライト
├── scripts/
│   ├── build.sh                   # ビルドスクリプト
│   └── new-chapter.sh             # 新規章作成スクリプト
├── dist/                          # 生成物出力先（.gitignore）
├── package.json                   # npm 依存関係
├── .gitignore
└── README.md
```

---

## 設定ファイル仕様（設計）

### book.yaml（書籍メタ情報）

```yaml
title: "書籍タイトル"
subtitle: "サブタイトル"
author: "著者名"
version: "1.0.0"
lang: ja
date: "2025-01-01"

chapters:
  - src/chapters/00-preface.md
  - src/chapters/01-introduction.md

typesetting:
  page_size: A5
  font_size: 10pt
  line_height: 1.8

output:
  filename: "book-{version}.pdf"
  include_toc: true
```

### vivliostyle.config.js

```javascript
module.exports = {
  title: '書籍タイトル',
  author: '著者名',
  language: 'ja',
  size: 'A5',
  theme: './config/themes/techbook/theme.css',
  entry: [
    'src/chapters/00-preface.md',
    'src/chapters/01-introduction.md',
  ],
  output: 'dist/book.pdf',
};
```

---

## GitHub 運用設計

### ラベル体系

| ラベル | 用途 |
|--------|------|
| `chapter:00`, `chapter:01`, ... | 章単位の管理 |
| `status:draft` | 執筆中 |
| `status:review` | レビュー待ち |
| `status:done` | 完了 |
| `type:writing` | 本文執筆 |
| `type:figure` | 図表作成 |
| `type:edit` | 校正・編集 |

### マイルストーン例

- `v0.1 - 初稿完成`
- `v0.5 - レビュー完了`
- `v1.0 - 入稿`

### Issue テンプレート（章執筆用）

```markdown
## 概要
この章で扱う内容

## 完了条件
- [ ] 本文執筆
- [ ] 図表作成
- [ ] コード動作確認
- [ ] セルフレビュー

## 目安
- 文字数: 約5000字
- ページ数: 約10ページ
```

---

## 今後の作業予定

### Phase 1: テンプレートリポジトリ作成

- [ ] リポジトリ `techbook-template` を GitHub に作成
- [ ] 基本ディレクトリ構造の作成
- [ ] `package.json` と依存関係の設定
- [ ] `vivliostyle.config.js` の作成
- [ ] 基本テーマ CSS の作成（コードハイライト含む）

### Phase 2: サンプルコンテンツ作成

- [ ] サンプル章（Markdown）の作成
  - プログラムコード例
  - 回路図埋め込み例
  - 部品表（テーブル）例
  - 写真埋め込み例
- [ ] ビルドスクリプトの作成
- [ ] ローカルでの PDF 生成確認

### Phase 3: CI/CD 設定

- [ ] GitHub Actions ワークフロー作成
- [ ] PR 時の PDF プレビュー生成
- [ ] main ブランチへのマージ時にリリース PDF 生成

### Phase 4: Issue/Project テンプレート

- [ ] Issue テンプレート作成（章執筆用、レビュー用）
- [ ] ラベル自動設定
- [ ] GitHub Project テンプレート（カンバン形式）

### Phase 5: ドキュメント整備

- [ ] README.md（使い方ガイド）
- [ ] CONTRIBUTING.md（執筆ガイドライン）
- [ ] 新規書籍プロジェクト開始手順

---

## 実行コマンド例（想定）

```bash
# 新規書籍プロジェクト開始
gh repo create my-new-book --template tomio2480/techbook-template

# 新規章の Issue 作成
gh issue create --title "第3章: 応用編" --label "chapter:03,status:draft"

# Claude Code で執筆支援
claude "第3章の構成案を考えて、src/chapters/03-advanced.md の雛形を作成して"

# ローカルビルド
npm run build

# プレビュー（ブラウザで確認）
npm run preview

# PR 作成
gh pr create --title "feat: 第3章追加" --body "Closes #12"
```

---

## 備考

- Vivliostyle で対応しきれない高度な組版が必要な場合は、Pandoc + LaTeX への移行も検討
- 技術書典への出展を視野に入れる場合、Re:VIEW のテンプレート（TechBooster）も参考にする
- 回路図は KiCad または Fritzing で作成し、SVG エクスポートを推奨