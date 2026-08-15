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

/* タグの除去は単発の置換では不十分である（残った断片が結合して新たなタグを
   再構成しうる）。同じ問題へ対処済みの実装を再利用する */
import { stripHtmlTags } from './add-line-numbers.mjs';

/* 測定ビルドで各原稿の 1 ページ目へ出す目印。誌面の文章と衝突しない綴りにする */
export const DOC_START_MARKER = 'DOCSTARTMARK';
/* 測定ビルドのページ区切り。opendataloader-pdf の --text-page-separator へ渡す */
export const PAGE_SEPARATOR = '@@@PAGE %page-number%';
const PAGE_SEPARATOR_PATTERN = /^@@@PAGE (\d+)$/;

/* MEMO ページの原稿。src/chapters/ へ書き出し、ビルド後に削除する。
   後始末は連番の HTML だけを対象とし、利用者が置いたファイルを巻き込まない */
export const MEMO_FILE_PREFIX = 'print-memo-';
export const MEMO_FILE_PATTERN = /^print-memo-\d+\.html$/;
const MEMO_ENTRY_DIR = 'src/chapters/';

/* 区分の開始面を生成 HTML へ伝えるクラス。面の指定は config/book.yaml を
   単一の出所とし、テーマ CSS 側へ区分の一覧を持たせない */
export const SIDE_CLASS_PREFIX = 'print-side-';

/* 小口のつめ。章ごとの位置は生成した CSS が持ち、原稿側はクラスで章を示す */
export const TAB_CLASS_PREFIX = 'print-tab-';
export const TAB_STYLESHEET_FILE = 'print-tabs.generated.css';

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
/* 面付けの調整ページを寄せる先。既定では奥付の直前へまとめる */
const DEFAULT_FILLER_BEFORE = '99-colophon';
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

/* 面付けの調整ページを寄せる先（原稿ファイル名に含まれる文字列）を読む。
   空文字を指定すると寄せ先を持たず、すべて裏表紙の直前へ入れる */
export function resolveFillerBefore(bookYaml) {
  const configured = bookYaml?.print?.filler_before;
  if (configured === undefined || configured === null) return DEFAULT_FILLER_BEFORE;
  if (typeof configured !== 'string') {
    throw new Error('config/book.yaml の print.filler_before は文字列で指定してください。');
  }
  return configured;
}

/* 章かどうかは扉（chapter-opening）の有無で判定する。
   ファイル名に依存させず、原稿を改名しても判定が壊れないようにする */
export function hasChapterOpening(source) {
  return source.includes('chapter-opening');
}

/* 1 つのエントリを開始すべき面を返す。指定が無い区分では null を返す */
export function sideForEntry(entry, source, sides) {
  const matched = sides.patterns.find(([pattern]) => entry.includes(pattern));
  if (matched) return matched[1];
  if (hasChapterOpening(source)) return sides.chapterSide;
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
 * 面付けの調整ページは fillerBefore が指す区分（既定では奥付）の直前へ寄せる。
 * その区分に面の指定があるときは，面を保つために入れられるのは偶数ページ分に
 * 限られる。端数の 1 ページは裏表紙の直前（奥付の後ろ）へ残す。
 *
 * @param {object} params
 * @param {string[]} params.entries      ビルド対象のエントリ（電子書籍用と同じ並び）
 * @param {number[]} params.pageCounts   各エントリの素のページ数（測定ビルドの実測値）
 * @param {string[]} params.sources      各エントリの原稿内容（章扉の有無の判定に使う）
 * @param {object}   params.sides        resolveSectionSides の戻り値
 * @param {number}   params.pageMultiple 綴じの単位
 * @param {string}   params.fillerBefore 調整ページを寄せる先（省略時は奥付）
 * @returns {{entry: string[], memoDocuments: object[], totalPages: number}}
 */
export function planPrintLayout({
  entries,
  pageCounts,
  sources,
  sides,
  pageMultiple,
  fillerBefore = DEFAULT_FILLER_BEFORE,
}) {
  if (entries.length !== pageCounts.length || entries.length !== sources.length) {
    throw new Error('エントリ・ページ数・原稿内容の件数が一致しません。');
  }

  /* MEMO ページは印（{ memoPages }）として並べ，最後にページ順で番号を振る */
  const entry = [];
  let pageNumber = 1;
  let fillerAnchor = null;

  entries.forEach((current, index) => {
    const side = sideForEntry(current, sources[index], sides);
    const aligning = side ? pagesToAlign(pageNumber, side) : 0;

    if (aligning > 0) {
      entry.push({ memoPages: aligning });
      pageNumber += aligning;
    }

    if (fillerBefore && current.includes(fillerBefore)) {
      fillerAnchor = { index: entry.length, hasSide: side !== null };
    }

    entry.push(current);
    pageNumber += pageCounts[index];
  });

  const contentPages = pageNumber - 1;
  const fillerPages = calcFillerPages(contentPages, pageMultiple);

  if (fillerPages > 0) {
    /* 寄せ先に面の指定があるときは，その面を崩さない偶数ページ分だけを前へ入れる */
    const anchored = fillerAnchor
      ? fillerAnchor.hasSide
        ? fillerPages - (fillerPages % 2)
        : fillerPages
      : 0;
    const trailing = fillerPages - anchored;

    /* 端数は裏表紙の直前へ入れ，裏表紙を最終ページに保つ */
    const backCoverIndex = entry.findIndex(
      item => typeof item === 'string' && /back-cover\.(md|html)$/.test(item)
    );
    const insertions = [
      { at: backCoverIndex === -1 ? entry.length : backCoverIndex, pages: trailing },
      { at: fillerAnchor ? fillerAnchor.index : 0, pages: anchored },
    ].filter(insertion => insertion.pages > 0);

    /* 後ろから入れる。先に前へ入れると後ろの挿入位置がずれる */
    for (const insertion of insertions.sort((a, b) => b.at - a.at)) {
      entry.splice(insertion.at, 0, { memoPages: insertion.pages });
    }
  }

  const memoDocuments = [];
  const finalEntry = entry.map(item => {
    if (typeof item === 'string') return item;
    const memo = memoDocument(memoDocuments.length + 1, item.memoPages);
    memoDocuments.push(memo);
    return memo.entry;
  });

  return { entry: finalEntry, memoDocuments, totalPages: contentPages + fillerPages };
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

export function tabClassName(chapterNumber) {
  assertPositiveInteger(chapterNumber, 'つめの章番号');
  return `${TAB_CLASS_PREFIX}${chapterNumber}`;
}

export function sideClassName(side) {
  assertSide(side, '区分の開始面');
  return `${SIDE_CLASS_PREFIX}${side}`;
}

/* 生成 HTML の html 要素へクラスを足す。
   つめの位置を決める変数（--tab-offset）は html 要素で解決され、
   ページ余白の外側（@page）から参照できる。
   区分の開始面（print-side-*）も同じ場所へ置く */
export function injectHtmlClass(html, className) {
  const openingTag = html.match(/<html\b[^>]*>/i);
  if (!openingTag) {
    throw new Error('生成 HTML に html 要素が見つかりません。');
  }

  const tag = openingTag[0];
  const replaced = /\sclass\s*=\s*"[^"]*"/i.test(tag)
    ? tag.replace(/(\sclass\s*=\s*")([^"]*)(")/i, `$1$2 ${className}$3`)
    : tag.replace(/<html\b/i, `<html class="${className}"`);

  return html.replace(tag, replaced);
}

/* 生成 HTML から、章の扉に書かれた章番号と章タイトルを取り出す。
   番号・タイトルとも扉の記述（.chapter-number・.chapter-title）を出所とし、
   つめと扉で表示が食い違わないようにする */
function textOfClass(html, className) {
  const pattern = new RegExp(
    `<([a-z][a-z0-9]*)\\b[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>([\\s\\S]*?)</\\1>`,
    'i'
  );
  const matched = html.match(pattern);
  return matched ? stripHtmlTags(matched[2]).trim() : '';
}

export function extractChapterLabel(html) {
  const heading = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  return {
    number: textOfClass(html, 'chapter-number'),
    title: textOfClass(html, 'chapter-title') || (heading ? stripHtmlTags(heading[1]).trim() : ''),
  };
}

/* つめの中身を組み立てる。体裁は print.css が持つ。
   章番号が数字のときだけ「第」「章」を添える（付録の A などには添えない）。
   読み上げ対象からは外す。扉と同じ内容が重複して読まれるためである */
export function renderTabMark({ number, title }) {
  if (!number && !title) return '';

  const numbered = /^\d+$/.test(number) ? ' is-numbered' : '';
  const numberSpan = number
    ? `<span class="print-tab-mark-number${numbered}">${number}</span>`
    : '';
  const titleSpan = title ? `<span class="print-tab-mark-title">${title}</span>` : '';

  return `<aside class="print-tab-mark" aria-hidden="true">${numberSpan}${titleSpan}</aside>`;
}

/* つめの中身を body の先頭へ入れる。print.css の position: running() で
   流し込みから外れるため、組版結果（ページ数）は変わらない */
export function injectTabMark(html, markup) {
  if (!markup) return html;

  const bodyTag = html.match(/<body\b[^>]*>/i);
  if (!bodyTag) {
    throw new Error('生成 HTML に body 要素が見つかりません。');
  }
  return html.replace(bodyTag[0], `${bodyTag[0]}\n${markup}`);
}

/* 章ごとのつめの位置を定める CSS を組み立てる。
   つめは版面の上下いっぱいへ均等に散らす。位置の基準・大きさ・色は
   print.css の変数が持ち，ここでは章の順序に応じた割合だけを与える */
export function renderTabStylesheet(chapterCount) {
  const rules = Array.from({ length: chapterCount }, (_, index) => {
    /* 章が 1 つだけのときは範囲の中央へ置く */
    const numerator = chapterCount === 1 ? 1 : index;
    const denominator = chapterCount === 1 ? 2 : chapterCount - 1;
    return (
      `html.${tabClassName(index + 1)} {\n` +
      `  --tab-offset: calc(var(--tab-area-top) + ` +
      `(var(--tab-area-height) - var(--tab-height)) * ${numerator} / ${denominator});\n` +
      `}`
    );
  });

  return `@charset "UTF-8";

/* 小口のつめの位置（章ごと）
 *
 * このファイルは npm run build:print が生成する．直接編集しない．
 * つめの大きさ・色・並べる範囲は print.css の変数で調整する．
 */
${rules.join('\n')}${rules.length > 0 ? '\n' : ''}`;
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
