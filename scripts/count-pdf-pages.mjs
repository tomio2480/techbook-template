#!/usr/bin/env node
/**
 * PDF のページ数を数えるユーティリティ
 *
 * 紙入稿用ビルド（scripts/build-print.mjs）が面付けの不足ページ数を求めるために使う。
 * 外部依存を増やさず、PDF のページオブジェクトを走査して数える。
 *
 * Vivliostyle CLI が出力した直後の PDF は、ページオブジェクトを圧縮された
 * オブジェクトストリーム（/ObjStm）へ格納する。一方、タグ付け（tag-pdf.mjs）を
 * 通した後の PDF では平文で現れる。どちらの形式でも数えられるよう、
 * オブジェクトストリームだけを展開して走査対象に加える。本文の内容ストリームは
 * 展開しない（誌面に現れる文字列をページ定義と誤認しないため）。
 *
 * 数え落としを検知するため、ページツリーのルートが持つ /Count とも突合する。
 * 両者が食い違う場合は誤った面付けを避けるために例外を投げる。
 */

import fs from 'fs';
import zlib from 'zlib';

// /Type /Page に続く文字が英字なら /Pages・/PageLabels などの別のオブジェクトである
const PAGE_OBJECT_PATTERN = /\/Type\s*\/Page(?![a-zA-Z])/g;
const PAGE_TREE_PATTERN = /\/Type\s*\/Pages(?![a-zA-Z])/g;

// ページツリーのルート（/Parent を持たないノード）が宣言する総ページ数を返す。
// ルートを一意に特定できない場合は突合を諦めて null を返す
function findRootPageCount(text) {
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
  return counts.length === 1 ? counts[0] : null;
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
  const text = `${raw}\n${decodeObjectStreams(raw, buffer)}`;
  const pageObjectCount = (text.match(PAGE_OBJECT_PATTERN) ?? []).length;

  if (pageObjectCount === 0) {
    throw new Error(
      'PDF のページ数を読み取れませんでした。ページオブジェクトが平文で現れない形式の可能性があります。'
    );
  }

  const rootCount = findRootPageCount(text);
  if (rootCount !== null && rootCount !== pageObjectCount) {
    throw new Error(
      `PDF のページ数が食い違います（ページオブジェクト: ${pageObjectCount}、ページツリー: ${rootCount}）。`
    );
  }

  return pageObjectCount;
}

export function countPdfPagesFile(pdfPath) {
  return countPdfPages(fs.readFileSync(pdfPath));
}
