# スタックド PR 運用の落とし穴と復旧手順

親ブランチを base にした子 PR（スタックド PR）の運用で得た知見である．
親マージ時に子 PR がクローズされる事故と，復旧・予防の手順を残す．
発生源は Issue #22 の 2 フェーズ構成（PR #23 → PR #24）である．

## 目次

- [背景](#背景)
- [発生した事故](#発生した事故)
- [復旧手順](#復旧手順)
- [予防策](#予防策)
- [squash マージ後の差分整理](#squash-マージ後の差分整理)
- [CI のトリガー条件](#ci-のトリガー条件)
- [参照](#参照)

## 背景

フェーズ 1（見本）とフェーズ 2（本採用）の間に選定ゲートがあるため，
PR を 2 本へ分けた．フェーズ 2 は選定後すぐ着手したかったので，
フェーズ 1 ブランチを base にした子 PR として先行作成した．

## 発生した事故

`gh pr merge 23 --squash --delete-branch` による親マージの直後，
base を失った子 PR #24 は main へ付け替わらずクローズされた．

- GitHub はマージボタン経由なら子 PR の base を付け替えることがある．
  しかし今回の操作では付け替えられず，クローズが確定した．
- クローズ済み PR では base 変更（`gh pr edit --base`）と再オープン
  （`gh pr reopen`）がどちらもできない．操作の順序を入れ替えても
  失敗する．
- `--delete-branch` はローカル側の同名ブランチも削除する．
  「ローカルから push し直す」復旧手段まで同時に失われる．

## 復旧手順

子 PR をレビューコメントごと救うには，旧 base の一時復元が要る．

1. 旧 base ブランチの最終コミット SHA を特定する．
2. `git push origin <sha>:refs/heads/<旧base名>` でリモートへ復元する．
3. `gh pr reopen <子PR>` で再オープンする．
4. `gh pr edit <子PR> --base main` で base を付け替える．
5. `git push origin --delete <旧base名>` で一時ブランチを片付ける．

## 予防策

- 親のマージでは `--delete-branch` を使わない．
  ブランチ削除は，子 PR の base を main へ付け替えた後に行う．
- 子 PR を作らない選択も有効である．選定ゲート待ちが短いなら，
  親マージ後に main から切り直せば事故は起きない．

## squash マージ後の差分整理

親を squash マージすると，子ブランチに残る親コミット群は
main 履歴と別物になる．その結果，親由来の変更が子 PR 差分へ
混ざって見える．

- `git rebase --onto origin/main <旧base先端sha>` で，
  子のコミットだけを main へ載せ替える．
- 内容は squash 済みと同一のため，衝突なく適用できる．
- その後は `git push --force-with-lease` で反映する．
  差分の位置が保たれるため，既存レビューコメントも参照可能なままである．

## CI のトリガー条件

本リポジトリの `build-pdf.yml` と CodeQL は
`pull_request: branches: [main]` 条件で動く．
base を main 以外とする子 PR では CI が走らない．

- 子 PR に対する CI は，base 付け替え後の push で初めて起動する．
- base 付け替えだけでは再トリガーされない点にも注意する．
  付け替え後に push（リベース反映で足りる）して CI を起動させる．

## 参照

- [Issue #22](https://github.com/tomio2480/techbook-template/issues/22)
- [PR #23（フェーズ 1）](https://github.com/tomio2480/techbook-template/pull/23)
- [PR #24（フェーズ 2）](https://github.com/tomio2480/techbook-template/pull/24)
- `docs/notes/2026-07-16-decoration-design.md`（装飾デザインの決定記録）
