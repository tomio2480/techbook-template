# textlint allowlist の導入と prh.yml 置き換え規約の確認

句読点統一の残件（#103・#104・#100）を片付けた際の判断と，
Issue #99 の調査で分かった中央テンプレの `prh.yml` 解決規約を記録する．
対象は Issue #99・#100・#103・#104，PR #107・#108・#109，上流 #90 である．

## 目次

- [背景](#背景)
- [allowlist で除外する判断](#allowlist-で除外する判断)
- [allowlist の注入経路と手元の裏取り](#allowlist-の注入経路と手元の裏取り)
- [奥付の注入文言は原稿と同じ字種にする](#奥付の注入文言は原稿と同じ字種にする)
- [caller の prh.yml は中央を置き換える](#caller-の-prhyml-は中央を置き換える)
- [中央雛形の相対参照は caller で切れる](#中央雛形の相対参照は-caller-で切れる)
- [運用面の観察](#運用面の観察)
- [参照](#参照)

## 背景

- 2026-08-16 の前半で README と原稿の句読点を「．」「，」へ統一した．
  経緯は同日の別ノート（句読点の統一と textlint overrides）に記した．
- 残ったのは，奥付へ注入する文言（#103），原稿側で直せない誤検出（#104），
  ルートに残った発足時の `plan.md`（#100）である．
- 読点の字種を機械で検出する #99 は，方針を決めるための調査だけ行った．

## allowlist で除外する判断

原稿側で直せない指摘が 2 種類あった．

- 奥付の発行履歴 `2026年08月06日 初版第一刷発行` は `docs/spec/colophon.md` の形式であり，
  `ja-space-between-half-and-full-width` と `ja-no-mixed-period` に掛かる．
- 表示数式 `$$ … $$` は複数行が 1 文と数えられ，`sentence-length` に掛かる．

`.textlintignore` でファイルごと外す案は採らなかった．
奥付と数式の章には他の検査を効かせたいためである．
中央テンプレ v2.6.11 は caller ルートの `.textlint-allowlist.yml` を読む．
これを使い，正規表現 2 本で該当箇所だけを除外した．

```yaml
allow:
  - "/^\\d{4}年\\d{2}月\\d{2}日 .+発行$/m"
  - "/\\$\\$[\\s\\S]*?\\$\\$/m"
allowRules: []
```

`textlint-filter-rule-allowlist@4.0.0` は `/正規表現/フラグ` の形を受け付け，
`g` は自動で付く．複数行に跨ぐときは `m` を付ける．

## allowlist の注入経路と手元の裏取り

composite action `markdown-lint` は caller ルートの `.textlint-allowlist.yml` を探す．
見つかれば絶対パスを `generate-textlint-runtime.py` の 4 番目の引数へ渡す．
生成された `.textlintrc.runtime.json` の `filters.allowlist` に規則が入る．
CI ログには `caller allowlist:` の行で検出の有無が出る．

CI は `filter-mode: added` のため，効き目は手元で数えて確かめた．
スクラッチパッドの再現環境（2026-08-13 のノート）へ同じ経路で注入し，
全章の指摘が 16 件から 6 件へ減ることを見た．差分は狙った 10 件と一致した．
残る 6 件は表キャプションの `ja-no-mixed-period` で，上流 #57 の判断待ちである．

追記（2026-08-17）: この判断待ちは Issue #116 で決着した．
`docs/` のキャプションは allowlist の 4 本目で外し，原稿側は Issue #118 へ移した．
経緯は [図表キャプションの句点と上流 #57 の決着](2026-08-17-caption-period-and-upstream-57.md) を参照．

否定側の確認では，fixture の文が 80 字未満で `sentence-length` が発火せず，
一度書き直した．誤検出を再現する fixture は，規則の閾値を実際に超えているか先に数える．

## 奥付の注入文言は原稿と同じ字種にする

`scripts/inject-colophon.mjs` の既定の禁止文言と正誤表案内は「。」「、」のままだった．
Markdown の原稿だけ直しても，PDF の奥付には旧字種が残る．
既定文言と `config/book.yaml` の設定例・`bio` を「．」「，」へ揃え，
案内文が「。」「、」を含まないことをテストで固定した（#103）．

確認は `dist/*.html` の grep では届かなかった．注入は rehype の段階で行われ，
生成 HTML を書き出さないためである．PDF からテキストを抽出して 3 文言を確認した．

```text
node node_modules/@opendataloader/pdf/dist/cli.js --format text --to-stdout --quiet dist/book.pdf
```

## caller の prh.yml は中央を置き換える

Issue #99 の案 1 は「ルートへ `prh.yml` を置いて読点規則を足す」だった．
中央 action の `resolve-config-path.sh` は，caller に同名ファイルがあればそれを返す．
無ければ中央のファイルを返す．併用ではなく置き換えになる．

- caller の `prh.yml` は中央の約 23 規則を写して抱えることになる．
  以後の中央更新へ追随しない（caller テンプレの構造差分と同じ構図）．
- prh の `imports` で中央ファイルを取り込む道も無い．
  中央ファイルは action のチェックアウト先にあり，caller から相対で指せない．

このため案 1 は採らない．中央へ読点規則を提案する案 2 は，
「、」を使う caller を縛るためそのままでは通らない．
本リポジトリ独自の検査スクリプトを `check:errata` と同じ位置に置く第 3 案を，
Issue へ提案してから着手する．

追記（2026-08-16）: 第 3 案は採らなかった．中央へ加算方式を提案して実装され，
`.prh-extra.yml` で解決した．経緯は同日の別ノート（prh 加算辞書による読点の検出）を参照．

## 中央雛形の相対参照は caller で切れる

`.textlintrc.json` の `_comment` は中央雛形の写しで，
`docs/rule-rationale.md` を相対パスで参照する．caller にその実体は無い．
textlint 15.6.0 は `_comment` を無視するため，実害と警告は無い．
参照を辿るのは人と AI だけで，caller では見つからない．

上流へ `tomio2480/github-workflows#90` を起票し，絶対 URL 化を提案した．
本リポジトリ側の書き換えは，次に `.textlintrc.json` を触る PR へ同梱する．

## 運用面の観察

- Draft のままの PR は `gh pr merge` が GraphQL エラーで失敗する．
  `gh pr ready` を先に実行する．
- PowerShell ではヒアドキュメントが使えない．
  コミットメッセージと PR 本文はスクラッチパッドのファイルへ書く．
  `git commit -F` と `gh pr create --body-file` で渡す．
- `plan.md` の移設（#100）は `git mv` で履歴を保った．
  参照元はリポジトリ内に無く，リンクの修正は要らなかった．
- 発足時の記録を `docs/notes/` へ置くときは，冒頭に「位置づけ」の節を足し，
  記載と現状の差を表で示す．本文は当時のまま残す．

## 参照

- Issue #99・#100・#103・#104，PR #107・#108・#109
- `tomio2480/github-workflows#90`（`_comment` の相対参照），v2.6.11
- `tomio2480/github-workflows#57`（キャプションの体言止め）
- `docs/notes/2026-08-16-punctuation-unification-and-textlint-overrides.md`（前半の経緯）
- `docs/notes/2026-08-13-upstream-lint-config-and-codex-review.md`（textlint の手元再現）
- `docs/notes/2025-12-25-initial-plan.md`（移設した発足時の記録）
