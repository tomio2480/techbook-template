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

/* 章の扉を表すクラス。章の判定と、つめの置き場所の判定に使う */
export const CHAPTER_OPENING_CLASS = 'chapter-opening';

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

/* 原稿ファイル名に含まれる文字列をキーに持つ指定を、キーと値の組の一覧として読む。
   空のキーは entry.includes('') が全エントリに一致するため弾く。
   配列を渡した場合も添字がキーになり（"0" が 00-preface へ一致する）意図から外れる */
function patternEntries(configured, label) {
  if (typeof configured !== 'object' || configured === null || Array.isArray(configured)) {
    throw new Error(`config/book.yaml の ${label} はキーと値の組で指定してください。`);
  }
  const patterns = Object.entries(configured);
  for (const [pattern] of patterns) {
    if (pattern.trim() === '') {
      throw new Error(`config/book.yaml の ${label} のキーは空でない文字列で指定してください。`);
    }
  }
  return patterns;
}

/* 区分ごとの開始面を config/book.yaml から読む。
   section_start のキーは原稿ファイル名に含まれる文字列であり、前から順に照合する */
export function resolveSectionSides(bookYaml) {
  const configured = bookYaml?.print?.section_start;
  const patterns = patternEntries(configured ?? DEFAULT_SECTION_START, 'print.section_start');
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
  return source.includes(CHAPTER_OPENING_CLASS);
}

/* 章扉を持たない区分（付録など）にもつめを付けたいときの指定を読む。
   print.section_tabs のキーは原稿ファイル名に含まれる文字列，値はつめへ刷る
   番号の文字（付録の X など）。タイトルは原稿の h1 から取る */
export function resolveSectionTabs(bookYaml) {
  const configured = bookYaml?.print?.section_tabs;
  if (configured === undefined || configured === null) return [];
  const patterns = patternEntries(configured, 'print.section_tabs');
  for (const [pattern, number] of patterns) {
    if (typeof number !== 'string' || number.trim() === '') {
      throw new Error(
        `config/book.yaml の print.section_tabs["${pattern}"] は空でない文字列で指定してください。`
      );
    }
  }
  return patterns;
}

/* section_tabs で指定されたつめの番号を返す。指定が無い区分では null を返す。
   照合は section_start と同じく前から順に行う */
export function tabNumberForEntry(entry, sectionTabs) {
  const matched = sectionTabs.find(([pattern]) => entry.includes(pattern));
  return matched ? matched[1] : null;
}

/* つめを付ける区分かどうか。
   章扉を持つ原稿に加え，section_tabs の指定がある原稿を対象にする */
export function isTabTarget(entry, source, sectionTabs = []) {
  return hasChapterOpening(source) || tabNumberForEntry(entry, sectionTabs) !== null;
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
   区分の開始面（print-side-*）も同じ場所へ置く。
   同じクラスが既にあれば足さない。目次のように書き換えの残る原稿へ
   繰り返し当てても、クラスが増え続けないようにするためである */
export function injectHtmlClass(html, className) {
  const openingTag = html.match(/<html\b[^>]*>/i);
  if (!openingTag) {
    throw new Error('生成 HTML に html 要素が見つかりません。');
  }

  const tag = openingTag[0];
  const current = tag.match(/\sclass\s*=\s*"([^"]*)"/i);
  if (current && current[1].split(/\s+/).includes(className)) {
    return html;
  }

  const replaced = /\sclass\s*=\s*"[^"]*"/i.test(tag)
    ? tag.replace(/(\sclass\s*=\s*")([^"]*)(")/i, `$1$2 ${className}$3`)
    : tag.replace(/<html\b/i, `<html class="${className}"`);

  return html.replace(tag, replaced);
}

/* 生成 HTML から、章の扉に書かれた章番号と章タイトルを取り出す。
   番号・タイトルとも扉の記述（.chapter-number・.chapter-title）を出所とし、
   つめと扉で表示が食い違わないようにする */
/* 条件に合う最初の要素の中身を返す。無ければ空文字を返す。
   走査は htmlTags に任せ、コメントと raw text の中は読み飛ばす。
   正規表現で直接拾うと、原稿へ残した書き換え前の見出しのように、
   コメントの中のタグを実在の要素と取り違える */
function firstElementText(html, matches) {
  let opening = null;
  for (const tag of htmlTags(html)) {
    if (!opening) {
      if (!tag.closing && matches(tag)) opening = tag;
      continue;
    }
    if (tag.closing && tag.name === opening.name) {
      const from = opening.start + opening.text.length;
      return stripHtmlTags(html.slice(from, tag.start)).trim();
    }
  }
  return '';
}

function textOfClass(html, className) {
  const pattern = new RegExp(`class="[^"]*\\b${className}\\b[^"]*"`, 'i');
  return firstElementText(html, tag => pattern.test(tag.text));
}

export function extractChapterLabel(html) {
  return {
    number: textOfClass(html, 'chapter-number'),
    title: textOfClass(html, 'chapter-title') || firstElementText(html, tag => tag.name === 'h1'),
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

/* 中身をタグとして読まない要素。閉じタグまで読み飛ばす */
const RAW_TEXT_ELEMENTS = new Set(['script', 'style', 'textarea', 'title']);

/* タグの終わり（> の位置）を返す。引用符の中の > は終わりと見なさない。
   HTML は属性値の中へ > を書け、VFM もそれをそのまま出力するためである */
function tagEnd(html, from) {
  let index = from;
  let quote = '';
  while (index < html.length) {
    const char = html[index];
    if (quote) {
      if (char === quote) quote = '';
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '>') {
      break;
    }
    index += 1;
  }
  return index;
}

/* 名前の付いた閉じタグが始まる位置を返す。無ければ末尾を返す */
function closeTagStart(html, name, from) {
  const pattern = new RegExp(`</${name}\\b`, 'gi');
  pattern.lastIndex = from;
  const found = pattern.exec(html);
  return found ? found.index : html.length;
}

/* 開始タグと終了タグを前から順に取り出す。
   コメントと raw text（script・style など）の中は読み飛ばす。
   原稿の HTML コメントは生成 HTML へそのまま残るため、中のタグらしき文字列を
   実在の要素と見なすと、扉を取り違えてつめが黙って消える */
function* htmlTags(html) {
  const namePattern = /<!--|<(\/?)([a-z][a-z0-9]*)\b/gi;
  let name;
  while ((name = namePattern.exec(html)) !== null) {
    if (name[0] === '<!--') {
      const commentEnd = html.indexOf('-->', namePattern.lastIndex);
      namePattern.lastIndex = commentEnd === -1 ? html.length : commentEnd + 3;
      continue;
    }

    const closing = name[1] === '/';
    const tagName = name[2].toLowerCase();
    const end = tagEnd(html, namePattern.lastIndex);
    yield {
      closing,
      name: tagName,
      start: name.index,
      text: html.slice(name.index, end + 1),
    };

    namePattern.lastIndex =
      !closing && RAW_TEXT_ELEMENTS.has(tagName)
        ? closeTagStart(html, tagName, end + 1)
        : end + 1;
  }
}

/* タグに付いたクラスを返す。値は引用符あり（" と '）と引用符なしを受け取る。
   HTML はどれも妥当な書き方であり、取りこぼすと扉を見失うためである */
function classNames(tag) {
  const attribute = tag.text.match(/\sclass\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i);
  if (!attribute) return [];
  return (attribute[1] ?? attribute[2] ?? attribute[3] ?? '').trim().split(/\s+/);
}

/* 章の扉（.chapter-opening）の閉じタグが始まる位置を返す。扉が無ければ -1 を返す。
   クラスは空白で区切ってから突き合わせ、chapter-opening-note のように
   前方一致するだけの別クラスを扉と見なさない。
   閉じタグは同じ名前のタグを数えて求め、入れ子があっても取り違えない */
function chapterOpeningCloseStart(html) {
  let openingName = '';
  let depth = 0;
  for (const tag of htmlTags(html)) {
    if (!openingName) {
      if (!tag.closing && classNames(tag).includes(CHAPTER_OPENING_CLASS)) {
        openingName = tag.name;
        depth = 1;
      }
      continue;
    }
    if (tag.name !== openingName) continue;
    depth += tag.closing ? -1 : 1;
    if (depth === 0) return tag.start;
  }

  if (openingName) {
    throw new Error('章の扉（.chapter-opening）の閉じタグが見つかりません。');
  }
  return -1;
}

/* つめの中身を入れる。print.css の position: running() で流し込みから外れるため、
   組版結果（ページ数）は変わらない。
   置き場所は章の扉の中の末尾とする。扉より前に置くと、扉のページが body から
   始まった扱いになり、扉が名乗る page: chapter-opening が効かなくなる。
   扉にもつめが刷られ、扉で消しているはずの柱・ノンブルまで出る。
   扉の外（直後）へ置くと今度は扉と本文が隣り合わなくなり、
   theme.css の .chapter-opening.no-repeat-heading + section.level1 > h1 が
   外れて、隠しているはずの章タイトル帯が戻る。中へ入れれば両方を満たす。
   扉を持たない原稿（付録など）では body の先頭へ入れ、1 ページ目から出す */
export function injectTabMark(html, markup) {
  if (!markup) return html;

  const closeStart = chapterOpeningCloseStart(html);
  if (closeStart >= 0) {
    return `${html.slice(0, closeStart)}${markup}\n${html.slice(closeStart)}`;
  }

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
