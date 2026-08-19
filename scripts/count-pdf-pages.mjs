#!/usr/bin/env node
/**
 * PDF のページ数を数えるユーティリティ
 *
 * 紙入稿用ビルド（scripts/build-print.mjs）が面付けの不足ページ数を求めるために使う。
 * 外部依存を増やさず、PDF のページオブジェクトを走査して数える。
 *
 * ページオブジェクトは、平文で現れることも圧縮されたオブジェクトストリーム
 * （/ObjStm）へ入ることもあり、1 つの PDF の中で混在もする。数え上げでは
 * 取りこぼしや二重計上が起きるため、ページツリーのルートが宣言する /Count を
 * 第一の根拠とする。ルートを読めない場合に限り、ページオブジェクトを数える。
 *
 * オブジェクトストリームは展開して走査するが、本文の内容ストリームは展開しない
 * （誌面に現れる文字列をページ定義と誤認しないため）。
 */

import fs from 'fs';
import zlib from 'zlib';

// PDF の空白は NUL・水平タブ・改行・改ページ・復帰・空白の 6 種である。
// JavaScript の \s は NUL を含まず、逆に PDF が空白としない文字を含む。
// キーの区切りを見る箇所はすべてこの定義から組み立てる
const PDF_WHITESPACE = '\\x00\\t\\n\\f\\r ';
const PDF_WHITESPACE_PATTERN = new RegExp(`[${PDF_WHITESPACE}]`);

// /Type /Page に続く文字が英字なら /Pages・/PageLabels などの別のオブジェクトである
const PAGE_OBJECT_PATTERN = new RegExp(`/Type[${PDF_WHITESPACE}]*/Page(?![a-zA-Z])`, 'g');
const PAGE_TREE_PATTERN = new RegExp(`/Type[${PDF_WHITESPACE}]*/Pages(?![a-zA-Z])`, 'g');

// 総ページ数の宣言。ストリームの長さは、直接の数値と間接参照（`9 0 R`）を見分ける
const PAGE_COUNT_PATTERN = new RegExp(`/Count[${PDF_WHITESPACE}]+(\\d+)`);
const STREAM_LENGTH_PATTERN = new RegExp(
  `/Length[${PDF_WHITESPACE}]+(\\d+)([${PDF_WHITESPACE}]+\\d+[${PDF_WHITESPACE}]+R)?`
);

// オブジェクトの見出し（`12 0 obj`）は obj キーワードで捉える。
// 数値まで含めて照合すると、`200 % 注記\n0 obj` のようにトークンの区切りへ
// コメントを書いた形を取り逃す。番号は走査に要らない。
// 圧縮データの中にも同じ並びが現れうるが、辞書に /ObjStm を持つものだけを
// 見るため実害は無い。endobj は語境界で外れる
const OBJECT_KEYWORD_PATTERN = /\bobj\b/g;
const OBJECT_KEYWORD_LENGTH = 'obj'.length;

// stream キーワードは辞書の直後（空白とコメントを挟んでよい）に置かれる。
// 続く改行はキーワードの一部であり、データはその次のバイトから始まる
const STREAM_KEYWORD_PATTERN = /^stream\r?\n/;
const STREAM_KEYWORD_LENGTH = 'stream\r\n'.length;

// ページツリーのルート（/Parent を持たないノード）が宣言する総ページ数を集める
function findRootPageCounts(text) {
  const counts = [];
  for (const match of text.matchAll(PAGE_TREE_PATTERN)) {
    const dictStart = text.lastIndexOf('<<', match.index);
    const dictEnd = text.indexOf('>>', match.index);
    if (dictStart === -1 || dictEnd === -1) continue;

    const dict = text.slice(dictStart, dictEnd);
    if (dict.includes('/Parent')) continue;

    const countMatch = dict.match(PAGE_COUNT_PATTERN);
    if (countMatch) counts.push(Number(countMatch[1]));
  }
  return counts;
}

// PDF は % から行末までをコメントとし、空白と同じ扱いで書ける
function skipWhitespaceAndComments(text, from) {
  let index = from;
  for (;;) {
    while (index < text.length && PDF_WHITESPACE_PATTERN.test(text[index])) index += 1;
    if (text[index] !== '%') return index;
    index = skipComment(text, index);
  }
}

// コメント（% から行末まで）の終わりを返す
function skipComment(text, from) {
  let index = from;
  while (index < text.length && text[index] !== '\n' && text[index] !== '\r') index += 1;
  return index;
}

// 文字列リテラル `( … )` の終わりを返す。括弧は入れ子にでき、\ で逃がせる
function skipLiteralString(text, from) {
  let depth = 0;
  for (let index = from; index < text.length; index += 1) {
    const character = text[index];
    if (character === '\\') {
      index += 1;
    } else if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return text.length;
}

// 16 進文字列 `< … >` の終わりを返す
function skipHexString(text, from) {
  const close = text.indexOf('>', from + 1);
  return close === -1 ? text.length : close + 1;
}

// 配列 `[ … ]` の終わりを返す。配列は入れ子にでき、中に辞書・コメント・文字列も
// 置ける。中身のキーを外側のキーと取り違えないよう、丸ごと読み飛ばすために使う
function skipArray(text, from) {
  let depth = 0;
  let index = from;

  while (index < text.length) {
    const character = text[index];
    const pair = text.slice(index, index + 2);
    if (pair === '<<' || pair === '>>') {
      /* 辞書の区切りは 2 文字で 1 つ。1 文字ずつ見ると `<<` の 2 文字目を
         16 進文字列の始まりと取り違える */
      index += 2;
    } else if (character === '%') {
      index = skipComment(text, index);
    } else if (character === '(') {
      index = skipLiteralString(text, index);
    } else if (character === '<') {
      index = skipHexString(text, index);
    } else if (character === '[') {
      depth += 1;
      index += 1;
    } else if (character === ']') {
      depth -= 1;
      index += 1;
      if (depth === 0) return index;
    } else {
      index += 1;
    }
  }
  return text.length;
}

// from の位置から辞書を読み、外側のキーだけを残した文字列と終端の位置を返す。
// `/DecodeParms << /Predictor 1 >>` のように値が辞書のキーがあり、その位置も
// 決まっていない。入れ子を数えないと外側の終わりを取り違え、入れ子を残すと
// /Length などのキーを内側から拾う。
// コメント・文字列リテラル・16 進文字列・配列は中身に << や >>、/Length といった
// 並びを書けるため、区切りともキーとも数えない。読み飛ばした跡へは空白を 1 つ置き、
// 前後のキーがつながらないようにする
function readDictionary(text, from) {
  if (text.slice(from, from + 2) !== '<<') return null;

  let depth = 0;
  let outer = '';
  let index = from;

  while (index < text.length) {
    const pair = text.slice(index, index + 2);
    if (pair === '<<') {
      depth += 1;
      index += 2;
      continue;
    }
    if (pair === '>>') {
      depth -= 1;
      index += 2;
      if (depth === 0) return { outer, end: index };
      continue;
    }

    const character = text[index];
    if (character === '%' || character === '(' || character === '<' || character === '[') {
      if (character === '%') index = skipComment(text, index);
      else if (character === '(') index = skipLiteralString(text, index);
      else if (character === '[') index = skipArray(text, index);
      else index = skipHexString(text, index);
      if (depth === 1) outer += ' ';
      continue;
    }

    if (depth === 1) outer += character;
    index += 1;
  }
  return null;
}

// ストリームの終わりは辞書の /Length で決める。endstream を探して直前の改行を
// 落とす方法は、圧縮データの最後のバイトが CR（0x0d）のとき CRLF と読み違え、
// データを 1 バイト余分に削って展開に失敗する（Issue #145）。
// /Length が間接参照（`12 0 R`）の場合はその場で値を引けないため endstream に頼る
function resolveStreamEnds(text, dict, dataStart) {
  const lengthMatch = dict.match(STREAM_LENGTH_PATTERN);
  if (lengthMatch && !lengthMatch[2]) {
    return [dataStart + Number(lengthMatch[1])];
  }

  /* 間接参照ではデータの終わりを断定できない。endstream の直前が区切りの改行か
     データの一部かを見分けられないため、確からしい順に候補を返す */
  const keywordAt = text.indexOf('endstream', dataStart);
  if (keywordAt === -1) return [];

  const candidates = [];
  if (text.slice(keywordAt - 2, keywordAt) === '\r\n') candidates.push(keywordAt - 2);
  if (text[keywordAt - 1] === '\n' || text[keywordAt - 1] === '\r') candidates.push(keywordAt - 1);
  candidates.push(keywordAt);
  return candidates;
}

// オブジェクトストリーム（/ObjStm）を展開し、走査できる平文として返す。
// latin1 では 1 文字が 1 バイトに対応するため、文字位置をそのままバイト位置に使える。
// 走査は obj キーワードを起点にする。stream の直前にある `<<` を探す方法では、
// 圧縮データの中に現れる同じ並びを本物の辞書と取り違える。
// キーワードは辞書の中の文字列や圧縮データにも現れるため、その位置で
// オブジェクトを区切らず、キーワードごとに辞書として読めるかで判定する
function decodeObjectStreams(text, buffer) {
  const decoded = [];
  /* 同じストリームへ複数の起点からたどり着くことがある。見出しの後ろの
     コメントが obj で終わる形が例であり、二重に数えないようデータの位置で覚える */
  const seen = new Set();

  for (const keyword of text.matchAll(OBJECT_KEYWORD_PATTERN)) {
    const dictStart = skipWhitespaceAndComments(text, keyword.index + OBJECT_KEYWORD_LENGTH);
    const dictionary = readDictionary(text, dictStart);
    if (dictionary === null || !dictionary.outer.includes('/ObjStm')) continue;

    const keywordAt = skipWhitespaceAndComments(text, dictionary.end);
    const streamMatch = STREAM_KEYWORD_PATTERN.exec(
      text.slice(keywordAt, keywordAt + STREAM_KEYWORD_LENGTH)
    );
    if (streamMatch === null) continue;

    const dataStart = keywordAt + streamMatch[0].length;
    if (seen.has(dataStart)) continue;
    seen.add(dataStart);

    for (const dataEnd of resolveStreamEnds(text, dictionary.outer, dataStart)) {
      if (dataEnd <= dataStart) continue;
      try {
        decoded.push(zlib.inflateSync(buffer.subarray(dataStart, dataEnd)).toString('latin1'));
        break;
      } catch {
        /* 終わりの候補が外れたか、対応していない符号化である。次の候補を試す */
      }
    }
  }

  return decoded.join('\n');
}

export function countPdfPages(buffer) {
  // PDF はバイト列であり、テキストとして扱うにはバイト値を保つ latin1 が要る
  const raw = buffer.toString('latin1');
  const decoded = decodeObjectStreams(raw, buffer);

  // ページツリーのルートが宣言する総ページ数を第一の根拠とする。
  // ページオブジェクトは平文と圧縮側に混在しうるため、数え上げより確かである
  const rootCounts = new Set([...findRootPageCounts(raw), ...findRootPageCounts(decoded)]);
  if (rootCounts.size === 1) {
    return [...rootCounts][0];
  }
  if (rootCounts.size > 1) {
    throw new Error(
      `PDF のページツリーが複数の総ページ数を宣言しています（${[...rootCounts].join('・')}）。`
    );
  }

  // ルートを読めない PDF ではページオブジェクトを数える。
  // 平文と圧縮側を足すと写しを二重に数えるため、見つかった方だけを見る
  const pageObjectCount =
    (raw.match(PAGE_OBJECT_PATTERN) ?? []).length ||
    (decoded.match(PAGE_OBJECT_PATTERN) ?? []).length;

  if (pageObjectCount === 0) {
    throw new Error('PDF のページ数を読み取れませんでした。想定していない形式の可能性があります。');
  }

  return pageObjectCount;
}

export function countPdfPagesFile(pdfPath) {
  return countPdfPages(fs.readFileSync(pdfPath));
}
