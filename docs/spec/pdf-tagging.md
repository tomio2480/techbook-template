# タグ付き PDF 生成（アクセシビリティ対応）要求・要件

## 概要

`npm run build` の後処理として，生成した `dist/book.pdf` にアクセシビリ
ティタグ（PDF/UA の下地となる Tagged PDF 構造）を自動付与する．対象は
本テンプレートおよびこれを用いて作られる派生書籍リポジトリすべてである．

## 目次

- 背景と要求（why）
- 用語集（ユビキタス言語）
- 要件（what）
- スコープ外
- 変更記録

## 背景と要求（why）

派生書籍リポジトリ
[techbook-introduction-to-electronics-basic-led](https://github.com/tomio2480/techbook-introduction-to-electronics-basic-led)
で，`dist/book.pdf` がタグ付き PDF になっていない不具合が判明した
（[Issue #71](https://github.com/tomio2480/techbook-introduction-to-electronics-basic-led/issues/71)）．
`/StructTreeRoot`・`/MarkInfo`・`/Marked true` のいずれも存在せず，
スクリーンリーダー等の支援技術で読み上げ順序・構造が保証されない．

原因は Vivliostyle CLI の既知不具合
（[vivliostyle-cli#539](https://github.com/vivliostyle/vivliostyle-cli/issues/539)）
の可能性が高く，本テンプレートを使う書籍すべてに共通する．
書籍リポジトリ側ではなくテンプレート側で対応することで，既存の派生
リポジトリを含め横断的に解消する．

価値提案は次のとおりである．本テンプレートで作られた技術同人誌が，
追加の手作業なしにタグ付き PDF として頒布可能な状態になる．これによ
り，執筆者はアクセシビリティ対応の専門知識を持たなくても，最低限の
構造タグ（見出し・読み順）を備えた PDF を出力できる．

## 用語集（ユビキタス言語）

| 用語 | 意味 |
|---|---|
| タグ付き PDF（Tagged PDF） | `/StructTreeRoot`・`/MarkInfo`・`/Marked true` を持ち，見出し・段落等の論理構造をスクリーンリーダー等が解釈できる PDF． |
| PDF/UA | ISO 14289 で定義されるタグ付き PDF のアクセシビリティ正式規格．本要件はその下地となる Tagged PDF 生成までを扱い，PDF/UA-1/UA-2 への正式準拠は範囲外とする（該当機能は OpenDataLoader PDF の Enterprise 限定）． |
| OpenDataLoader PDF | PDF Association・veraPDF 開発元（Dual Lab）と協業する Apache License 2.0 のオートタグ付けツール．本要件の実装手段として採用する（`@opendataloader/pdf`）． |
| タグ付け後処理 | `npm run build` が `dist/book.pdf` を生成した後に実行する，OpenDataLoader PDF によるタグ付与ステップ． |
| veraPDF | PDF/A・PDF/UA の適合性検証を行うオープンソースツール．タグ付き PDF の構造が妥当かを検証する手段として本要件が参照する． |

## 要件（what）

### 機能要件

- `@opendataloader/pdf` を `devDependencies` に追加する．
- `npm run build` の最終ステップとして，`dist/book.pdf` にタグ付け後
  処理を実行し，同ファイルをタグ付き PDF で上書きする．
- タグ付け後処理が失敗した場合（コマンドの異常終了，出力ファイル未
  生成等），`npm run build` 全体を非 0 で終了させ，タグなしの
  `dist/book.pdf` を検証済みとして誤って配布しない．
- OpenDataLoader PDF は Java 11 以上を要求するランタイム依存である．
  CI（GitHub Actions）のビルド・リリース双方のジョブで Java 実行環境
  を明示的にセットアップする．
- README に，タグ付き PDF 対応状況・Java 前提条件・veraPDF による
  手動検証手順を明記する．

### 受け入れ条件

- `npm run build` 実行後，`dist/book.pdf` の PDF 構造に
  `/StructTreeRoot`・`/MarkInfo`・`/Marked true` が存在する．
- `npm test` で，タグ付け後処理スクリプトの単体テスト（正常系・
  異常系）が通過する．
- CI（`build-pdf.yml`）が Java 環境込みで `npm run build` を成功させる．
- README に Java 前提条件と veraPDF 検証手順が記載されている．

## スコープ外

- PDF/UA-1・PDF/UA-2 への正式準拠エクスポート（OpenDataLoader PDF の
  Enterprise 限定機能であり，Apache 2.0 の無料範囲外）．
- レイアウト解析ベースの見出し・表・読み順の自動検出精度の改善．
  ツール依存の挙動であり，書籍ごとの実際の読み上げ順検証は執筆者側
  の作業として README に手順を示すのみとする．
- veraPDF 検証の CI 自動化．本要件は手動検証手順の明記までとする．
- 原稿側 alt 属性から `Figure` タグ `/Alt` への反映．現行構成に伝搬
  経路がなく，機械的な対応付けも成立しない（Issue #26 で調査済み）．
  再検討の条件は
  [調査ノート](../notes/2026-07-16-figure-alt-investigation.md)
  を参照する．

## 変更記録

- 2026-07-13: 初版作成．Issue #14 の内容に基づく（要求変更・要件変更）．
- 2026-07-16: Issue #26 の調査を受け，原稿 alt が `/Alt` へ反映されない
  制約をスコープ外として明記（要件変更なし）．
