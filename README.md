# 技術書自動組版テンプレート

Vivliostyle を使用した技術書執筆のためのテンプレートリポジトリ。Markdown で執筆し、GitHub Actions で PDF を自動生成する。

## 目次

- [機能](#機能)
- [必要環境](#必要環境)
- [セットアップ](#セットアップ)
- [使い方](#使い方)
- [ディレクトリ構造](#ディレクトリ構造)
- [カスタマイズ](#カスタマイズ)
- [GitHub 運用](#github-運用)

## 機能

- Markdown による執筆
- A5 サイズ PDF の自動生成
- シンタックスハイライト対応
- GitHub Actions による CI/CD
- Issue テンプレートによる進捗管理

## 必要環境

- Node.js 18.0.0 以上
- npm

## セットアップ

```bash
# リポジトリをクローン
git clone https://github.com/your-username/your-book.git
cd your-book

# 依存関係をインストール
npm install
```

## 使い方

### PDF のビルド

```bash
npm run build
```

生成された PDF は `dist/` ディレクトリに出力される。

### プレビュー

```bash
npm run preview
```

ブラウザでプレビューが表示される。

### 新しい章の追加

```bash
# 第2章「基本的な使い方」を作成
./scripts/new-chapter.sh 02 "基本的な使い方"
```

作成後、`vivliostyle.config.js` と `config/book.yaml` に章を追加する。

## ディレクトリ構造

```
techbook-template/
├── .github/
│   ├── workflows/
│   │   └── build-pdf.yml      # PDF 自動ビルド
│   └── ISSUE_TEMPLATE/
│       ├── chapter.md         # 章執筆用テンプレート
│       └── review.md          # レビュー依頼用テンプレート
├── src/
│   ├── chapters/              # 原稿ファイル
│   └── assets/
│       ├── images/            # 写真・スクリーンショット
│       └── diagrams/          # 回路図・図表
├── config/
│   ├── book.yaml              # 書籍メタ情報
│   └── themes/
│       └── techbook/
│           ├── theme.css      # メインスタイル
│           └── code-highlight.css
├── scripts/
│   ├── build.sh               # ビルドスクリプト
│   └── new-chapter.sh         # 新規章作成
├── dist/                      # 出力先（.gitignore 済）
├── package.json
├── vivliostyle.config.js
└── README.md
```

## カスタマイズ

### 書籍情報の変更

`vivliostyle.config.js` を編集する:

```javascript
module.exports = {
  title: '書籍タイトル',
  author: '著者名',
  // ...
};
```

### スタイルの変更

`config/themes/techbook/theme.css` を編集する。主な設定項目:

- ページサイズ: `@page { size: A5; }`
- フォントサイズ: `--font-size-base: 10pt;`
- 行間: `--line-height: 1.8;`

## GitHub 運用

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

## ライセンス

（プロジェクトに応じて設定）
