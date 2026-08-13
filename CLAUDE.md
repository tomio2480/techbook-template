# CLAUDE.md

本リポジトリ（およびこのテンプレートから作られた執筆リポジトリ）で
Claude が作業する際の必須事項を定める．

- 版管理（版番号・出版時フロー）と正誤表（`errata/errata.yml`）は
  `docs/spec/edition-errata.md` が扱う．着手前に必ず読むこと．
- 奥付（`99-colophon.md`・`book.yaml` の `authors`／`errata`／`copyright`）に
  関わる作業がある．着手前に必ず `docs/spec/colophon.md` を読むこと．
- ISDN（`config/isdn.yaml`・`back-cover.md`・奥付の `{{isdn}}`）は
  `docs/spec/isdn.md` が扱う．着手前に必ず読むこと．
- 表紙・本扉・裏表紙（`cover.md`・`title-page.md`・`back-cover.md`）は
  `docs/spec/cover.md` が扱う．背景画像・テーマ CSS 変数も同じ spec の
  範囲である．着手前に必ず読むこと．
- `config/isdn.yaml` へ申請フォームのパスワード等の認証情報を書かない．
  氏名・メールアドレスなどの個人情報も既定では書かない．
- 出版・版番号の変更・正誤を追記したら，`npm run check:errata` で
  整合性を検査すること．
- `errata/errata.yml` の `book.slug` にはリポジトリ名やその一部を使わない．
  公開サイトへ出力されるため，リポジトリ名を推測できる値は禁止する．
- 原稿の修正と `fixed_in` の記入を同一 PR で行わない．
  `fixed_in` は出版時にまとめて記入する．
- `README.md` を含むリポジトリ内の日本語文書は，句点を「．」で統一する．
  句点に「。」を残す例外は設けない（Issue #72）．
