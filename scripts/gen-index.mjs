#!/usr/bin/env node
/**
 * 本文のアンカーから索引の骨組みを作り，標準出力へ出す．
 *
 * Issue #131: 索引へ載せる語の選定は執筆者の判断である．本文から機械で
 * 語を選ぶと，重要でない語まで並ぶ．一方，参照先の収集と区分の割り振りは
 * 機械で足りる．そこで骨組みだけを作り，取捨と最終の並びは執筆者へ残す．
 *
 * 原稿は書き換えない．出力を見て取捨し，索引の原稿へ貼る．
 * 要確認の項目（見出し語や読みが未指定のもの）は標準エラーへ挙げる．
 * 標準出力は貼り付けられる形のまま保つためである．
 *
 * 詳細は `docs/spec/index-page.md` を参照．
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  INDEX_CLASS,
  ANCHOR_ID_PREFIX,
  REFERENCE_CLASS,
  frontmatterClasses,
  htmlNameOf,
  scanMarkdown,
} from './check-index.mjs';

/** 英字で始まる見出し語の区分 */
export const GROUP_ALPHABET = '英字';

/** 数字で始まる見出し語の区分 */
export const GROUP_DIGIT = '数字';

/** 読みから区分を決められなかった見出し語の受け皿 */
export const GROUP_UNCLASSIFIED = '未分類';

/* 五十音の行．先頭の仮名を清音・大書きへ直してから引く */
const KANA_ROWS = [
  ['あ行', 'あいうえお'],
  ['か行', 'かきくけこ'],
  ['さ行', 'さしすせそ'],
  ['た行', 'たちつてと'],
  ['な行', 'なにぬねの'],
  ['は行', 'はひふへほ'],
  ['ま行', 'まみむめも'],
  ['や行', 'やゆよ'],
  ['ら行', 'らりるれろ'],
  ['わ行', 'わゐゑをん'],
];

/** 骨組みへ並べる区分の順．書籍ごとに変えてよい（原稿は執筆者が持つ） */
export const DEFAULT_GROUP_ORDER = [
  GROUP_ALPHABET,
  GROUP_DIGIT,
  ...KANA_ROWS.map(([name]) => name),
  GROUP_UNCLASSIFIED,
];

/* 濁点・半濁点・小書きを清音の大書きへ寄せる．行の判定にのみ使い，
   並べ替えには使わない．並べ替えでは濁点と小書きの符号位置が
   そのまま五十音順に並ぶためである */
const KANA_BASE = new Map(Object.entries({
  ぁ: 'あ', ぃ: 'い', ぅ: 'う', ぇ: 'え', ぉ: 'お',
  が: 'か', ぎ: 'き', ぐ: 'く', げ: 'け', ご: 'こ',
  ざ: 'さ', じ: 'し', ず: 'す', ぜ: 'せ', ぞ: 'そ',
  だ: 'た', ぢ: 'ち', づ: 'つ', で: 'て', ど: 'と', っ: 'つ',
  ば: 'は', び: 'ひ', ぶ: 'ふ', べ: 'へ', ぼ: 'ほ',
  ぱ: 'は', ぴ: 'ひ', ぷ: 'ふ', ぺ: 'へ', ぽ: 'ほ',
  ゃ: 'や', ゅ: 'ゆ', ょ: 'よ', ゎ: 'わ', ゔ: 'う',
}));

const KATAKANA_FIRST = 0x30a1;
const KATAKANA_LAST = 0x30f6;
const KANA_OFFSET = 0x60;
const HIRAGANA_FIRST = 0x3041;
const HIRAGANA_LAST = 0x3096;

const ALPHABET_PATTERN = /^[A-Za-zＡ-Ｚａ-ｚ]/;
const DIGIT_PATTERN = /^[0-9０-９]/;
const TRAILING_NUMBER_PATTERN = /-\d+$/;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/** 片仮名を平仮名へ寄せる．並べ替えの基準を 1 つに揃えるためである */
function toHiragana(text) {
  let result = '';
  for (const char of text) {
    const code = char.codePointAt(0);
    result += code >= KATAKANA_FIRST && code <= KATAKANA_LAST
      ? String.fromCodePoint(code - KANA_OFFSET)
      : char;
  }
  return result;
}

/** 行の判定に使う 1 字．仮名でなければ null を返す */
function rowKanaOf(yomi) {
  if (!isNonEmptyString(yomi)) {
    return null;
  }
  const head = toHiragana(yomi.trim())[0];
  const code = head.codePointAt(0);
  if (code < HIRAGANA_FIRST || code > HIRAGANA_LAST) {
    return null;
  }
  return KANA_BASE.get(head) ?? head;
}

/**
 * 見出し語が未指定のとき，アンカーの id から仮の見出し語を作る．
 * 接頭辞と末尾の連番を取り除く．取り除くと空になる id はそのまま返す．
 * @param {unknown} id アンカーの id
 * @returns {string}
 */
export function fallbackTerm(id) {
  if (typeof id !== 'string') {
    return '';
  }
  const stripped = id.startsWith(ANCHOR_ID_PREFIX)
    ? id.slice(ANCHOR_ID_PREFIX.length).replace(TRAILING_NUMBER_PATTERN, '')
    : id;
  return stripped === '' ? id : stripped;
}

/**
 * 見出し語と読みから区分を決める．
 * 英字・数字で始まる見出し語には読みを求めない．
 * 和文の語で読みが無い場合と，読みが仮名で始まらない場合は未分類とする．
 * @param {{term: string|null, yomi: string|null}} item
 * @returns {string}
 */
export function groupOf({ term, yomi }) {
  const head = isNonEmptyString(term) ? term.trim() : '';
  if (ALPHABET_PATTERN.test(head)) {
    return GROUP_ALPHABET;
  }
  if (DIGIT_PATTERN.test(head)) {
    return GROUP_DIGIT;
  }
  const kana = rowKanaOf(yomi);
  if (kana === null) {
    return GROUP_UNCLASSIFIED;
  }
  const row = KANA_ROWS.find(([, chars]) => chars.includes(kana));
  return row === undefined ? GROUP_UNCLASSIFIED : row[0];
}

/* 並べ替えの基準．英字は大文字と小文字を同じ扱いにし，和文は平仮名へ
   寄せた読みを使う．比較は符号位置で行う．照合順序の実装差で並びが
   変わると，同じ原稿から違う骨組みが出てしまうためである */
function sortKeyOf(item) {
  if (item.group === GROUP_ALPHABET || item.group === GROUP_DIGIT) {
    return item.term.toLowerCase();
  }
  return isNonEmptyString(item.yomi) ? toHiragana(item.yomi.trim()) : item.term;
}

function compareItems(a, b) {
  const left = sortKeyOf(a);
  const right = sortKeyOf(b);
  if (left !== right) {
    return left < right ? -1 : 1;
  }
  if (a.term !== b.term) {
    return a.term < b.term ? -1 : 1;
  }
  return 0;
}

/**
 * アンカーの並びを見出し語ごとにまとめ，区分へ振り分ける．
 * 同じ見出し語の参照は本文での出現順に並べる．
 * @param {{id: string, term: string|null, yomi: string|null, href: string}[]} anchors
 * @returns {{name: string, items: {term: string, yomi: string|null, hrefs: string[],
 *            provisionalTerm: boolean, missingYomi: boolean}[]}[]}
 */
export function buildIndexEntries(anchors) {
  const items = new Map();
  for (const anchor of Array.isArray(anchors) ? anchors : []) {
    const provisionalTerm = !isNonEmptyString(anchor.term);
    const term = provisionalTerm ? fallbackTerm(anchor.id) : anchor.term.trim();
    let item = items.get(term);
    if (item === undefined) {
      item = { term, yomi: null, hrefs: [], provisionalTerm };
      items.set(term, item);
    }
    if (item.yomi === null && isNonEmptyString(anchor.yomi)) {
      item.yomi = anchor.yomi.trim();
    }
    item.hrefs.push(anchor.href);
  }

  for (const item of items.values()) {
    item.group = groupOf(item);
    /* 未分類へ落ちる理由は読みだけである．執筆者が足すべき箇所を指す */
    item.missingYomi = item.group === GROUP_UNCLASSIFIED;
  }

  return DEFAULT_GROUP_ORDER
    .map((name) => ({
      name,
      items: [...items.values()].filter((item) => item.group === name).sort(compareItems),
    }))
    .filter((group) => group.items.length > 0);
}

/* 見出し語は執筆者が書いた文字列である．そのまま HTML へ置かない */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function noteFor(item) {
  const notes = [];
  if (item.provisionalTerm) {
    notes.push('見出し語が未指定．本文のアンカーへ data-index を足す');
  }
  if (item.missingYomi) {
    notes.push('読みから区分を決められない．本文のアンカーへ data-yomi を足す');
  }
  return notes;
}

/**
 * 区分ごとの一覧を索引の原稿へ貼れる形の HTML にする．
 * 空行を挟まず 1 つの HTML ブロックとして出す．
 * 空行で切ると Markdown の段落として読まれる箇所が生じるためである．
 * @param {{name: string, items: object[]}[]} groups
 * @returns {string}
 */
export function renderSkeleton(groups) {
  const lines = ['<div class="index-body">'];
  for (const group of groups) {
    lines.push(`<p class="index-group">${escapeHtml(group.name)}</p>`);
    lines.push('<ul class="index-list">');
    for (const item of group.items) {
      for (const note of noteFor(item)) {
        lines.push(`<!-- 要確認: ${note} -->`);
      }
      const pages = item.hrefs
        .map((href) => `<a class="${REFERENCE_CLASS}" href="${escapeHtml(href)}"></a>`)
        .join('');
      lines.push(`<li><span class="index-term">${escapeHtml(item.term)}</span>${pages}</li>`);
    }
    lines.push('</ul>');
  }
  lines.push('</div>');
  return `${lines.join('\n')}\n`;
}

/** vivliostyle.config.js の entry は文字列とオブジェクトの両方を取りうる */
function entryPath(entry) {
  if (typeof entry === 'string') {
    return entry;
  }
  return typeof entry?.path === 'string' ? entry.path : null;
}

/**
 * 本 1 冊分の原稿を読み，索引の骨組みを作る．
 * 索引の原稿そのものは走査しない．索引に並ぶ参照を拾ってしまうためである．
 * @param {object} params
 * @param {string} params.repoRoot リポジトリのルート
 * @param {unknown[]} params.entries vivliostyle.config.js の entry
 * @returns {Promise<{skeleton: string, warnings: string[], anchorCount: number,
 *                    termCount: number, indexEntry: string|null}>}
 */
export async function generateIndex({ repoRoot, entries }) {
  const warnings = [];
  const sources = new Map();

  for (const raw of Array.isArray(entries) ? entries : []) {
    const entry = entryPath(raw);
    if (entry === null || !/\.md$/i.test(entry)) {
      continue;
    }
    const filePath = path.join(repoRoot, entry);
    if (!fs.existsSync(filePath)) {
      warnings.push(`${entry}: entry に並んでいる原稿が見つからない`);
      continue;
    }
    sources.set(entry, fs.readFileSync(filePath, 'utf-8'));
  }

  const indexEntry = [...sources]
    .filter(([, content]) => frontmatterClasses(content).includes(INDEX_CLASS))
    .map(([entry]) => entry)[0] ?? null;

  const anchors = [];
  for (const [entry, content] of sources) {
    if (entry === indexEntry) {
      continue;
    }
    const scanned = await scanMarkdown(content);
    for (const anchor of scanned.anchors) {
      anchors.push({ ...anchor, href: `${htmlNameOf(entry)}#${anchor.id}` });
    }
  }

  const groups = buildIndexEntries(anchors);
  const termCount = groups.reduce((sum, group) => sum + group.items.length, 0);

  if (anchors.length === 0) {
    warnings.push(
      `本文にアンカーが 1 つも無い．索引へ載せる語の直前へ`
      + ` <a id="${ANCHOR_ID_PREFIX}..."> を置く（docs/spec/index-page.md 参照）`,
    );
  }
  for (const group of groups) {
    for (const item of group.items) {
      for (const note of noteFor(item)) {
        warnings.push(`要確認 ${item.term}: ${note}`);
      }
    }
  }

  return { skeleton: renderSkeleton(groups), warnings, anchorCount: anchors.length, termCount, indexEntry };
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const repoRoot = fileURLToPath(new URL('..', import.meta.url));
  const configUrl = pathToFileURL(path.join(repoRoot, 'vivliostyle.config.js'));
  const config = (await import(configUrl.href)).default;
  const result = await generateIndex({ repoRoot, entries: config.entry });

  process.stdout.write(result.skeleton);

  console.error(
    `\n見出し語 ${result.termCount} 件・参照 ${result.anchorCount} 件の骨組みを出した．`,
  );
  console.error('取捨と並べ替えのうえ，索引の原稿へ貼ること．');
  for (const message of result.warnings) {
    console.error(`  - ${message}`);
  }
}
