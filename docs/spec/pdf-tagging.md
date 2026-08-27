# タグ付き PDF 生成（アクセシビリティ対応）要求・要件

## 概要

`npm run build` が生成する `dist/book.pdf` を，PDF/UA の下地となる
Tagged PDF 構造で出力する．タグは Vivliostyle CLI の直接出力を
そのまま成果物とし，タグ構造を書き換える後処理は置かない．
対象は本テンプレートおよびこれを用いて作られる派生書籍リポジトリ
すべてである．

## 目次

- 背景と要求（why）
- 用語集（ユビキタス言語）
- 要件（what）
- スコープ外
- 変更記録

## 背景と要求（why）

派生書籍リポジトリ
[techbook-introduction-to-electronics-basic-led](https://github.com/tomio2480/techbook-introduction-to-electronics-basic-led)
で不具合が判明した．`dist/book.pdf` がタグ付き PDF にならない．
報告は
[Issue #71](https://github.com/tomio2480/techbook-introduction-to-electronics-basic-led/issues/71)
である．当時は Vivliostyle CLI の既知不具合とみて，
OpenDataLoader PDF による後処理でタグを付与した（Issue #14）．
既知不具合の報告は
[vivliostyle-cli#539](https://github.com/vivliostyle/vivliostyle-cli/issues/539)
である．

2026-08-26 の再点検（Issue #183）で前提の変化を確認した．
vivliostyle-cli#539 は v8.16.1（2024-11-06）で修正済みである．
修正後の Vivliostyle CLI はタグ付き PDF を直接出力し，
原稿の画像 alt 属性も Figure タグの `/Alt` へそのまま引き継ぐ．
後処理はこの DOM 由来のタグ構造を，レイアウト解析による推測タグへ
上書きし，alt を「image N」へ落としていた．このため後処理を廃止し，
直接出力を成果物とする方針へ改めた．

価値提案は次のとおりである．本テンプレートで作られた技術同人誌が，
追加の手作業なしにタグ付き PDF として頒布可能な状態になる．
執筆者が原稿に書いた代替テキストは，そのまま読み上げへ使われる．

## 用語集（ユビキタス言語）

| 用語 | 意味 |
|---|---|
| タグ付き PDF（Tagged PDF） | `/StructTreeRoot`・`/MarkInfo`・`/Marked true` を持ち，見出し・段落等の論理構造をスクリーンリーダー等が解釈できる PDF． |
| PDF/UA | ISO 14289 で定義されるタグ付き PDF のアクセシビリティ正式規格．本要件はその下地となる Tagged PDF 生成までを扱い，PDF/UA-1/UA-2 への正式準拠は範囲外とする． |
| 直接出力 | Vivliostyle CLI（内部の Chromium）がビルド時に生成するタグ付き PDF．タグは原稿の DOM 構造に由来する． |
| veraPDF | PDF/A・PDF/UA の適合性検証を行うオープンソースツール．タグ付き PDF の構造が妥当かを検証する手段として本要件が参照する． |

## 要件（what）

### 機能要件

- `npm run build` が生成する `dist/book.pdf` はタグ付き PDF である．
  Vivliostyle CLI（v8.16.1 以降）の直接出力をそのまま成果物とし，
  タグ構造を書き換える後処理を置かない．
- 原稿の画像 alt 属性は，Figure タグの `/Alt` へそのまま反映される．
- `npm run build:print` が生成する `dist/book-print.pdf` も，
  直接出力のタグ構造を保つ．
- README に，タグ付き PDF 対応状況と veraPDF による手動検証手順を
  明記する．
- `npm run build`・`npm run build:print` は，出力 PDF の目印を
  検証段階で機械検査する．対象は `/StructTreeRoot`・`/MarkInfo`・
  `/Marked true` の 3 つである．
  欠けていればビルドは失敗する（Issue #185）．
  検査は目印の存在に限り，構造の意味的な妥当性を扱わない．
- `npm run build` は最終段で XMP メタデータを埋め込む（Issue #198）．
  出所は `config/book.yaml` の書誌情報である．埋め込み先は
  `dist/book.pdf` の Catalog `/Metadata` である．
  文書情報（DocInfo）の書名・著者名も同じ出所から書く．
  埋め込みはタグ構造に触れない．検証段階は `/Metadata` の存在を
  機械検査し，欠けていればビルドは失敗する．
- XMP へ PDF/UA-1 の適合宣言（pdfuaid:part）は書かない．上流由来の
  非準拠が残る現状で宣言すると，事実と異なる適合表明になるためである．
- PDF を生成する CI は，`dist/book.pdf` へ veraPDF の PDF/UA-1 検証を
  実行する（Issue #189）．対象は `build-pdf` ラベル付き PR・
  `workflow_dispatch`・タグ push の各実行である．
- 検証レポートは artifact として保存し，準拠フラグと失敗ルールの
  件数を job summary へ表示する．検証の合否はビルドの成否に
  影響させない．veraPDF 自体の実行エラーはビルドを失敗させる．

### 受け入れ条件

- `npm run build` 実行後，`dist/book.pdf` の PDF 構造に
  `/StructTreeRoot`・`/MarkInfo`・`/Marked true` が存在する．
- 原稿の代表的な画像 alt が，`dist/book.pdf` の Figure タグの
  `/Alt` と一致する．
- README に veraPDF 検証手順が記載されている．
- タグ構造の無い PDF を検査へ与えると，非 0 で終了し理由を示す．
- 検査ロジックの単体テスト（正常系・異常系）が `npm test` で通る．
- veraPDF の検証レポートは，PDF を生成する各実行で artifact として
  保存される．対象は `build-pdf` ラベル付き PR・`workflow_dispatch`・
  タグ push である．
- job summary に準拠フラグと失敗ルールの件数が表示される．
- veraPDF が非準拠を報告してもビルドは成功する．終了コード 2 以上の
  実行エラーではビルドが失敗する．
- レポート要約ロジックの単体テスト（正常系・異常系）が
  `npm test` で通る．
- `npm run build` 実行後，`dist/book.pdf` の Catalog に `/Metadata` が
  存在する．XMP の書名・著者は `config/book.yaml` と一致する．
- `/Metadata` の無い PDF を検証段階へ与えると，非 0 で終了し理由を示す．
- メタデータ埋め込み・検査ロジックの単体テスト（正常系・異常系）が
  `npm test` で通る．

### 関連する依存の扱い

`@opendataloader/pdf` はタグ付けには使わない．紙入稿・表紙の検査での
テキスト抽出に引き続き使う．その要件は
[紙入稿用 PDF](print-layout.md) と [表紙](cover.md) の spec が扱う．

## スコープ外

- PDF/UA-1・PDF/UA-2 への正式準拠エクスポート．
- タグ構造の意味的な妥当性（見出しレベル・読み順・表の関係）の
  自動検証．書籍ごとの実際の読み上げ順検証は執筆者側の作業として
  README に手順を示すのみとする．
- veraPDF の検証結果によるビルドのブロック．正式準拠の強制は
  上流の出力次第で恒久的な失敗を招くため，レポート提供にとどめる．

## 変更記録

- 2026-07-13: 初版作成．Issue #14 の内容に基づく（要求変更・要件変更）．
- 2026-07-16: Issue #26 の調査を受け，原稿 alt が `/Alt` へ反映されない
  制約をスコープ外として明記（要件変更なし）．
- 2026-08-26: Issue #183．要件変更．OpenDataLoader 後処理を廃止し，
  Vivliostyle CLI の直接出力を成果物とする．原稿 alt の `/Alt` 反映を
  スコープ外から受け入れ条件へ移す．
- 2026-08-27: Issue #185．要件追加．タグ付けの目印の機械検査を
  ビルド検証へ加える．欠落時はビルドを失敗させる．
- 2026-08-27: Issue #189．要件変更．veraPDF 検証の CI 自動化を
  スコープ外から要件へ移す（非ブロッキングのレポート提供）．
  合否によるビルドのブロックはスコープ外へ残す．
- 2026-08-28: Issue #198．要件追加．XMP メタデータの埋め込みと
  `/Metadata` の機械検査をビルドへ加える．
  PDF/UA-1 の適合宣言（pdfuaid:part）は書かない判断も明記する．
