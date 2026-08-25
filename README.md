# 技術書の自動組版テンプレート

Vivliostyle を使用した技術書執筆のためのテンプレートリポジトリ．Markdown で執筆し，GitHub Actions で PDF を生成する（生成は明示的に指示したときのみ）．

## 📋 目次

<!-- 断片の先頭のハイフンは見出しの絵文字によるもの．GitHub が生成するアンカーに合わせてある． -->

- [機能](#-機能)
- [必要環境](#-必要環境)
- [セットアップ](#-セットアップ)
- [使い方](#-使い方)
- [Markdown 執筆ガイド](#️-markdown-執筆ガイド)
- [アクセシビリティ（タグ付き PDF）](#-アクセシビリティタグ付き-pdf)
- [ディレクトリ構造](#-ディレクトリ構造)
- [カスタマイズ](#-カスタマイズ)
- [GitHub 運用](#️-github-運用)
- [版管理と正誤表](#-版管理と正誤表)
- [トラブルシューティング](#-トラブルシューティング)

## 🔧 機能

- Markdown による執筆
- JIS B5 サイズ PDF の自動生成
- シンタックスハイライト対応（行番号付き）
- 図・表・数式の自動番号付け
- 表紙・目次・あとがき・奥付の自動生成
- 章の扉ページ（縁取りの大きな章番号＋CHAPTER ラベル）
- コラム・Tips・注釈・注意・章まとめのテンプレートブロック
- カラーパレットファイル（`palette.css`）による配色の一括差し替え
- コラム・Tips 内の図表・数式番号の連番対応
- 付録（Appendix）のアルファベット章番号対応
- 解答（Answers）章の専用採番対応（本文・目次とも A. / A.n. 形式）
- 目次の章番号カウントからの特殊章（まえがき・付録・解答等）の自動除外
- 図表キャプションのページまたぎ防止
- 番号付きリスト全体のページまたぎ防止（目次は対象外）
- 図の横並び・本文の回り込み用クラス（`figure-row`・`figure-wrap`）
- 2 パスビルド中断時の検証（フェイルセーフ）
- 全角文字間の文中改行を自動で詰める処理（意図しない半角スペースの防止）
- ビルド後処理によるタグ付き PDF（Tagged PDF）の自動生成
- 索引（ページ番号は `target-counter` で解決．骨組みの生成と参照の検査つき）
- 紙入稿用 PDF の別出力（改丁・面付け・MEMO ページ・章名入りの小口のつめ・塗り足し・透明効果の除去）
- 表紙単体の入稿データの書き出し（表 1・表 4 を別ファイルへ．塗り足しと `TrimBox` つき）
- GitHub Actions による CI/CD
- Issue テンプレートによる進捗管理

## 📦 必要環境

- Node.js 18.0.0 以上
- npm
- Java 11 以上（タグ付き PDF 生成に使う `@opendataloader/pdf` の実行に必要）

## 🚀 セットアップ

```bash
# リポジトリをクローン
git clone https://github.com/your-username/your-book.git
cd /path/to/your/repo

# 依存関係をインストール
npm install
```

## 📖 使い方

### PDF のビルド

```bash
npm run build
```

生成された PDF は `dist/book.pdf` に出力される．内部ではページ番号を解決するため
2 パスでビルドする．続いて `scripts/verify-build.mjs` がビルド完了を検証する．
最後に `scripts/tag-pdf.mjs` が `dist/book.pdf` へアクセシビリティタグを付与して
上書きする．検証またはタグ付けに失敗した場合はコマンドが非 0 で終了するため，
`dist/book.pdf` の内容を確認せず配布しないこと．タグ付き PDF 対応の詳細は
「[アクセシビリティ（タグ付き PDF）](#-アクセシビリティタグ付き-pdf)」を参照．

`src/chapters/toc.html` の `<nav>` 内は手動編集してよい．追加した項目や
言い換えたリンク文言は，次回 `npm run build` 実行後も保持される．

ただし `vivliostyle.config.js` の `entry` に無い原稿を指す項目だけは，
ビルドが取り除く．消えた原稿を指したままだと，ページ番号が `??` と
刷られるためである（`target-counter` が解決できない）．
項目を残したまま原稿を消すことはできない．
親の項目に付けた属性や独自のマークアップは，子を取り除いても保たれる．

### 紙入稿用 PDF のビルド

```bash
npm run build:print
```

紙で印刷・製本するための PDF が `dist/book-print.pdf` に出力される．
`npm run build` の出力（`dist/book.pdf`）はそのまま電子書籍用として残る．

紙用の出力では次の 5 つを施す．

- 改丁．区分の始まりを指定した面から始める．既定ではまえがき・あとがきと
  章の扉が奇数ページ（開いて右），目次・奥付が偶数ページ（開いて左）である．
- 面付け．総ページ数を綴じの単位（既定 4 ページ）の倍数へ揃える．
  調整分は奥付の直前へ寄せ，奥付を最後の記載として残す．
  奥付の面を保つ都合で，端数の 1 ページだけが奥付の後ろに残ることがある．
- 小口のつめ．番号の帯とタイトルを，対象の区分の奇数ページ（開いて右）の
  外側の端へ縦組みで刷る．高さは並び順に下がり，閉じた本の小口で区分を
  見分けられる．対象は章扉を持つ原稿と，`print.section_tabs` へ並べた区分である．
  番号とタイトルは章扉の記述から取り，扉を持たない区分では
  指定値と原稿の `h1` から取る．章扉のページには出ない．
- 塗り足し（タチキリ）．ページを仕上がりより天地左右へ 3 mm 大きく組む．
  PDF には仕上がりの位置が `TrimBox` として記録される．
  紙面の端に接する要素（表紙・裏表紙の背景と小口のつめ）も端まで伸ばす．
  量は `print.css` の `--bleed` で変える．電子書籍用の出力には施さない．
- 透明効果の除去．透けた結果の色をあらかじめ焼き，透明の指定を持たせない．
  透明を再現できない印刷所があるためである．
  見た目は電子書籍用と変わらない．出来上がった PDF は毎回検査され，
  透明が残っていればビルドが失敗する．表紙単体の書き出しも同じ検査を通る．

改丁と面付けで空くページは白紙にせず，`MEMO` の見出しと枠を持つページで埋める．
落丁（ページの抜け）と読者や印刷所に誤解されないためである．

内部では 3 パスでビルドする．1 パス目で HTML を生成し，2 パス目（測定パス）で
各区分のページ数を実測し，3 パス目で MEMO ページとつめを入れて組み直す．
最後にページ数を検査し，タグ付き PDF へ変換する．
要求・要件の詳細は `docs/spec/print-layout.md` を参照．

面の指定と綴じの単位は `config/book.yaml` の `print` で変える．

```yaml
print:
  page_multiple: 4        # 綴じの単位．総ページ数をこの倍数へ揃える
  section_start:          # 区分の始まりの面（recto: 奇数／verso: 偶数）
    "00-preface": recto
    "toc": verso
    "98-afterword": recto
    "99-colophon": verso
  chapter_start: recto    # 章扉を持つ原稿の始まりの面
  filler_before: "99-colophon" # 調整ページを寄せる先の原稿
  cover:
    include: true         # 本文 PDF へ表紙・裏表紙を含めるか
```

多くの印刷所は表紙を本文と別のデータで受け取る．
その場合は `print.cover.include` を `false` にする．
本文 PDF は本扉から始まる．面付けの計算でも表紙を外す．
総ページ数は `page_multiple` の倍数を保つ．
電子書籍用の `npm run build` は，この指定に関わらず表紙・裏表紙を含める．

章扉（`chapter-opening`）を持つ原稿には，つめが自動で付く．
扉を持たない区分（`# 見出し` から始まる付録など）へつめを付けたいときは，
`print.section_tabs` へ対象を並べる．

```yaml
print:
  section_tabs:
    "97-appendix": "X"    # 付録のつめ．値はつめへ刷る番号の文字
```

キーは原稿ファイル名に含まれる文字列である．タイトルは原稿の `h1` から取る．
番号は扉があれば扉を優先し，無いときだけ指定値を使う．
面の指定は `section_start` が引き続き担い，`section_tabs` は面へ影響しない．
つめの高さは対象の並び順で決まり，付録は章の後ろへ出る．

本テンプレートの付録は扉を持つため，既につめの対象である．指定は要らない．

つめの大きさと並べる範囲は `config/themes/techbook/print.css` の変数で調整する．
対象は `--tab-width`・`--tab-height`・`--tab-area-top` の 3 つである．
並べる範囲の高さは `--tab-area-height`，タイトルの長さは `--tab-title-length` で決まる．
配色は `palette.css` で変える．
帯は `--tab-bg`，章番号は `--tab-label-color`，タイトルは `--tab-title-color` である．
章ごとの高さを定める `print-tabs.generated.css` はビルドが生成する．
このファイルは直接編集しない．

`--tab-page-margin-top` は `theme.css` の `@page` 上余白と揃える．
版面の余白を変えたときは，この値も同じ量へ直すこと．

`section_start` のキーは原稿ファイル名に含まれる文字列である．
面の指定はここが単一の出所であり，テーマ CSS の書き換えは要らない．
ビルドが指定を読み，該当する原稿へ面を伝える．

印刷所へ入稿するときは，入稿先の要件を書き留める．
解像度・塗り足し・ページ数の単位・ファイル名の規則は印刷所ごとに違い，
先方の資料に散っている．要件の表と，出力した PDF を測る観点の雛形として
[紙入稿要件 要求・要件（雛形）](docs/spec/print-submission.md) を置いてある．
数値は入稿先を決めた書籍側で埋める．本テンプレートは枠組みだけを持つ．

### 表紙単体の入稿データのビルド

```bash
npm run build:cover
```

表 1（表紙）と表 4（裏表紙）を 1 ページずつ書き出す．
出力先は `dist/cover.pdf` と `dist/back-cover.pdf` である．
多くの印刷所は表紙を本文と別のデータで受け取る．

表 1 と表 4 は 1 枚続きにせず，別のファイルへ書き出す．
別にすると印刷所が背幅を両者から半分ずつ取る．背幅を自分で加えずに済む．
背表紙（スパイン）・表 2・表 3 は対象外である．

寸法は紙入稿用の本文とそろえ，塗り足しを含める．
量は `print.css` の `--bleed` を単一の出所として読み，表紙側で書き写さない．
仕上がりの位置は `TrimBox` として記録される．

書き出した後に次の 5 つを検査する．

- 1 ページで組まれている．
- 塗り足しが四辺とも指定どおりである．
- 表 1 と表 4 の仕上がり寸法がそろっている．
- 文字がテキストとして抽出できる．表紙には書名と著者名が入っている．
- 透明効果が残っていない．本文 PDF と同じ検査を通す．

書名と著者名は `config/book.yaml` から表紙へ流し込む．
値が無いと空文字へ置き換わるため，組む前に指定の有無を確かめる．

ISDN を発行済みなら，裏表紙に番号が入っていることも確かめる．
バーコード画像が無いと，番号が正しくても情報ブロックごと出力から消えるためである．
番号未発行は正常な状態であり，この確認を省く．

本文 PDF から表紙を外すかどうかは `print.cover.include` で別に指定する．
外す指定は本文側の話であり，表紙そのものを渡す手立てにならない．
要求・要件の詳細は [表紙・裏表紙テンプレート 要求・要件](docs/spec/cover.md) を参照．

### スクリプトのテスト

```bash
npm test
```

`scripts/` 配下の全テストスクリプト（`*.test.mjs`）をまとめて実行する．
対象は行番号付与・ビルド検証・PDF タグ付けの各検査である．
配色コントラスト・透過ハードストップ・図版 SVG の配色（グレースケール
輝度差）の回帰検査も併せて走る．

### プレビュー

```bash
npm run preview
```

ブラウザでプレビューが表示される．

### 装飾スタイルカタログのビルド

```bash
npm run build:samples
```

章扉・見出し・枠ものなどの装飾スタイルを一覧できるカタログ PDF が
`dist/design-samples.pdf` に出力される．配色カスタマイズの確認に使える
（`npm run preview:samples` でプレビューも可能）．

### 新しい章の追加

1. `src/chapters/` に新しい Markdown ファイルを作成する
2. `vivliostyle.config.js` の `entry` 配列にファイルを追加する
3. frontmatter で章番号を設定する

## ✏️ Markdown 執筆ガイド

### 章ファイルの基本構造

各章の Markdown ファイルは以下の構造で記述する．扉ページの HTML ブロックを章の先頭に配置し，その後に通常の Markdown コンテンツを続ける．

```markdown
---
body:
  style: "counter-set: chapter 0;"
---

<section class="chapter-opening">
<p class="chapter-number">1</p>
<p class="chapter-title">章タイトル</p>
<div class="chapter-summary">
この章の概要を記述する．
</div>
<div class="chapter-topics">
<p class="chapter-topics-title">この章で学ぶこと</p>
<ul>
<li>トピック1</li>
<li>トピック2</li>
</ul>
</div>
</section>

# 章タイトル

本文...
```

 **frontmatter の設定**

| 章 | counter-set の値 |
|----|------------------|
| 第1章 | `counter-set: chapter 0;` |
| 第2章 | `counter-set: chapter 1;` |
| 第3章 | `counter-set: chapter 2;` |
| 第N章 | `counter-set: chapter N-1;` |

まえがきなど番号不要の章は以下のように設定する．

```markdown
---
class: preface
---

# まえがき
```

あとがきや奥付も同様に `class` で指定する．

| 種類 | class の値 |
|------|-----------|
| まえがき | `preface` |
| あとがき | `afterword` |
| 奥付 | `colophon` |
| 表紙 | `cover` |
| 本扉 | `title-page` |
| 裏表紙 | `back-cover` |
| 付録 | `appendix` |
| 解答 | `answers` |
| 索引 | `index` |

### 付録（Appendix）

付録として章番号をアルファベット（A, B, C...）にするには，frontmatter で `class: appendix` を指定する．

```yaml
---
class: appendix
body:
  style: "counter-set: chapter 0;"
---
```

`counter-set: chapter 0` の場合，h1 で A になる．`counter-set: chapter 1` の場合は B になる．図・表・数式の番号も自動的にアルファベット形式（例: `図A.-1`）となる．扉ページの章番号は HTML に直接「A」等を記述する．

目次では付録が通常の章番号カウントから除外され，出現順に A. / A.1. / A.1.1. 形式で採番される．本文側で `counter-set` の開始値を変えた場合は，目次側の文字と一致しなくなるためカスタム CSS での上書きが必要になる．

### 解答（Answers）

演習問題の解答をまとめた章には，frontmatter で `class: answers` を指定する．

```yaml
---
class: answers
---
```

章見出し（h1）には章番号の代わりに「A.」が付く．節見出し（h2）は「A.1.」「A.2.」のように採番され，対応する章の番号と一致させる想定である．目次でも通常の章番号カウントから除外され，同じ形式で採番される．

なお，解答の「A.」と最初の付録の「A.」は接頭辞が衝突する．併用する場合は，テーマ CSS の上書きで付録側の文字を変更するなどの調整を検討する．

### 奥付（Colophon）

奥付（`99-colophon.md`）は，ページ上部に著者紹介，下部に書籍タイトル・発行履歴・奥付情報・正誤表リンク・ISDN 番号・著作権表記を置く構成である．著者紹介・正誤表リンク・著作権表記は `config/book.yaml` のデータから流し込める．原稿には単独の段落としてマーカーを書く．

- `{{authors}}`: 著者紹介（ページ上部に表示される）
- `{{errata}}`: 正誤表ページへの案内（奥付情報の下部に表示される）
- `{{copyright}}`: © 表記と無断複製・転載の禁止文言（奥付の最下部に表示される）

発行履歴は書籍タイトル見出しの直下に手書きする．版や刷が増えたら，段落（空行区切り）として 1 行ずつ追記する．

```markdown
# 書籍タイトル

2026年08月06日 初版第一刷発行

2027年01月10日 第二版第一刷発行
```

データは `config/book.yaml` に書く．

```yaml
authors:
  - name: "著者名"          # 必須
    sns: "@example"          # 任意．氏名の後ろに（@example）と表示される
    bio: "紹介文．140 文字程度を目安にする．"  # 任意
    link:                    # 任意．title と url を 1 組だけ書く
      title: "Web サイト"
      url: "https://example.com/"

errata:
  url: "https://example.github.io/errata/books/example-book/"

# year は初版発行年．4 桁の数値，または "YYYY-YYYY" 形式の文字列
# holder 省略時は上部の author を使う．notice 省略時は既定の禁止文言を使う
copyright:
  year: 2026
  holder: "著者名"          # 任意
  notice: "本書の一部または全部を，著作権者の許諾なく複製・転載・改変・公衆送信することを禁じます．"  # 任意
```

データが無い場合，マーカーは出力から取り除かれ，ビルド時に警告が出る．`errata.url` が `errata/errata.yml` の slug と食い違う場合は `npm run check:errata` が警告する．要求・要件の詳細は `docs/spec/colophon.md` を参照．

採番の除外一覧や拡張方法の詳細は [目次と特殊章の採番 要求・要件](docs/spec/toc-numbering.md) を参照．

### ISDN（国際標準同人誌番号）

同人誌の作品識別子 [ISDN](https://isdn.jp/) に対応している．運用の流れは次のとおり．

1. 執筆中に `config/isdn.yaml` の `application` 節へ申請情報（よみがな・レーティングなど）を書きためる．
2. 書籍の完成後，`application` 節を見ながら [申請ページ](https://isdn.jp/mail/registrar/) へ入力して申請する．
3. 運営からメールで届いた番号を `issued.number` へ書き，バーコード画像を `src/assets/isdn-barcode.png` へ置く．
4. ビルドすると奥付へ番号が，裏表紙（`back-cover.md`）へバーコードが流し込まれる．

テンプレート初期状態では，サンプル番号・サンプル C コード・ダミーバーコード画像が設定されており，裏表紙の見た目をビルド直後から確認できる．ダミー画像は実際の読み取りができない．サンプル番号やダミー画像のままビルドすると `npm run check:isdn` が差し替え忘れをそれぞれ警告する．

原稿には単独の段落としてマーカーを書く．

- `{{isdn}}`: ISDN 番号（奥付の正誤表リンクの下・著作権表記の直上に表示される）
- `{{isdn-barcode}}`: バーコードの情報ブロック（裏表紙の右上規定位置に白地プレートで配置される）

情報ブロックはバーコード画像の脇へ文字情報を添える．内訳は ISDN 番号，コード行，発行サークル名の 3 行である．コード行は `C0095 ¥1000E` 形式で C コードと価格を併記する．コード行と発行者は `application` 節（`c_code`・`price`・`circle`）から流し込む．無い項目の行は出力しない．サークル名は情報ブロックが出力するため，`back-cover.md` の自由記述と重複させないこと．

データが無い場合，マーカーは出力から取り除かれ，ビルド時に警告が出る．番号の形式（13 桁・プレフィックス 278/279・チェックディジット）は `npm run check:isdn` が検査する．この検査は `npm run build` の冒頭でも自動実行される．

バーコードの位置・幅はテーマ CSS の変数で調整できる．対象は `--isdn-barcode-top`・`--isdn-barcode-right`・`--isdn-barcode-width` である．申請フォームの管理用パスワードは `config/isdn.yaml` へ書かないこと．要求・要件の詳細は [ISDN 対応 要求・要件](docs/spec/isdn.md) を参照．

### 索引

用語からページを引く索引を巻末に置ける．原稿は `src/chapters/99-index.md` で，frontmatter に `class: index` を与える．**ページ番号は原稿へ書かない．** テーマ CSS の `target-counter` が組版の結果から解決するため，本文が動いても古くならない．

本文側には，索引に載せる語の直前へアンカーを置く．和文の語には読みを添える．五十音の区分と並び順に使う．

```markdown
<a id="idx-svg-1" data-index="SVG"></a>回路図は SVG 形式でエクスポートする．

<a id="idx-formula-1" data-index="数式" data-yomi="すうしき"></a>文中に数式を埋め込む場合，…
```

索引の骨組みは次のコマンドで作れる．

```bash
npm run gen:index
```

本文のアンカーを集め，区分（英字・数字・あ行〜わ行・未分類）ごとに並べたものが標準出力へ出る．原稿は書き換えない．載せる語を選ぶのは執筆者であり，出力を取捨して `<div class="index-body">` の中へ貼る．見出し語や読みが未指定の項目は標準エラーへ挙がる．

参照の食い違いは次のコマンドで調べる．`npm run build` と `npm run build:print` の前段でも走る．

```bash
npm run check:index
```

参照先が本文に無くても，ビルドは成功してしまう．Vivliostyle は解決できない `target-counter` を `??` で埋め，警告も出さない．気付かないまま `??` を刷った PDF を入稿しかねないため，ビルドの前に止める．

索引を置かない本では，`src/chapters/99-index.md` を消して `vivliostyle.config.js` の `entry` から外す．検査とビルドはそのまま通る．目次（`src/chapters/toc.html`）に残る索引の項目は次のビルドが取り除くため，手で消す必要は無い．

段組みはテーマ CSS の `--index-columns`・`--index-column-gap` で調整する．見出し語とページ番号の間，およびページ番号どうしの区切りは `--index-term-gap`・`--index-page-separator` で変える．区分見出しの色は `palette.css` の `--index-group-color`・`--index-group-rule` で変える．

目次の章番号は，原稿ファイル名に `index` を含む区分を除外する仕組みで抑えている．索引の原稿を改名するときは，テーマ CSS の除外リストも合わせて直す．

要求・要件の詳細は [索引 要求・要件](docs/spec/index-page.md) を参照．

### 見出し

見出しには自動で番号が付与される．章番号も自動で付与されるため，Markdown では章タイトルのみを記述する．

```markdown
# 章タイトル            → 第1章 章タイトル
## 節タイトル           → 1.1. 節タイトル
### 項タイトル          → 1.1.1. 項タイトル
#### 款タイトル         → 1.1.1.1. 款タイトル
```

### コードブロック

コードブロックには自動で行番号とシンタックスハイライトが付与される．

````markdown
```python
def hello():
    print("Hello, World!")
```
````

 **対応言語**

```text
javascript, typescript, python, rust, go, bash, json, yaml,
markup（HTML）, css, markdown, c, cpp
```

### コラム

補足情報やコラムには `column` クラスを使用する．

```html
<div class="column">
<p class="column-title">コラムタイトル</p>
<p>コラムの本文を記述する．</p>
</div>
```

### Tips

実用的なヒントや注意事項には `tips` クラスを使用する．

```html
<div class="tips">
<p class="tips-title">Tips: ヒントのタイトル</p>
<p>ヒントの本文を記述する．</p>
</div>
```

コラムや Tips 内へ図（`<figure>`）・表・数式（`<span class="math display">`）を配置できる．その場合も図番号・表番号・式番号は正しく連番で付与される．付録の中であれば，章番号はアルファベットになる．

### 注釈・注意

補足の注釈は `note` クラスを使用する．注意喚起は `caution` クラスを使用する．タイトル帯（Note・Caution）と背景アイコンは自動で付与される．旧 `warning` クラスは `caution` へ改名した．

```html
<div class="note">
<p>本文の理解を補う周辺情報を記述する．</p>
</div>

<div class="caution">
<p>読者が誤ると問題になる注意事項を記述する．</p>
</div>
```

### 章まとめ枠

章末で要点をチェックリスト形式で振り返るには `chapter-recap` クラスを使用する．箇条書きの各項目には自動でチェック印が付く．

```html
<div class="chapter-recap">
<p class="chapter-recap-title">この章のまとめ</p>
<ul>
<li>要点1</li>
<li>要点2</li>
</ul>
</div>
```

### HTML ブロック内での数式

コラム，Tips，章の扉ページなどの HTML ブロック内では，Markdown の `$...$` 記法は使用できない．Markdown テーブルは HTML ブロックではないため，テーブル内では `$...$` がそのまま使える．

HTML ブロック内で数式を表示するには， `data-math-typeset="true"` 属性を付けて以下の形式で記述する．

 **インライン数式**

```html
<span class="math inline" data-math-typeset="true">\(E = mc^2\)</span>
```

 **ブロック数式**

```html
<span class="math display" data-math-typeset="true">$$\int_{0}^{1} x^2 dx$$</span>
```

### 図の挿入

図は Markdown の画像記法で挿入する．キャプションと番号は自動で付与される．

```markdown
![LED点滅回路](../assets/diagrams/led-circuit.svg)
```

出力例は次のとおり．

```text
図3.2.-1: LED点滅回路
```

 **番号の形式**

図の番号は所属するセクションに応じて変化する．

| 配置場所 | 番号形式 |
|----------|----------|
| 章直下 | 図3.-1 |
| 節直下 | 図3.1.-1 |
| 項直下 | 図3.1.2.-1 |
| 款直下 | 図3.1.2.1.-1 |

 **推奨フォーマット**

- SVG: 回路図，ダイアグラム（拡大しても劣化しない）
- PNG: スクリーンショット，写真

 **色地に置く記号図**

白地を前提に描いた記号図は，コラムや Tips の色地の上へ置くと線が沈む．`img` タグへ `class="on-white"` を指定すると，画像の背景へ白を敷いて線を保てる．クラスを与えるため，Markdown の画像記法ではなく HTML で書く．

```html
<figure>
<img class="on-white" src="../assets/diagrams/led-circuit.svg" alt="図の内容">
<figcaption>キャプション</figcaption>
</figure>
```

図の SVG へ白い矩形を敷く手もあるが，内部余白を詰めた分だけ白帯が細く浮き上がり，かえって目立つ．

 **図を横に並べる**

関連する図を左右に並べるには `figure-row` クラスの `div` で囲む．キャプションは 1 枚ずつ付ける．まとめて 1 つにすると，どちらの説明か読み取れない．番号も 1 枚ずつ付く．

```html
<div class="figure-row">
<figure>
<img src="../assets/diagrams/led-a.svg" alt="図の内容">
<figcaption>キャプション</figcaption>
</figure>
<figure>
<img src="../assets/diagrams/led-b.svg" alt="図の内容">
<figcaption>キャプション</figcaption>
</figure>
</div>
```

並べた図は下端でそろえる．高さの違う図を上でそろえると，キャプションの行が段違いになり読み取りにくいためである．

 **本文を回り込ませる**

縦に細長い図を `figure-wrap` の `div` で囲むと，脇へ本文が回り込む．図には `figure-float` クラスを与える．回り込ませる本文も同じ枠へ入れる．

```html
<div class="figure-wrap">
<figure class="figure-float">
<img src="../assets/diagrams/led-circuit.svg" alt="図の内容">
<figcaption>キャプション</figcaption>
</figure>
<p>図の脇へ回り込ませる本文を書く．</p>
</div>
```

枠は 1 ページへ収まるように組む．ページをまたぐ回り込みは崩れるためである．既定の幅は版面の 4 割である．変える場合は `figure` へ `style="width: …"` を書く．

回り込みが必ずページを減らすとはかぎらない．図の高さより本文が長ければ，かえって背が伸びる．適用の前後でページ数を測るとよい．

### 表の挿入

表の直前にキャプション（タイトル）を 1 行で記述する．番号は自動で付与される．

```markdown
<!-- textlint-disable ja-technical-writing/ja-no-mixed-period -->

Arduino Uno を使った温度計の部品表

<!-- textlint-enable ja-technical-writing/ja-no-mixed-period -->

| 部品名 | 型番 | 数量 | 単価 |
|--------|------|------|------|
| Arduino Uno | A000066 | 1 | 3,000 |
| 温度センサ | LM35DZ | 1 | 200 |
```

出力例は次のとおり．

```text
表2.3.-1: Arduino Uno を使った温度計の部品表
```

 **注意点**

- 表の直前の段落がキャプションとして扱われる
- キャプションは体言止めとし，句点「．」を付けない
- キャプション段落は `textlint-disable` と `textlint-enable` のコメントで挟む．
  体言止めのため `ja-no-mixed-period` が句点の欠落として検出する．
  コメントは要素にならないため，キャプションと表の隣接判定は保たれ，採番も変わらない．
  経緯は [Issue #118](https://github.com/tomio2480/techbook-template/issues/118) を参照する．
- 表の前に説明文を入れたい場合は，キャプションの前に配置する
- テーブル内では `$...$` による数式が使用できる（HTML ブロックとは異なる）

```markdown
以下に部品の一覧を示す．

部品表

| 部品名 | 型番 | ...
```

### 数式

数式は LaTeX 形式で記述する．

 **インライン数式**

```markdown
エネルギーと質量の関係は $E = mc^2$ で表される．
```

 **ブロック数式**

```markdown
$$
\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}
$$
```

ブロック数式には自動で番号が付与される．

出力例：(3.1.-1)

 **開き括弧の直後にインライン数式を置かない**

開き括弧の直後にインライン数式を置くと，Vivliostyle が数式の直前を改行位置に選ぶ．
その結果，開き括弧だけが行末へ残り，和文の行末禁則に反する誌面が組み上がる．
括弧の種類は問わない．`（` と `「` のどちらでも起こる．

量記号の前へ語を補う．または括弧を使わず地の文で示す．

```markdown
誤: 青色 LED（$V_F = 3.2\ \mathrm{V}$）
正: 青色 LED（順方向電圧 $V_F = 3.2\ \mathrm{V}$）
正: データシートに $I_v = 70\ \mathrm{mcd}$ とあれば，
```

組版後の数式は分割できない塊になる．Vivliostyle はその直前を改行位置に選び，
手前の文字が開き括弧かどうかを見ない．`line-break: strict` を足しても直らないため，
原稿の書き方で避ける．検証の記録は
[開き括弧の直後に置いた数式で行末禁則が破れる件](docs/notes/2026-08-18-math-kinsoku.md)
にある．

### 引用

```markdown
> 技術書は，読者が実際に手を動かして学べるように構成することが重要です．
```

### リスト

 **順序なしリスト**

```markdown
- 項目1
- 項目2
  - サブ項目2-1
  - サブ項目2-2
```

 **順序ありリスト**

```markdown
1. 最初の手順
2. 次の手順
3. 最後の手順
```

### 強調

```markdown
これは **太字** です．
これは *斜体* です．
これは `インラインコード` です．
```

 **太字の小見出し**

見出しを立てるほどではない語の説明には，太字で始まる段落を小見出しとして使う．本文と同じく行頭が 1 字下がると見出しとして拾いにくいため，`div` タグへ `class="term"` を指定して字下げを外す．

```html
<div class="term">

 **半値角** 正面の光度に対して半分の明るさになる角度である．

</div>
```

`p:has(> strong:first-child)` による自動判定は使えない．Vivliostyle が `:has()` の中で `:first-child` を見ず，太字を含むだけの段落まで拾うためである．

### 文中改行

読みやすさのため文中で改行してよい．全角文字（ひらがな・カタカナ・漢字・
全角記号）どうしに挟まれた改行は，レンダリング時に自動で詰められる．

```markdown
これはテストです．
改行の直後にも全角文字が続く場合の
挙動を確認します．
```

出力例は次のとおり．

```text
これはテストです．改行の直後にも全角文字が続く場合の挙動を確認します．
```

コードブロック・`script`/`style`・数式（`class="math ..."` を持つ範囲）
内の改行は対象外であり，そのまま保持される．

既知の制限として，`**強調**` や `[リンク]` 等のインライン要素の直前・
直後で改行した場合，テキストノードの分割により詰められないことが
ある．改行位置をインライン要素の外側に置くことで回避できる．

## ♿ アクセシビリティ（タグ付き PDF）

### 対応状況

Vivliostyle CLI が生成する PDF は，タグ付き PDF（Tagged PDF）にならない．
既知の不具合である
（[vivliostyle-cli#539](https://github.com/vivliostyle/vivliostyle-cli/issues/539)）．
本テンプレートでは，`npm run build` の後処理として
[OpenDataLoader PDF](https://github.com/opendataloader-project/opendataloader-pdf)
を実行する．依存は `@opendataloader/pdf`（Apache License 2.0）である．
その結果 `dist/book.pdf` へ `/StructTreeRoot`・`/MarkInfo`・`/Marked true` 等の
タグ構造が付く．

無料範囲は Tagged PDF の生成までである．PDF/UA-1・PDF/UA-2 への正式
準拠エクスポートは OpenDataLoader PDF の Enterprise 限定機能である．
また，レイアウト解析による見出し・表・読み順の自動検出が完全でない
可能性もある．書籍ごとに，実際の読み上げ順を後述の手順で検証すること．

図版の代替テキストは PDF へ引き継がれない．原稿側 `alt` 属性から
`Figure` タグ `/Alt` へ反映する経路が現行構成に存在しないためである．
`/Alt` は空か，図内の文字列を拾った値になりうる．解決には上流ツール
（Vivliostyle CLI または OpenDataLoader）の変更が必要である．当面は
図の説明を本文またはキャプションへ書いて補うこと．経緯・再検討の条件は
[Issue #26](https://github.com/tomio2480/techbook-template/issues/26)
および
[Figure タグ /Alt 調査と現状追認の判断](docs/notes/2026-07-16-figure-alt-investigation.md)
を参照する．

要求・要件の詳細は
[タグ付き PDF 生成（アクセシビリティ対応）要求・要件](docs/spec/pdf-tagging.md)
を参照．

### 前提環境

タグ付け処理には Java 11 以上が必要である．`java -version` で確認し，
未導入の場合は [Adoptium](https://adoptium.net/) 等から JDK を導入する．
GitHub Actions（`ubuntu-latest`）では `actions/setup-java@v5` で
Java 11 を導入している．

### veraPDF による手動検証手順

タグ付き PDF の構造が妥当かは，PDF/UA 検証ツールである
[veraPDF](https://verapdf.org/) で確認できる．CI への自動組み込みは
スコープ外とし，以下の手動手順を用いる．

1. [veraPDF のインストーラ](https://verapdf.org/software/) を入手し，
   ローカル環境にインストールする．
2. GUI 版を使う場合，`dist/book.pdf` を読み込み，検証プロファイルに
   `PDF/UA-1` を選択して検証する．
3. CLI 版を使う場合，以下のコマンドで検証結果を確認する．

   ```bash
   verapdf --flavour ua1 dist/book.pdf
   ```

4. 検証レポートで `/StructTreeRoot`・`/MarkInfo`・`/Marked true` の
   有無を確かめる．見出し・段落の読み上げ順が原稿の意図と一致するかも
   確認する．
5. 自動検出精度に起因する誤りが見つかった場合の対処を検討する．
   候補は OpenDataLoader PDF Enterprise 版の視覚エディタである．
   他の PDF 編集ツールでの手動修正も選べる．いずれも本テンプレートの
   対応範囲外となる．

## 📂 ディレクトリ構造

`scripts/` は全数を載せる．前半には単体で実行するものが並ぶ．
後半は他のスクリプトから呼ばれる部品である．

```
techbook-template/
├── src/
│   ├── chapters/              # 原稿ファイル
│   │   ├── cover.md           # 表紙
│   │   ├── title-page.md      # 本扉
│   │   ├── 00-preface.md      # まえがき
│   │   ├── toc.html           # 目次（自動生成＋手動編集の保持）
│   │   ├── 01-introduction.md # 第1章
│   │   ├── 02-advanced.md     # 第2章
│   │   ├── 03-math-and-figures.md # 第3章
│   │   ├── 96-answers.md      # 解答
│   │   ├── 97-appendix.md     # 付録
│   │   ├── 98-afterword.md    # あとがき
│   │   ├── 99-index.md        # 索引（用語からページを引く一覧）
│   │   ├── 99-colophon.md     # 奥付
│   │   └── back-cover.md      # 裏表紙（ISDN バーコード配置）
│   ├── design-samples/        # 装飾スタイルカタログ原稿
│   └── assets/
│       ├── images/            # 写真・スクリーンショット・表紙裏表紙の背景
│       ├── diagrams/          # 回路図・図表
│       └── isdn-barcode.png   # ISDN バーコード（初期はダミー画像）
├── config/
│   ├── isdn.yaml              # ISDN 申請情報・発行情報
│   └── themes/
│       └── techbook/
│           ├── theme.css      # メインスタイル
│           ├── palette.css    # カラーパレット（2 層トークン）
│           ├── print.css      # 紙入稿用の改丁・MEMO ページ・小口のつめ（章名入り）
│           ├── print-measure.css # 紙入稿用ビルドの測定パス専用
│           ├── print-tabs.generated.css # つめの位置（ビルドが生成．.gitignore 済）
│           ├── design-variants.css # カタログ用補助スタイル
│           └── code-highlight.css
├── errata/
│   └── errata.yml             # 正誤表の原本（版一覧・正誤情報）
├── scripts/                   # 全数を掲載．前半は単体実行，後半は部品
│   ├── add-line-numbers.mjs   # 行番号追加・目次マージスクリプト
│   ├── verify-build.mjs       # ビルド中断検知（フェイルセーフ）
│   ├── tag-pdf.mjs            # タグ付き PDF 生成（ビルド後処理）
│   ├── build-print.mjs        # 紙入稿用 PDF のビルド（改丁・面付け）
│   ├── build-cover.mjs        # 表紙単体の入稿データのビルド（表 1・表 4）
│   ├── gen-index.mjs          # 索引の骨組みの生成（標準出力）
│   ├── check-errata.mjs       # 正誤表スキーマ・版整合の検査
│   ├── check-isdn.mjs         # ISDN 番号・バーコード整合の検査
│   ├── check-preface-errata.mjs # まえがきの正誤表案内マーカーの検査
│   ├── check-index.mjs        # 索引の参照と本文のアンカーの突合
│   ├── check-contrast.mjs     # 配色のコントラスト比の検査
│   ├── check-diagram-luminance.mjs # 図版 SVG の明度段パレットの検査
│   ├── check-gradient-hardstops.mjs # ハードストップ透過の検査
│   ├── check-icon-bake.mjs    # 焼いた枠アイコンと theme.css の一致の検査
│   ├── check-print-transparency.mjs # 入稿データの透明効果の検査
│   ├── print-layout.mjs       # 改丁・面付けの計算と MEMO ページ生成
│   ├── count-pdf-pages.mjs    # PDF のページ数の読み取り
│   ├── inject-book-meta.mjs   # 書名・著者名の流し込み
│   ├── inject-colophon.mjs    # 奥付の流し込み
│   ├── inject-isdn.mjs        # ISDN 発行情報の流し込み
│   ├── join-cjk-line-breaks.mjs # 全角文字間の文中改行の詰め
│   └── *.test.mjs             # 各スクリプトの単体テスト
├── dist/                      # 出力先（.gitignore 済）
├── .textlintrc.json           # 日本語文章検査の設定（原稿の文体宣言を含む）
├── .textlint-allowlist.yml    # 原稿側で直せない誤検出の除外パターン
├── .prh-extra.yml             # 中央辞書へ加算する表記ゆれ規則（読点の字種）
├── package.json
├── vivliostyle.config.js
├── vivliostyle.print.config.js # 紙入稿用ビルド設定
├── vivliostyle.cover.config.js # 表紙単体ビルド設定
├── vivliostyle.design-samples.config.js # カタログ用ビルド設定
└── README.md
```

## 🎨 カスタマイズ

### 書籍情報の変更

`vivliostyle.config.js` を編集する．

```javascript
export default {
  title: '書籍タイトル',
  author: '著者名',
  language: 'ja',
  size: 'JIS-B5',
  // ...
};
```

### 章の追加・変更

`vivliostyle.config.js` の `entry` 配列を編集する．以下は章を追加する場合の記述例である．

```javascript
// 例: 第4章を追加する場合
entry: [
  'src/chapters/cover.md',
  'src/chapters/title-page.md',
  'src/chapters/00-preface.md',
  'src/chapters/toc.html',
  'src/chapters/01-introduction.md',
  'src/chapters/02-advanced.md',
  'src/chapters/03-math-and-figures.md',
  'src/chapters/04-new-chapter.md',   // 追加した章
  'src/chapters/96-answers.md',
  'src/chapters/97-appendix.md',
  'src/chapters/98-afterword.md',
  'src/chapters/99-colophon.md',
  'src/chapters/back-cover.md',
],
```

### スタイルの変更

`config/themes/techbook/theme.css` を編集する．主な設定項目は以下の通り．

| 項目 | 設定箇所 | デフォルト値 |
|------|----------|--------------|
| ページサイズ | `@page { size: }` | jis-b5 |
| 余白 | `@page { margin: }` | 上22mm 左右18mm 下28mm |
| 本文フォントサイズ | `--font-size-base` | 10pt |
| 行間 | `--line-height` | 1.8 |
| 本文フォント | `--font-mincho` | Noto Serif CJK JP |
| 見出しフォント | `--font-gothic` | Noto Sans CJK JP |

 **段落の字下げ**

和文の慣行に合わせ，段落は原則としてすべて 1 字下げる．
見出し直後と節の最初の段落で字下げを外す欧文の体裁も選べる．
原稿の frontmatter で `class` へ `indent-western` を足す．
既に `class` を持つ原稿では，空白で区切って並べる．

```markdown
---
class: preface indent-western
---
```

書籍の全体へ効かせるには，各原稿へ同じ指定を書く．
または `theme.css` の当該指定から `body.indent-western` の限定を外す．

### 配色（カラーパレット）の変更

装飾の配色は `config/themes/techbook/palette.css` の 2 層トークンで
管理している．本ごとの配色替えは第 1 層（パレット層）の値だけを
書き換える．第 2 層（意味トークン層）と theme.css の変更は不要である．

```css
:root {
  /* 基調色（章扉・見出し・コラムなどの主装飾） */
  --palette-primary: #2f5b8c;       /* 例: 濃い色（文字・罫線） */
  --palette-primary-mid: #b0c4de;   /* 例: 中明度（罫線・折り返し） */
  --palette-primary-light: #f0f4f8; /* 例: 淡色（背景・帯） */
  /* ... */
}
```

グレースケール印刷でも判別できるよう，差し替え時は
濃（accent）・中（mid）・淡（light）の明度役割を守る．
変更結果は `npm run build:samples` のカタログ PDF で一覧確認できる．

コードブロックも配色に追従する．外装（背景・枠・行番号帯）は基調色
（primary）系トークンを参照する．シンタックスハイライトの色は第 1 層の
`--palette-code-*` で差し替えられる．差し替え時は全シンタックス色が
背景（`--code-bg`）に対してコントラスト比 4.5:1 以上を維持すること．
背景を暗くするほど条件が厳しくなるため，背景は淡色を保つ．

図版 SVG（`src/assets/diagrams/*.svg`）の補助記載（矢印・注釈線等）も
配色に追従する．使ってよい色は `--palette-diagram-annotation` と
明度段パレットに登録した色のみである．明度段パレットは
`scripts/check-diagram-luminance.mjs` の `DIAGRAM_TIER_COLORS` で定義する．グレースケール印刷でも判別できるよう，
Rec.601 輝度で 15 ポイント以上の差を機械検査する．実体配線図など実物の
色をそのまま再現する図は `EXCLUDED_FILES` で個別に検査対象から外せる．
図版を改名すると除外の記載だけが取り残されるため，実在しない名前が
残っていないかも `npm test` で検査する．

面を塗る下地の色は明度段より明るく，上の帯（20〜80 %）を外れる．
役割が違うため `DIAGRAM_WASH_COLORS` に別の区分として登録する．
既定は空であり，本ごとに足す．塗りを透明で薄める形は使わない．
指定した色だけを読む検査が，実際に刷られる色を見逃すためである．
合成後の色を焼いて登録する．

### 表紙・裏表紙の変更

表紙は `src/chapters/cover.md`，裏表紙は `src/chapters/back-cover.md` で書く．どちらも背景画像の上へ Markdown の文字をテキストのまま重ねて組む．文字を画像化しないため，スクリーンリーダー等の支援技術でも文字情報を読める．表紙の直後には本扉（`src/chapters/title-page.md`）が入る．本扉は背景を敷かず，タイトル・著者名のみを簡素に組む．要求・要件は `docs/spec/cover.md` を参照．

カスタマイズは次の 3 点で行う．

1. 背景画像: `src/assets/images/` 配下の 2 つの SVG を差し替える．別パスの画像は下表の背景画像変数で指定する．
2. 文字情報: `config/book.yaml` の `title`・`author` を書き換える．原稿のマーカー（`{{book-title}}`・`{{book-author}}`）を通じて表紙・本扉の両方へ反映される．`back-cover.md` の紹介文は直接書き換える．
3. 文字配置: テーマ CSS（`theme.css` の `:root`）の変数を上書きする．

主な変数は以下の通り．

| 変数 | 用途 | デフォルト値 |
|------|------|--------------|
| `--cover-background-image` | 表紙の背景画像 | cover-background.svg |
| `--back-cover-background-image` | 裏表紙の背景画像 | back-cover-background.svg |
| `--cover-padding` | 表紙の内側余白 | 30mm 20mm |
| `--cover-title-offset-top` | タイトルの天からのオフセット | 60mm |
| `--cover-title-font-size` | タイトルの文字サイズ | 32pt |
| `--cover-author-gap` | 著者名とタイトルの間隔 | 12mm |
| `--cover-author-font-size` | 著者名の文字サイズ | 14pt |
| `--cover-text-align` | 表紙の文字揃え | center |
| `--back-cover-padding` | 裏表紙の内側余白 | 150mm 20mm 20mm |
| `--back-cover-font-size` | 裏表紙の文字サイズ | 10pt |
| `--back-cover-text-align` | 裏表紙の文字揃え | center |

文字色は `palette.css` の意味トークンで変更する．対象は `--cover-title-color`・`--cover-author-color`・`--back-cover-text-color` である．裏表紙の ISDN バーコードは右上の規定位置（左綴じ前提）に配置される．文字情報の既定余白はこの位置を避けている（詳細は `docs/spec/isdn.md`）．

### 扉直後ページの章タイトル帯（オプション）

章扉（`.chapter-opening`）は章タイトルを扉ページ内に表示するため，
直後ページに再表示される `h1` 帯を重複と感じる場合がある．既定では
`h1` 帯を表示するが，章単位でオプトインして非表示にできる．

対象章の扉 HTML の `class` に `no-repeat-heading` を追加する．

```html
<section class="chapter-opening no-repeat-heading">
<p class="chapter-number">1</p>
<p class="chapter-title">章タイトル</p>
<!-- ... -->
</section>
```

扉のない章（まえがき・付録など）や，クラスを付けない章には影響しない．

Tips・注釈・注意の枠 3 種も基調色系トークンへ統一している．種別は
帯の英語ラベル（Tips・Note・Caution）と背景アイコンが担う．
配色替えは基調色の変更だけで完結する．この統一に伴い，
旧 `warning` クラスと `--warning-*` トークンを `caution` 系へ改名した．
第 1 層の旧 3 系統（`--palette-accent-*`・`--palette-note-*`・
`--palette-warning-*`）は廃止した．旧トークンを参照している
派生リポジトリは追従が必要である．

## 🏷️ GitHub 運用

### ラベル体系

| ラベル | 用途 |
|--------|------|
| `chapter:XX` | 章単位の管理 |
| `status:draft` | 執筆中 |
| `status:review` | レビュー待ち |
| `status:done` | 完了 |
| `type:writing` | 本文執筆 |
| `type:figure` | 図表作成 |

### ワークフロー

1. Issue を作成して執筆タスクを管理
2. ブランチを切って執筆
3. PR を作成すると `npm test` とリポジトリデータの検査が走る
4. プレビュー PDF が要るときは `build-pdf` ラベルを付けるか手動実行する
5. 版として公開するときは，マージ後の main で `v<version>` タグを push する

### 日本語文章の検査

PR では `markdownlint` と `textlint` が走り，指摘は差分行へコメントされる．
設定はルートの `.textlintrc.json` にある．ローカルの実行環境は持たず，
CI の結果を正とする．

- 文体の既定はである調である．読者へ語りかけるですます調で書く原稿は，
  ファイル先頭（frontmatter の直後）へ次の 2 行を置き，文体の検査だけ止める．
  文長・助詞重複・表記ゆれの検査は効いたまま残る．
  サンプル原稿では `00-preface.md`・`01-introduction.md`・
  `98-afterword.md`・`99-colophon.md` がこの方式を使っている．
  である調で書く原稿には何も足さない．

  ```markdown
  <!-- 本章は読者へ語りかける ですます調 で書く．文体の検査だけ止める． -->
  <!-- textlint-disable ja-technical-writing/no-mix-dearu-desumasu -->
  ```

  textlint 15.6.0 は `.textlintrc.json` の `overrides` を読まない．
  そのためパスごとの文体宣言はできない（`tomio2480/github-workflows#85`）．
- 漢字の連続は 6 字までを既定とする．崩すと別物を指す正式名称だけを
  `max-kanji-continuous-len` の `allow` へ足す．
- 原稿側で直せない誤検出は `.textlint-allowlist.yml` の `allow` で除外する．
  奥付の発行履歴（`YYYY年MM月DD日 第N版第N刷発行`）と表示数式（`$$` ブロック）を
  正規表現で除外している．字種そのものを話題にする鍵括弧も同様である．
  `docs/` の図表キャプション（`表 1. …` の形）も体言止めのまま通す．
  文体や表記ゆれの指摘を止める目的で使わない．
- 原稿側のキャプションは接頭辞を持たないため，allowlist では外せない．
  地の文と機械的に区別できないためである．キャプション段落だけを
  `textlint-disable` と `textlint-enable` のコメントで挟んで外す．
  `textlint-disable-next-line` は `textlint-filter-rule-comments` 1.3.0 では
  効かないため使わない．
- 句読点は「．」「，」で統一する．句点は `ja-no-mixed-period` が検出し，
  読点は `.prh-extra.yml` の規則が検出する．同ファイルは中央の表記ゆれ辞書を
  置き換えず加算するため，中央の更新へ追随できる（`tomio2480/github-workflows#91`）．
- `rules` は中央テンプレート（`tomio2480/github-workflows`）の写しである．
  中央を更新したときは追随させる．

## 📚 版管理と正誤表

書籍の版（初版・第 2 版ほか）と正誤情報を管理する仕組みを備える．
詳細な運用ルールは [版管理と正誤表運用](docs/spec/edition-errata.md) を参照．

- 版番号は `package.json` の semver の major と一致させる（`v1.x.x` が初版）．
- 出版のたびに `errata/errata.yml` の `editions` へ版を追記する．
  version と同じ名前のタグを push すると Release が作られ，
  それが版ごとの PDF アーカイブとなる．
- 正誤が見つかったら `errata/errata.yml` の `errata` へ追記する．
  公開正誤表サイトが定期収集して掲載する．
- `npm run check:errata` でスキーマと版整合を検査できる（ビルド時にも自動実行）．
- まえがき（`00-preface.md`）には `{{errata}}` マーカーで正誤表案内を必ず含める．
  欠落は `npm run check:preface` が警告する（ビルド時にも自動実行）．
- マーカーの前後は空行で囲む．見出しの直後でも空行が要る．
  VFM は空行を挟まない見出しを段落の一部として扱うため，囲まないと
  単独の段落にならず案内へ置き換わらない（PR #121 で確認）．

## 🔍 トラブルシューティング

### ビルドエラーが発生する

```bash
# キャッシュをクリアして再ビルド
npm run clean
npm run build
```

### 行番号が表示されない

HTML ファイルが残っている可能性がある．以下を実行する．

```bash
del src\chapters\*.html   # Windows
rm src/chapters/*.html    # macOS/Linux
npm run build
```

### 章番号が正しく表示されない

各章の frontmatter で `counter-set` が正しく設定されているか確認する．

### `検証失敗: ...` と表示されビルドが失敗する

`npm run build` の最終ステップ（`scripts/verify-build.mjs`）が，2 パス
ビルドの中断を検出した状態．表示されたメッセージが原因を示す．

```bash
# ルートに index.html が残っている／設定ファイルが未復元の場合
npm run clean
npm run build
```

`vivliostyle build` を単体で実行した後など，`npm run build` を経由せずに
ビルドした場合にも発生する．必ず `npm run build` を使うこと．

### `タグ付き PDF 生成に失敗しました: ...` と表示されビルドが失敗する

`npm run build` の最終ステップ（`scripts/tag-pdf.mjs`）が失敗した状態．
主な原因は次のとおり．

- Java 11 以上が導入されていない，または `PATH` から見えない．
  `java -version` で確認し，未導入なら [Adoptium](https://adoptium.net/)
  等から JDK を導入する．詳細は
  [アクセシビリティ（タグ付き PDF）](#-アクセシビリティタグ付き-pdf) を参照．
- `dist/book.pdf` が存在しない．`vivliostyle build` や
  `scripts/verify-build.mjs` が先に失敗していないか確認する．

### `検証失敗: 総ページ数が想定と異なります` と表示され紙入稿用ビルドが失敗する

`npm run build:print` が，実測から求めた想定ページ数と組み上がった PDF の
ページ数の食い違いを検出した状態．測定パスと本番パスで組版結果が変わると起きる．
`config/themes/techbook/print-measure.css` が測定パスで改丁を無効にできているか確認する．
テーマ CSS へ独自の改ページ指定を足していないかも見る．

`測定パスで読み取った原稿の数が…一致しません` と表示される場合は，
測定パスの目印を読み取れていない．余白 0 のページを追加した場合は，
`config/themes/techbook/print-measure.css` で当該ページの上余白を戻すこと．

### `…に透明効果が N 件残っています` と表示されビルドが失敗する

入稿データへ透明の指定が入った状態．透明を再現できない印刷所がある．
そのため `npm run build:print` と `npm run build:cover` が出力を検査する．
知らせには見つかった箇所の前後が並ぶ．発生源をたどって焼き直す．

- SVG に `opacity` や `fill-opacity` を足した場合は，重なりの結果の色を
  実測して不透明な `fill` へ書き換える．単純な計算では階調がずれる．
- テーマ CSS に `opacity`・`rgba()`・`color-mix()` を足した場合も同じである．
  焼いた色をリテラルで持たせる．
- `mix-blend-mode` を足した場合は，混ぜた結果の色を焼いて指定をやめる．
  不透明度を 1 のままにしても，混ぜる指定は透明の仕組みを使う．
- 枠アイコンの線画を変えた場合は次の見出しを参照する．

### `枠アイコンの焼き込みに N 件の食い違いがある` と表示される

`theme.css` の枠アイコンと，紙用に焼いた `print.css` の線画がずれた状態．
組版の前に止まるため，4 分かかるビルドを待たずに気づける．

- 線画の形を変えたときは，両方の `--*-icon` と `--*-icon-baked` を揃える．
  色以外の中身が 1 文字でも違うと検出される．
- 基調色（`--palette-primary` など）を差し替えたときは，焼いた色も焼き直す．
  知らせに計算値が出るが，これは目安である．
  実際に描いた結果を測り，その値で `print.css` を書き換える．
  検査は計算値から 2 階調までのずれを許す．

### `検証失敗: …が見当たりません` と表示され表紙のビルドが失敗する

`npm run build:cover` が，入稿データに必要な記載の欠落を検出した状態．
流し込みは値が無くても警告だけで進むため，書き出した PDF の中身を検査している．

- 表 1 で書名か著者名が見当たらない場合は，`config/book.yaml` の
  `title`・`author` を確認する．
- 表 4 で ISDN 番号が見当たらない場合は，バーコード画像を確認する．
  画像が無いと，番号が正しくても情報ブロックごと出力から消える．
  置き場所は `config/isdn.yaml` の `issued.barcode` が指す．

`塗り足しが…です` と表示される場合を説明する．
`config/themes/techbook/print.css` の `--bleed` と，組み上がった PDF が
食い違っている．表紙のページに独自の寸法指定を足していないか確認する．

## 📄 ライセンス

（プロジェクトに応じて設定）
