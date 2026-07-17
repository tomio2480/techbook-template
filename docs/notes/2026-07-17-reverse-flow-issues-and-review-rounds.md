# LED 本からの逆流 Issue 一括対応とレビューラウンド運用

## 背景

書籍リポジトリ（`techbook-introduction-to-electronics-basic-led`，以下
「LED 本」）への移植 PR に対する Gemini レビューで，テンプレート
（本リポジトリ）由来のコード・コメントへの指摘が複数出た．移植先では
上流との逐語一致を維持する方針のため修正せず，発生源である本リポジトリ
へ Issue #41〜#45 として持ち込まれた．本ノートは，この 5 件を一括対応
した際の運用と，各 PR で受けた 2 巡目レビューへの判断をまとめる．

## 判断

### Issue の優先順位付け

低リスク（LED 本で検証済みの CSS 追加）から着手し，コード変更を伴う
もの，設計判断を要するものを後回しにした．

1. `#43`（`li` の `break-inside: avoid`）・`#44`（`caution`/`tips` の
   リスト余白）: LED 本で実機検証済みの CSS 追加．
2. `#42`（コメント文の助詞重複解消）: 文言のみ，コード挙動に影響しない．
3. `#41`（透過色判定拡張）: `isTransparent()` を新設する TDD 対象．
4. `#45`（章扉直後の `h1` 帯非表示）: 「既定化かオプション化か」を
   ユーザーに確認したうえで着手．オプション化（`no-repeat-heading`
   クラス）を選んだ．

### 2 巡目レビュー（Gemini）への判断基準

Draft PR 作成後，各 PR に Gemini の追加指摘が入った．採否は
「却下時は仕様上の意図・トレードオフ・スコープ外のいずれかで説明する」
という `github-dev` Skill の原則に従って判断した．

| PR | 指摘 | 判断 | 根拠 |
|---|---|---|---|
| #46 | `break-inside: avoid` を `orphans`/`widows` へ変更 | 却下 | 行数制御であり，元 Issue の実例（インライン数式直後での分割）を確実には防げない．LED 本で検証済みの修正の移植であり，切り替えは別途再検証が必要なためスコープ外とした |
| #47 | `.caution`/`.tips` のリスト余白定義の DRY 統合 | 採用 | 同一値の重複定義であり，統合に副作用がない．ただし `:is()` はファイル内に既存例がないため見送り，既存のカンマ区切りセレクタリストで統合した |
| #49 | `rgba()`/`hsla()` のスラッシュ区切りアルファ値（CSS Color 4）未対応 | 採用 | 実際の検出漏れであり，TDD で失敗テストを先に追加してから正規表現を修正した |

「却下」は 1 件のみで，かつ元の実装が上流（LED 本）で検証済みという
根拠がある場合に限った．検証実績のない独自判断での却下は避けた．

### マージ順序と CI 待機

6 件の Draft PR は同じ `theme.css` を編集する箇所が複数あったが，
編集行が重ならなかったため，`gh pr merge --squash --delete-branch` を
1 件ずつ実行するだけで自動的に順次反映できた．マージ前に
`gh pr checks` でチェック完了を待つ（`pending` が無くなるまでポーリング）
ことで，CI 未完了のままマージする事故を防いだ．

## 代替案と棄却理由

- 6 件を 1 つの PR にまとめる案は採らなかった．Issue 単位で
  独立した変更であり，`github-dev` Skill の「PR を小さく保つ」原則に
  反するため．
- レビュー指摘をすべて無条件採用する案は採らなかった．LED 本側で
  実機検証済みの修正を安易に上書きすると，元の不具合が再発する
  リスクがあるため．

## 参照

- [Issue #41](https://github.com/tomio2480/techbook-template/issues/41)〜[#45](https://github.com/tomio2480/techbook-template/issues/45)
- [PR #46](https://github.com/tomio2480/techbook-template/pull/46)・[#47](https://github.com/tomio2480/techbook-template/pull/47)・[#48](https://github.com/tomio2480/techbook-template/pull/48)・[#49](https://github.com/tomio2480/techbook-template/pull/49)・[#50](https://github.com/tomio2480/techbook-template/pull/50)
- `github-dev` Skill「PR レビュー対応」節
