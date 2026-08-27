# タグ検査のスコープ線引きと CI ランナー障害対応

Issue #185（タグ付き PDF の機械検査）と PR #187 のセッションで得た知見を記す．
主な内容は 2 つある．レビュー指摘の採否を分けた検査スコープの線引きと，
GitHub Actions のランナー障害で生じたゾンビ run の復旧手順である．

## 目次

- 検査スコープの線引き
- ランナー障害とゾンビ run の復旧
- イベント反映の遅延
- 参照

## 検査スコープの線引き

Codex の P2 指摘は 2 巡で 2 件あり，主題は同じ（目印の存在と意味的な連結）でも
層が違った．採否は層で分かれた．

1 巡目は採用した．`/StructTreeRoot` の照合が，構造ルートオブジェクト自身の
`/Type /StructTreeRoot` という値にも一致していた．鍵と値の混同という
構文の問題であり，Catalog 辞書スコープ化により既存部品のまま解決できた．

2 巡目は不採用とした．`/Marked true` を Catalog の `/MarkInfo` の値と
突き合わせる提案である．突き合わせには間接参照の解決が要り，`ObjStm` 内の
オブジェクトは見出しを持たないため，番号表（`/N`・`/First`）の解釈まで
実装が広がる．spec が「意味的な妥当性はスコープ外」と定める領域であり，
退行検知の安全網には過大と判断した．

判断軸は次のとおりである．観察が正しくても，解決策の層で採否が分かれる．
構文の正しさ（鍵と値の混同）は直す．意味の連結（値の指す先の解決）は
spec の契約と照らして線を引く．採らない判断は根拠を返信と実装コメントの
両方へ残す．実装コメントへ残すのは，将来の同型指摘への一次回答にするためである．

## ランナー障害とゾンビ run の復旧

PR #187 の作成直後，GitHub ホステッドランナーの割り当て障害に当たった．
症状と対処を記す．

- 症状: annotation に「The job was not acquired by Runner of type hosted
  even after multiple attempts」が出て失敗する．CodeQL は `startup_failure`
  になる．run がジョブ 0 件のまま queued 表示で数時間滞留する．
- ゾンビ run: cancel は「completed だから不可」，rerun は「running だから不可」と
  矛盾した応答を返し，どちらの API も通らない．
- 復旧: PR の close/reopen で `pull_request` イベントを再発火させるのが確実だった．
- CodeQL（default setup）は rerun API を受け付けない．push（synchronize）で
  再発火する．コミットを積む予定があるなら，それを待つだけでよい．

lint の fail を見たら，指摘件数を数える前に annotation を読む．
ランナー障害の fail は指摘 0 件のまま長時間（今回 15 分）で終わっている．

## イベント反映の遅延

障害からの回復期は `gh run list --branch` に新しい run が現れないことがある．
`head_sha` を指定した API 直引きでは同じ run が見えた．
run が無いと断定する前に，SHA 直引きで確かめる．

```bash
gh api "repos/OWNER/REPO/actions/runs?head_sha=SHA" --jq '.workflow_runs[].name'
```

## 参照

- Issue #185 ／ PR #187（タグ付き PDF の機械検査）
- [check-pdf-tags.mjs](../../scripts/check-pdf-tags.mjs) のヘッダコメント（不採用判断の記録）
- [タグ付き PDF 生成（アクセシビリティ対応）要求・要件](../spec/pdf-tagging.md)
