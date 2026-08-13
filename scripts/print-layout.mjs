#!/usr/bin/env node
/**
 * 紙入稿用 PDF の面付けを組み立てる純粋関数群
 *
 * 扱うのは次の 2 つである。
 * (a) 改丁: 区分（まえがき・目次・章など）を指定した面から始める。
 * (b) 面付け: 総ページ数を綴じの単位（既定 4 ページ）の倍数へ揃える。
 *
 * 改丁で生じるページは白紙にせず、MEMO ページ（見出しと枠を持つ実体のある
 * ページ）で埋める。Vivliostyle は改ページで生じた白ページへ何も描画せず、
 * CSS の @page :blank も効かないため、白紙を後から飾ることはできない。
 * そこで各原稿のページ数を実測し、必要な位置へ MEMO ページを差し込む。
 *
 * 要求・要件は docs/spec/print-layout.md を参照。
 */

/* 測定ビルドで各原稿の 1 ページ目へ出す目印。誌面の文章と衝突しない綴りにする */
export const DOC_START_MARKER = 'DOCSTARTMARK';
/* 測定ビルドのページ区切り。opendataloader-pdf の --text-page-separator へ渡す */
export const PAGE_SEPARATOR = '@@@PAGE %page-number%';
const PAGE_SEPARATOR_PATTERN = /^@@@PAGE (\d+)$/;

/* MEMO ページの原稿。src/chapters/ へ書き出し、ビルド後に削除する */
export const MEMO_FILE_PREFIX = 'print-memo-';
const MEMO_ENTRY_DIR = 'src/chapters/';

/* 既定の綴じ単位。用紙 1 枚の表裏 2 面で 4 ページになる */
const DEFAULT_PAGE_MULTIPLE = 4;
/* 既定の改丁指定。印刷会社の指定に応じて config/book.yaml で上書きする */
const DEFAULT_SECTION_START = {
  '00-preface': 'recto',
  toc: 'verso',
  '98-afterword': 'recto',
  '99-colophon': 'verso',
};
const DEFAULT_CHAPTER_START = 'recto';
const SIDES = ['recto', 'verso'];

function assertPositiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label}は 1 以上の整数で指定してください（現在 ${value}）。`);
  }
}

function assertSide(value, label) {
  if (!SIDES.includes(value)) {
    throw new Error(`${label}は recto または verso で指定してください（現在 ${value}）。`);
  }
}

/* 総ページ数 pageCount を multiple の倍数へ揃えるために足りないページ数 */
export function calcFillerPages(pageCount, multiple) {
  assertPositiveInteger(multiple, '面付けの倍数');
  return (multiple - (pageCount % multiple)) % multiple;
}

export function resolvePageMultiple(bookYaml) {
  const configured = bookYaml?.print?.page_multiple;
  if (configured === undefined || configured === null) return DEFAULT_PAGE_MULTIPLE;
  assertPositiveInteger(configured, 'config/book.yaml の print.page_multiple');
  return configured;
}

/* 区分ごとの開始面を config/book.yaml から読む。
   section_start のキーは原稿ファイル名に含まれる文字列であり、前から順に照合する */
export function resolveSectionSides(bookYaml) {
  const configured = bookYaml?.print?.section_start;
  const patterns = Object.entries(configured ?? DEFAULT_SECTION_START);
  for (const [pattern, side] of patterns) {
    assertSide(side, `config/book.yaml の print.section_start["${pattern}"]`);
  }

  const chapterSide = bookYaml?.print?.chapter_start ?? DEFAULT_CHAPTER_START;
  assertSide(chapterSide, 'config/book.yaml の print.chapter_start');

  return { patterns, chapterSide };
}

/* 1 つのエントリを開始すべき面を返す。指定が無い区分では null を返す。
   章の判定はファイル名ではなく扉（chapter-opening）の有無で行う。
   原稿を改名しても判定が壊れないようにするためである */
export function sideForEntry(entry, source, sides) {
  const matched = sides.patterns.find(([pattern]) => entry.includes(pattern));
  if (matched) return matched[1];
  if (source.includes('chapter-opening')) return sides.chapterSide;
  return null;
}

/* 面（recto: 奇数ページ／verso: 偶数ページ）へ合わせるために挟むページ数 */
function pagesToAlign(pageNumber, side) {
  const isRecto = pageNumber % 2 === 1;
  return (side === 'recto') === isRecto ? 0 : 1;
}

function memoDocument(index, pages) {
  const fileName = `${MEMO_FILE_PREFIX}${index}.html`;
  return { fileName, entry: `${MEMO_ENTRY_DIR}${fileName}`, pages };
}

/**
 * 改丁と面付けを満たすエントリ構成を組み立てる。
 *
 * @param {object} params
 * @param {string[]} params.entries      ビルド対象のエントリ（電子書籍用と同じ並び）
 * @param {number[]} params.pageCounts   各エントリの素のページ数（測定ビルドの実測値）
 * @param {string[]} params.sources      各エントリの原稿内容（章扉の有無の判定に使う）
 * @param {object}   params.sides        resolveSectionSides の戻り値
 * @param {number}   params.pageMultiple 綴じの単位
 * @returns {{entry: string[], memoDocuments: object[], totalPages: number}}
 */
export function planPrintLayout({ entries, pageCounts, sources, sides, pageMultiple }) {
  if (entries.length !== pageCounts.length || entries.length !== sources.length) {
    throw new Error('エントリ・ページ数・原稿内容の件数が一致しません。');
  }

  const entry = [];
  const memoDocuments = [];
  let pageNumber = 1;

  entries.forEach((current, index) => {
    const side = sideForEntry(current, sources[index], sides);
    const aligning = side ? pagesToAlign(pageNumber, side) : 0;

    if (aligning > 0) {
      const memo = memoDocument(memoDocuments.length + 1, aligning);
      memoDocuments.push(memo);
      entry.push(memo.entry);
      pageNumber += aligning;
    }

    entry.push(current);
    pageNumber += pageCounts[index];
  });

  const contentPages = pageNumber - 1;
  const fillerPages = calcFillerPages(contentPages, pageMultiple);

  if (fillerPages > 0) {
    /* 調整ページは裏表紙の直前へ入れ、裏表紙を最終ページに保つ */
    const memo = memoDocument(memoDocuments.length + 1, fillerPages);
    memoDocuments.push(memo);
    const backCoverIndex = entry.findIndex(item => /back-cover\.(md|html)$/.test(item));
    entry.splice(backCoverIndex === -1 ? entry.length : backCoverIndex, 0, memo.entry);
  }

  return { entry, memoDocuments, totalPages: contentPages + fillerPages };
}

/* MEMO ページの原稿を組み立てる。体裁（見出しと枠）は print.css が持ち、
   ここでは改ページの単位となる空のブロックだけを並べる */
export function renderMemoHtml(pageCount) {
  assertPositiveInteger(pageCount, 'MEMO ページの枚数');

  const pages = Array.from(
    { length: pageCount },
    () => '    <div class="memo-page"></div>'
  ).join('\n');

  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <title>MEMO</title>
    <link rel="stylesheet" type="text/css" href="../../config/themes/techbook/theme.css">
  </head>
  <body class="memo-pages">
${pages}
  </body>
</html>
`;
}

/* 測定ビルドの抽出結果から、各原稿が始まるページ番号を拾う。
   目印は @page :nth(1) の余白ボックスで各原稿の 1 ページ目にだけ出る */
export function parseDocumentStartPages(extractedText, marker = DOC_START_MARKER) {
  const startPages = [];
  let currentPage = null;

  for (const line of extractedText.split(/\r?\n/)) {
    const separator = line.trim().match(PAGE_SEPARATOR_PATTERN);
    if (separator) {
      currentPage = Number(separator[1]);
      continue;
    }
    if (currentPage !== null && line.includes(marker) && !startPages.includes(currentPage)) {
      startPages.push(currentPage);
    }
  }

  return startPages;
}

/* 各原稿が始まるページ番号と総ページ数から、原稿ごとのページ数を求める */
export function toDocumentPageCounts(startPages, totalPages) {
  if (startPages.length === 0) {
    throw new Error('測定ビルドから原稿の区切りを読み取れませんでした。');
  }
  if (startPages[0] !== 1) {
    throw new Error(`測定ビルドの 1 ページ目が原稿の先頭ではありません（先頭 ${startPages[0]} ページ目）。`);
  }

  return startPages.map((start, index) => {
    const next = index + 1 < startPages.length ? startPages[index + 1] : totalPages + 1;
    const count = next - start;
    if (count < 1) {
      throw new Error(`測定ビルドのページ数が不正です（${start} ページ目の原稿）。`);
    }
    return count;
  });
}
