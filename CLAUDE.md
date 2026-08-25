# CLAUDE.md

本リポジトリ（およびこのテンプレートから作られた執筆リポジトリ）で
Claude が作業する際の必須事項を定める．

- 版管理（版番号・出版時フロー）と正誤表（`errata/errata.yml`）は
  `docs/spec/edition-errata.md` が扱う．着手前に必ず読むこと．
- 奥付（`99-colophon.md`・`book.yaml` の `authors`／`errata`／`copyright`）に
  関わる作業がある．着手前に必ず `docs/spec/colophon.md` を読むこと．
- ISDN（`config/isdn.yaml`・`back-cover.md`・奥付の `{{isdn}}`）は
  `docs/spec/isdn.md` が扱う．着手前に必ず読むこと．
- 紙入稿用 PDF は `docs/spec/print-layout.md` が扱う．
  `npm run build:print`・改丁・面付け・MEMO ページ・表紙の同梱可否と，
  入稿データからの透明効果の除去が範囲である．
  着手前に必ず読むこと．
- 入稿先の要件（`docs/spec/print-submission.md`）は雛形である．
  入稿先を決めるとき，または入稿データを作るときに読むこと．
  本テンプレートでは数値を埋めない．実在する印刷所の要件は書籍側で書く．
- 表紙・本扉・裏表紙（`cover.md`・`title-page.md`・`back-cover.md`）は
  `docs/spec/cover.md` が扱う．背景画像・テーマ CSS 変数と，
  表紙単体の入稿データ生成（`npm run build:cover`）も同じ spec の範囲である．
  着手前に必ず読むこと．
- 索引（`99-index.md`・`npm run gen:index`・`npm run check:index`）は
  `docs/spec/index-page.md` が扱う．着手前に必ず読むこと．
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
- 読点は「，」で統一する（Issue #90・#99）．
  句点は `ja-no-mixed-period` が，読点は `.prh-extra.yml` の規則が検出する．
  字種そのものを話題にするときは「、」のように鍵括弧で 1 字を囲む．
  この形は `.textlint-allowlist.yml` が指摘から除外する．
- 図表キャプションは体言止めとし，句点を付けない（Issue #116）．
  `docs/` で使う `表 1. …` の形は `.textlint-allowlist.yml` が除外する．
  原稿側は番号を自動で付けるため接頭辞が無く，allowlist では外せない．
  キャプション段落だけを `textlint-disable` と `textlint-enable` の
  コメントで挟む（Issue #118）．接頭辞を原稿へ書くと CSS の採番と
  二重になるため，原稿側では接頭辞を使わない．
- 開き括弧の直後にインライン数式を置かない（Issue #134）．
  Vivliostyle が数式の直前を改行位置に選び，開き括弧だけが行末へ残る．
  和文の行末禁則を破る誌面になるためである．括弧の種類は問わない．
  量記号の前へ語を補う．または括弧を使わず地の文で示す．
