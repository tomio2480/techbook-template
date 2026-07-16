# ハードストップ透過グラデーション根絶の知見

Edge / PDFium で装飾が消える透過ハードストップを置き換えた
Issue #32 対応（PR #39）の記録である．回帰テストの検出仕様の判断と，
レビューで得た防御的 CSS の学びを記す．経緯の詳細は
LED 本側のノート（参照節）に委ね，本ノートはテンプレート側の
判断と差分に絞る．

## 目次

- [背景](#背景)
- [判断](#判断)
- [代替案と棄却理由](#代替案と棄却理由)
- [レビューの学び](#レビューの学び)
- [参照](#参照)

## 背景

- `linear-gradient` で同一位置の色→透明切り替え（ハードストップ透過）
  を使うと，Edge / PDFium のレンダリングが不安定になる．
- LED 本で 2 度再発しており，発生源はテンプレートの `theme.css` だった．
  6 箇所を LED 本で実機検証済みの実装へ置き換えた．

## 判断

- 角落とし 4 箇所は `clip-path`，マーカー 2 箇所は単色背景の
  絶対配置疑似要素とした（Issue #32 の参考実装どおり）．
- 回帰テスト `scripts/check-gradient-hardstops.mjs` を新設した．
  検出仕様は「隣接する同一位置の stop の一方が `transparent`」に
  限定した．位置の異なる透明へのフェードは正当な用途がありうるため，
  違反 6 箇所の共通因子だけを機械検出の対象とした．
- `h1` へ `clip-path` を足したため，`background: none` で装飾を
  打ち消す箇所には `clip-path: none` も要る．Issue 記載の表紙に加え，
  同構造の奥付（`.colophon h1`）にも補った．打ち消し系の上書きは
  プロパティ追加時に全箇所へ波及させる必要がある．

## 代替案と棄却理由

- グラデーション内の `transparent` 全面禁止は棄却した．
  フェード用途まで巻き込み，誤検出で将来のデザインを縛るためである．
- `isolation: isolate` は棄却した．`z-index: 0` の方が
  印刷系レンダラでの対応実績が広い（レビューの学び節を参照）．

## レビューの学び

`gemini-code-assist` の指摘 3 件をすべて採用した．

- CSS 仕様では長さゼロを単位なしの `0` で書ける．単位必須の
  正規表現では `transparent 0, red 0` 型を見逃す．
  検出系の正規表現は仕様の省略記法まで含めて設計する．
- 負の `z-index` を持つ疑似要素は，親にスタッキングコンテキストが
  ないと祖先の背景の下へ潜る．親へ `z-index: 0` を明示して
  文脈を固定する（防御的 CSS）．
- この `z-index: 0` は LED 本の検証済み実装への改良である．
  LED 本へ逆移植する際（Issue #123）は本改良込みで移植する．

## 参照

- [Issue #32](https://github.com/tomio2480/techbook-template/issues/32)（本件の要求と参考実装）
- [PR #39](https://github.com/tomio2480/techbook-template/pull/39)（本対応）
- [LED 本 PR #126](https://github.com/tomio2480/techbook-introduction-to-electronics-basic-led/pull/126)（発生経緯の知見記録）
- [LED 本ノート 2026-07-16](https://github.com/tomio2480/techbook-introduction-to-electronics-basic-led/blob/main/docs/notes/2026-07-16-template-sync-and-pdfium-gradient-issue.md)（詳細な経緯）
