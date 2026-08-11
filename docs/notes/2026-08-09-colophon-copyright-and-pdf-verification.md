# 奥付への著作権表記の追加と PDF 目視検証手段の確立

Issue #63（PR #78）で奥付へ著作権表記を追加した際の設計判断・
発見した実装バグ・PDF 目視検証手段の確立を記録する．

## 目次

- [背景](#背景)
- [判断](#判断)
- [代替案と棄却理由](#代替案と棄却理由)
- [発見した実装バグ](#発見した実装バグ)
- [PDF 目視検証手段の確立](#pdf-目視検証手段の確立)
- [レビュー対応の推移](#レビュー対応の推移)
- [参照](#参照)

## 背景

- Issue #63 は「発行履歴を `errata/errata.yml` の版一覧から自動で
  流し込む」ことを提案していた．
- 着手前に `docs/spec/colophon.md` を読んだところ，発行履歴の
  自動生成は 2026-08-06 時点で既にスコープ外と判断済みだった．
  経緯は `docs/notes/2026-08-06-colophon-injection.md` を参照する．
- 単純な実装ではなく，既存の設計判断を再検討するか維持するかの
  見極めが要る場面だった．そのため Fable 5（Plan エージェント）へ
  設計を一度エスカレーションした．

## 判断

- **発行履歴の自動生成は不採用**．`errata/errata.yml` の
  `editions` は刷（printing）を管理していない．
  スキーマへ刷を足すと，公開正誤表サイトの収集側に影響が及ぶ．
  2026-08-06 の判断を再確認し維持した．Issue 本文の当該提案は
  不採用とし，経緯を spec の変更記録へ明記した．
- **新マーカー `{{copyright}}` を追加**．`config/book.yaml` の
  `copyright` 節（`year` 必須，`holder`・`notice` は任意）から
  流し込む．© 表記と禁止文言を奥付最下部へ出力する．`holder`
  省略時は `book.yaml` の `author`（表紙の名義）へフォールバック
  する．
- **タイポグラフィをページ全体で統一**．書籍タイトル以下（発行
  履歴・表・地の文・ISDN・著作権表記）を 9pt に統一した．
  著者紹介の「14 → 11 → 10 → 9pt」という 1pt 刻みの階調を
  ページ全体へ拡張した形になる．ISDN・著作権表記だけに個別指定
  されていたゴシック体・濃色も撤廃し，地の文と同じ明朝・
  muted-dark へ揃えた．

## 代替案と棄却理由

奥付情報テーブル（初頒布・著者・発行等）の折り返し制御で，
複数の実装を試して棄却した．経緯を残す．

1. `white-space: nowrap` を全セルへ一律適用．
   短い既定値は 1 行に収まったが，長い URL・メールアドレス等を
   手書きした場合にページ幅を超えて PDF 上で欠落する．
   Codex レビューで指摘を受け棄却した．
2. `white-space: normal`（既定）＋ `overflow-wrap: anywhere`．
   auto テーブルレイアウトの最小幅計算が極端に縮み，短い既定値も
   含め全セルが 1 文字ずつ折り返される壊滅的な結果になった．
   NBSP（改行禁止スペース）で結合した文字列すら `anywhere` は
   無視して分割した．棄却した．
3. `white-space: nowrap` ＋ `overflow-wrap: break-word`．
   短い既定値は保てたが，長い値は依然としてページ端で欠落した．
   `nowrap` が `overflow-wrap` による緊急折り返しより優先され，
   テーブル自体がページ幅を超えて広がる挙動を止められなかった．
   `table` に `width: 100%` を明示しても同じ結果だった．
4. `white-space: normal`（既定）＋ NBSP（初頒布の日付とイベント名の
   間のみ）．長い値は正しく折り返された．
   一方で auto テーブルレイアウトの列幅は，テーブル全体の内容に
   依存して不安定になった．NBSP で結合したはずの「初頒布」行も，
   別の行の折り返しにつられて再び分割された．
5. **採用**．`table-layout: fixed` と実測の幅（`width: 100mm`）で
   列幅を固定した．レイアウトは内容に依存せず決定論的である．
   短い既定値は 1 行へ収まり，長い値も欠落せず正しく折り返される．
   NBSP は不要になった．

## 発見した実装バグ

- `.colophon` コンテナは `min-height: 100vh` と `padding-bottom: 20mm`
  を持つ．`box-sizing` の既定（`content-box`）では，padding が
  `min-height` の外側へ加算される．結果としてコンテナの実高さが
  1 ページ分を超えていた．
- 超過分はページ境界で無音のまま切り取られ，末尾に置いた著作権禁止
  文言が PDF から欠落していた．DOM 上・非ページ環境での確認では
  正しく存在するため，通常の構造検証だけでは検出できなかった．
- `box-sizing: border-box` を `.colophon` へ追加し，padding を
  `min-height` の内側へ収めて解消した．
- 実際にビルドした PDF を目視するまで気づけなかった不具合であり，
  次節の検証手段の確立が発見の前提になっている．

## PDF 目視検証手段の確立

`docs/notes/2026-08-06-colophon-injection.md` の時点では，PDF の
最終確認をユーザーの目視に委ねるとしていた．理由は `pdftoppm` が無く，
ブラウザペインも PDF の file:// 表示に応答しなかったためである．
本セッションでこの制約を解消する手段を確立した．

- Chromium 実体は，ビルド用に導入済みの `chromium-*` 配下のものを
  流用できる．`node_modules/playwright-core` から次の要領で起動する．

  ```js
  import { chromium } from 'playwright-core';
  const browser = await chromium.launch({
    executablePath: 'C:\\...\\ms-playwright\\chromium-*\\chrome-win\\chrome.exe',
  });
  ```

- ブラウザペインでの PDF 表示はキャッシュが強く残り，同一パスへの
  再ナビゲートや `?query` 付与では更新されない事例があった．
  Playwright を直接使うことでこの問題を回避できる．
- PDF.js 内蔵ビューアは `PageDown` キー操作を受け付けないことが
  あった．`page.mouse.wheel(0, N)` によるスクロールは安定して
  機能する．
- 目的のページへ到達したら `page.screenshot()` で保存し，
  `Read` ツールで画像として読み込んで目視確認する．
- この手順により，レイアウト崩れ・欠落・折り返しの検証を
  Claude 側で完結できるようになった．今後の奥付・裏表紙等の
  見た目調整では，構造検証に加えてこの手段を使う．

## レビュー対応の推移

- セルフレビュー（`self-reviewer`）では低重要度 2 件のみで，
  ブロッカーは検出されなかった．
- push 後，Codex レビューで P2 が 2 件付いた．
  - `white-space: nowrap` の長い値欠落リスク（上記代替案 5 で解消）．
  - README.md に `{{copyright}}` の説明が無く，
    `config/book.yaml` のサンプルも旧仕様のままだった．
  いずれも実質的な指摘であり，全面的に反映した．
- ユーザーからの追加フィードバック（表と地の文のフォントサイズ不一致，
  行間，ISDN・著作権表記のフォント）は，実装後の見た目レビューで
  発見された．機械検証（textlint・単体テスト）だけでは検出できない
  種類の指摘であり，実際の PDF を見比べる工程が必要だった．

## 参照

- [Issue #63](https://github.com/tomio2480/techbook-template/issues/63)
- [PR #78](https://github.com/tomio2480/techbook-template/pull/78)
- 要求・要件（`docs/spec/` 配下）
  - `colophon.md`
  - `isdn.md`
  - `edition-errata.md`
- `docs/notes/2026-08-06-colophon-injection.md`（先行する設計判断，
  発行履歴の自動化の当初の棄却理由）
