# 絵文字付き見出しのアンカーと，隠れていたリンク切れ

文書内リンクの断片が GitHub のアンカーと食い違い，22 件が飛ばない状態であった．
見出しの先頭に置く絵文字が原因であること，
検査は動いていたのに CI の絞り込みで見えなかったことを記録する．

## 目次

- [背景](#背景)
- [判断](#判断)
- [測って初めて分かったこと](#測って初めて分かったこと)
- [参照](#参照)

## 背景

セッション末の点検で，手元の `markdownlint` が `MD051`（link-fragments）を
22 件出した．内訳は README が 13 件，古いノート 2 本が 9 件である．
README は目次の 11 件すべてが該当した．

CI は同じ検査を毎回走らせている．それでも指摘は上がらない．
reviewdog の `filter-mode: added` が，変更行に触れない指摘を落とすためである．
既存行に居座る誤りは，行を触るまで表に出ない．

## 判断

### 断片は描画結果から取る

GitHub が生成するアンカーを実物で確かめた．README は専用の口から取れる．

```bash
gh api repos/<owner>/<repo>/readme -H "Accept: application/vnd.github.html"
```

任意のファイルは描画の口へ流し込む．

```bash
gh api --method POST /markdown/raw -H "Content-Type: text/x-markdown" --input <file>
```

<!-- textlint-disable ja-technical-writing/ja-no-mixed-period -->

表 1. 見出しと GitHub が生成する断片

<!-- textlint-enable ja-technical-writing/ja-no-mixed-period -->

| 見出し | 断片 |
|---|---|
| `## 🔧 機能` | `#-機能` |
| `## 🏷️ GitHub 運用` | `#️-github-運用` |

絵文字は落ちるが，直後の空白がハイフンとして残る．
これが断片の先頭のハイフンの正体である．

### 規律を CLAUDE.md へ置く

直しただけでは戻る．`#-機能` は見た目が誤記に近く，親切心で消されうる．
`CLAUDE.md` へ 1 項目足し，README の目次の直前にも 1 行のコメントを残した．

## 測って初めて分かったこと

### 異体字セレクタは断片へ残る

`✏️` と `🏷️` は絵文字本体の後ろに異体字セレクタ（U+FE0F）を持つ．
GitHub は絵文字本体だけを落とし，セレクタを残す．
断片は `#️-github-運用` となる．先頭へ目に見えない 1 文字が入る．

目視では `#-github-運用` と区別が付かない．推測で書けば必ず外す．

### MD051 は日本語の見出しでも正しい

はじめは非 ASCII の誤検出を疑った．描画結果と突き合わせると，
指摘のあった 22 件はすべて絵文字付きの見出しを指しており，
絵文字を持たない見出しへのリンクは 1 件も指摘されていなかった．
検出は正確である．誤検出と決めつけて `MD051` を切らない．

## 参照

- [README の scripts ツリーを全数掲載へ引き直した記録](2026-08-25-scripts-tree-and-lint-repro.md)
- [上流由来の検査バグ 3 件と textlint 設定の運用](2026-08-13-upstream-lint-config-and-codex-review.md)
