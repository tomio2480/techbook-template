# lint summary の残 1 件と merge base の時差

PR #193 の lint summary が「リポジトリ全体: textlint 1 件」を報告し続けた．
現在の main を CI と同じ経路で検査し直すと 0 件である．
1 件の正体は PR #192 が解消済みの指摘であり，lint 実行が #192 のマージより
3 分早かったために残った．特定の経緯と確認手順を記録する．

## 目次

- [背景](#背景)
- [main の再検査は 0 件](#main-の再検査は-0-件)
- [1 件の正体と時系列](#1-件の正体と時系列)
- [再発時の確認手順](#再発時の確認手順)
- [参照](#参照)

## 背景

PR #188 の lint summary は，リポジトリ全体で textlint 1 件を報告した．
これを受けた PR #192 が `docs/spec/pdf-tagging.md` の 68 行目を直した．
それでも直後の PR #193 の summary は同じ 1 件を報告した．
修正が効いていないのか，別の 1 件なのかを切り分ける必要があった．

## main の再検査は 0 件

再現手順は既存の記録に従った．中央テンプレ `tomio2480/github-workflows` を
clone した．checkout は caller workflow が pin する SHA `568d8ec` へ合わせた．
runtime 設定は CI と同じ引数で生成し，依存も同じ lockfile から入れた．
`59a0059` 時点の main を `git archive` で書き出し，改行を LF へそろえた．

全 70 ファイルを検査した結果は 0 件である．
規則が読まれていない可能性を除くため，故意の違反を 3 件含む fixture を
同じ設定で走らせ，3 件の検出を確かめた．

## 1 件の正体と時系列

PR #193 の Actions ログで checkout を確認すると，
`Merge cf537c9 into d7c9173` とあった．base の `d7c9173` は #191 の
マージコミットであり，#192 が入る前の main である．

表 1. 2026-08-27 の時系列（JST）

| 時刻 | 出来事 |
|---|---|
| 23:35 | #191 が main へマージ |
| 23:38 | #193 の lint が `d7c9173` を base に実行 |
| 23:41 | #192 が main へマージ |
| 23:47 | #193 が main へマージ |

#192 適用前の `docs/spec/pdf-tagging.md` を単体で検査した．
再現したのは 68 行目の `ja-no-space-around-parentheses` 1 件だけである．
CI が数えた 1 件は #192 が直した指摘そのものである．
main には残っておらず，原稿側の追加修正は要らない．

## 再発時の確認手順

lint summary の全体件数は，その run が checkout した木に対する値である．
main の現在値ではない．件数が直らないように見えたら，次の順で確かめる．

- Actions ログの `Merge X into Y` を読み，base の Y がどのコミットかを見る．
- base が修正のマージより古ければ，件数は修正前の木の値である．
- それでも合わなければ，メモの手順で main をローカル再検査する．

lint は PR へのコミット push で発火し，マージ後の main では再実行されない．
最後の run の値がコメントへ残り続ける．
古い件数は，後続 PR の summary が新しい base で数え直すまで見え続ける．
summary へ base コミットを載せる案は中央テンプレ側の改善候補である．
起票の判断は別途とする．

## 参照

- [PR #192](https://github.com/tomio2480/techbook-template/pull/192)
- [PR #193](https://github.com/tomio2480/techbook-template/pull/193)
- [README の scripts ツリーを全数掲載へ引き直した記録](2026-08-25-scripts-tree-and-lint-repro.md)
- [PR に出ない lint 負債を片づけて分かったこと](2026-08-26-lint-debt-cleanup.md)
