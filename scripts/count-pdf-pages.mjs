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

// オブジェクトストリーム（/ObjStm）を展開し、走査できる平文として返す。
// latin1 では 1 文字が 1 バイトに対応するため、文字位置をそのままバイト位置に使える
function decodeObjectStreams(text, buffer) {
  const decoded = [];
  const streamPattern = /stream\r?\n/g;

  for (let match; (match = streamPattern.exec(text)) !== null; ) {
    const dictStart = text.lastIndexOf('<<', match.index);
    if (dictStart === -1 || !text.slice(dictStart, match.index).includes('/ObjStm')) continue;

    const dataStart = match.index + match[0].length;
    const dataEnd = text.indexOf('endstream', dataStart);
    if (dataEnd === -1) continue;

    try {
      // endstream の直前にある改行はストリームの一部ではない
      const data = buffer.subarray(dataStart, dataEnd).toString('latin1').replace(/\r?\n$/, '');
      decoded.push(zlib.inflateSync(Buffer.from(data, 'latin1')).toString('latin1'));
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
