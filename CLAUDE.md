# CLAUDE.md

本リポジトリ（およびこのテンプレートから作られた執筆リポジトリ）で
Claude が作業する際の必須事項を定める．

- 版管理（版番号・出版時フロー）と正誤表（`errata/errata.yml`）に関わる
  作業の前に，必ず `docs/spec/edition-errata.md` を読むこと．
- 奥付（`99-colophon.md`・`book.yaml` の `authors`／`errata`）に関わる
  作業の前に，必ず `docs/spec/colophon.md` を読むこと．
- ISDN（`config/isdn.yaml`・`back-cover.md`・奥付の `{{isdn}}`）に関わる
  作業の前に，必ず `docs/spec/isdn.md` を読むこと．
- 表紙・裏表紙（`cover.md`・`back-cover.md`・背景画像・テーマ CSS の
  `--cover-*`／`--back-cover-*`）に関わる作業の前に，必ず
  `docs/spec/cover.md` を読むこと．
- `config/isdn.yaml` へ申請フォームのパスワード等の認証情報を書かない．
  氏名・メールアドレスなどの個人情報も既定では書かない．
- 出版・版番号の変更・正誤の追記を行ったら，`npm run check:errata` で
  整合性を検査すること．
- `errata/errata.yml` の `book.slug` にはリポジトリ名やその一部を使わない．
  公開サイトへ出力されるため，リポジトリ名を推測できる値は禁止する．
- 原稿の修正と `fixed_in` の記入を同一 PR で行わない．
  `fixed_in` は出版時にまとめて記入する．
