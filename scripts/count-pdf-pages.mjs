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

// /Type /Page に続く文字が英字なら /Pages・/PageLabels などの別のオブジェクトである
const PAGE_OBJECT_PATTERN = /\/Type\s*\/Page(?![a-zA-Z])/g;
const PAGE_TREE_PATTERN = /\/Type\s*\/Pages(?![a-zA-Z])/g;

// オブジェクトの見出し（`12 0 obj`）。圧縮データの中にも同じ並びが現れうるが、
// 辞書に /ObjStm を持つものだけを見るため実害は無い
const OBJECT_HEADER_PATTERN = /\d+\s+\d+\s+obj\b/g;

// ページツリーのルート（/Parent を持たないノード）が宣言する総ページ数を集める
function findRootPageCounts(text) {
  const counts = [];
  for (const match of text.matchAll(PAGE_TREE_PATTERN)) {
    const dictStart = text.lastIndexOf('<<', match.index);
    const dictEnd = text.indexOf('>>', match.index);
    if (dictStart === -1 || dictEnd === -1) continue;

    const dict = text.slice(dictStart, dictEnd);
    if (dict.includes('/Parent')) continue;

    const countMatch = dict.match(/\/Count\s+(\d+)/);
    if (countMatch) counts.push(Number(countMatch[1]));
  }
  return counts;
}

// 辞書の終わりは入れ子を数えて探す。`/DecodeParms << /Predictor 1 >>` のように
// 値が辞書のキーがあり、その位置は決まっていない。最初の >> を終わりとみなすと
// 外側の辞書を読み損ね、/ObjStm を見落とす
function findDictionaryEnd(body) {
  const start = body.indexOf('<<');
  if (start === -1) return -1;

  let depth = 0;
  for (let index = start; index < body.length - 1; index += 1) {
    const pair = body.slice(index, index + 2);
    if (pair === '<<') {
      depth += 1;
      index += 1;
    } else if (pair === '>>') {
      depth -= 1;
      index += 1;
      if (depth === 0) return index + 1;
    }
  }
  return -1;
}

// ストリームの終わりは辞書の /Length で決める。endstream を探して直前の改行を
// 落とす方法は、圧縮データの最後のバイトが CR（0x0d）のとき CRLF と読み違え、
// データを 1 バイト余分に削って展開に失敗する（Issue #145）。
// /Length が間接参照（`12 0 R`）の場合はその場で値を引けないため endstream に頼る
function resolveStreamEnd(text, dict, dataStart) {
  const lengthMatch = dict.match(/\/Length\s+(\d+)(\s+\d+\s+R)?/);
  if (lengthMatch && !lengthMatch[2]) {
    return dataStart + Number(lengthMatch[1]);
  }

  const keywordAt = text.indexOf('endstream', dataStart);
  if (keywordAt === -1) return null;
  if (text.slice(keywordAt - 2, keywordAt) === '\r\n') return keywordAt - 2;
  if (text[keywordAt - 1] === '\n' || text[keywordAt - 1] === '\r') return keywordAt - 1;
  return keywordAt;
}

// オブジェクトストリーム（/ObjStm）を展開し、走査できる平文として返す。
// latin1 では 1 文字が 1 バイトに対応するため、文字位置をそのままバイト位置に使える。
// 走査はオブジェクトの見出し（`N G obj`）を起点にする。stream の直前にある `<<` を
// 探す方法では、圧縮データの中に現れる同じ並びを本物の辞書と取り違える
function decodeObjectStreams(text, buffer) {
  const decoded = [];
  const headers = [...text.matchAll(OBJECT_HEADER_PATTERN)];

  for (const [index, header] of headers.entries()) {
    const bodyStart = header.index + header[0].length;
    const bodyEnd = headers[index + 1]?.index ?? text.length;
    const body = text.slice(bodyStart, bodyEnd);

    const dictEnd = findDictionaryEnd(body);
    if (dictEnd === -1) continue;
    const dict = body.slice(0, dictEnd);
    if (!dict.includes('/ObjStm')) continue;

    const streamMatch = /stream\r?\n/.exec(body.slice(dictEnd));
    if (!streamMatch) continue;

    const dataStart = bodyStart + dictEnd + streamMatch.index + streamMatch[0].length;
    const dataEnd = resolveStreamEnd(text, dict, dataStart);
    if (dataEnd === null || dataEnd <= dataStart) continue;

    try {
      decoded.push(zlib.inflateSync(buffer.subarray(dataStart, dataEnd)).toString('latin1'));
    } catch {
      /* 対応していない符号化のストリームは走査対象から外す */
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
