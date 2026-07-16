# Figure タグ /Alt 調査と現状追認の判断

OpenDataLoader が付与する `Figure` タグの `/Alt` に，原稿の alt 属性が
反映されない問題（Issue #26）を調査した記録である．結論として，
現行構成では機械的な反映が成立しないと判断し，制約の明文化に留めた．

## 目次

- [背景](#背景)
- [調査結果](#調査結果)
- [判断](#判断)
- [代替案と棄却理由](#代替案と棄却理由)
- [再検討の条件](#再検討の条件)
- [参照](#参照)

## 背景

`npm run build` は後処理（`scripts/tag-pdf.mjs`）で OpenDataLoader PDF
を実行し，`dist/book.pdf` をタグ付き PDF へ変換する．派生書籍リポジトリ
での検証により，`Figure` タグの `/Alt` が原稿の alt 文にならないと
判明した．原稿の alt を `/Alt` へ注入できるかを調査した．

## 調査結果

検証は `@opendataloader/pdf` 2.4.7（導入版）と 2.5.0（最新）で行った．
入力は本テンプレートのサンプル原稿から生成した `dist/book.pdf` である．

表 1. 調査で確認した事実．

| 観点 | 確認結果 |
|---|---|
| alt の伝搬経路 | Vivliostyle が出す中間 PDF はタグなしで，HTML alt を運ぶ経路がない |
| JSON 出力 | figure / picture 系ノードは 0 件（両バージョン共通）．突合の土台がない |
| 画像の埋め込み形式 | SVG はベクター描画になり，PDF に画像 XObject が存在しない |
| tagged-pdf の /Figure | 4 件に対し実画像は 2 件．数が一致しない |
| /Alt の中身 | 図内に描かれた文字列を拾った偶然の一致．alt 属性の転記ではない |
| CLI オプション | alt 注入・enrich 系は 2.5.0 にも存在しない |

派生書籍（LED 本）では原稿画像 29 件に対し `/Figure` 12 件と，逆方向の
不一致も観測されている．1 対 1 対応はどちらの実例でも成立しない．

## 判断

現状追認とし，制約の明文化（README・spec）に留める．誤対応の危険を
避けるためである．読み順ベースで `/Alt` を後書きすると，数の不一致に
より別の図へ誤った説明が付きうる．誤った代替テキストは PDF/UA が禁じる
false alternative であり，欠落より有害と評価した．

## 代替案と棄却理由

表 2. 検討した代替案と棄却理由．

| 案 | 棄却理由 |
|---|---|
| 読み順で /Alt を後書きするパッチ | Figure と実画像の数が一致せず，誤対応の危険が高い |
| AI 生成 alt（enrich，hybrid 構成） | npm 版 CLI に機能がなく，Python 3.10+ の追加インフラを要する．手書き alt より精度も落ちる |
| Prince XML 等への切替 | 商用ライセンスの負担がテンプレート利用者全員へ及ぶ |

## 再検討の条件

次のいずれかが実現したら再検討する．

- Vivliostyle CLI がタグ付き PDF を直接出力する
  （[vivliostyle-cli#539](https://github.com/vivliostyle/vivliostyle-cli/issues/539)）．
  この場合，alt はビルド時にそのまま引き継がれる．
- OpenDataLoader が外部からの alt 注入手段を提供する．
  「image N」フォールバックの見直しは上流も TODO として認識している
  （上流 [PR #537](https://github.com/opendataloader-project/opendataloader-pdf/pull/537) の記述）．
- 原稿画像をラスター形式へ寄せる運用が許容され，picture ノードの
  検出を前提とした突合が試せるようになる．

## 参照

- [Issue #26](https://github.com/tomio2480/techbook-template/issues/26)
- [docs/spec/pdf-tagging.md](../spec/pdf-tagging.md)
- [vivliostyle-cli#539](https://github.com/vivliostyle/vivliostyle-cli/issues/539)
- [opendataloader-pdf#537](https://github.com/opendataloader-project/opendataloader-pdf/pull/537)
