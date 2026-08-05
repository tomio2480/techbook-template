# CLAUDE.md

本リポジトリ（およびこのテンプレートから作られた執筆リポジトリ）で
Claude が作業する際の必須事項を定める．

- 版管理（版番号・出版時フロー）と正誤表（`errata/errata.yml`）に関わる
  作業の前に，必ず `docs/spec/edition-errata.md` を読むこと．
- 奥付（`99-colophon.md`・`book.yaml` の `authors`／`errata`）に関わる
  作業の前に，必ず `docs/spec/colophon.md` を読むこと．
- 出版・版番号の変更・正誤の追記を行ったら，`npm run check:errata` で
  整合性を検査すること．
- `errata/errata.yml` の `book.slug` にはリポジトリ名やその一部を使わない．
  公開サイトへ出力されるため，リポジトリ名を推測できる値は禁止する．
- 原稿の修正と `fixed_in` の記入を同一 PR で行わない．
  `fixed_in` は出版時にまとめて記入する．
