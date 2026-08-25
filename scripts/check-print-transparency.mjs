#!/usr/bin/env node
/**
 * 紙入稿用 PDF の透明効果検査
 *
 * 印刷所は透明効果を再現できないことがある．合成の結果が刷り上がりで
 * 変わらないよう，入稿データからは透明を取り除く（docs/spec/print-layout.md）．
 * 本スクリプトは出来上がった PDF を走査し，透明が残っていないかを確かめる．
 *
 * 数える対象は 2 つだけである．
 * - /None でないソフトマスク（/SMask）
 * - 1 未満の定数アルファ（/ca・/CA）
 * 指定の有無で数えると，透明を無効にする /SMask /None や，不透明を表す
 * /ca 1 まで数えてしまう．測り方は docs/spec/print-submission.md の表 4 に従う．
 *
 * 走査はページツリーを辿らず，平文と展開したオブジェクトストリームの全体を見る．
 * 参照されないオブジェクトまで数える可能性はあるが，入稿データに透明の指定が
 * 1 つも無い状態を求めるため，多めに拾う側へ倒す．
 *
 * 外部依存は増やさない．PDF の走査は count-pdf-pages.mjs の実装を再利用する．
 */

import fs from 'fs';
import { pathToFileURL } from 'url';
import { decodeObjectStreams } from './count-pdf-pages.mjs';

// PDF の空白は NUL・水平タブ・改行・改ページ・復帰・空白の 6 種である
const PDF_WHITESPACE = '\\x00\\t\\n\\f\\r ';

/* 名前は英数字だけでなく記号でも続く．/SMaskInData や /caption を
   別のキーとして外すため，続く 1 文字が名前を作る文字でないことを見る */
const NAME_CONTINUATION = '[^\\x00\\t\\n\\f\\r /\\[\\]<>(){}%]';

const SMASK_PATTERN = new RegExp(
  `/SMask(?!${NAME_CONTINUATION})[${PDF_WHITESPACE}]*(/None(?!${NAME_CONTINUATION}))?`,
  'g'
);

const ALPHA_PATTERN = new RegExp(
  `/(ca|CA)(?!${NAME_CONTINUATION})[${PDF_WHITESPACE}]*([+-]?(?:\\d+\\.?\\d*|\\.\\d+))`,
  'g'
);

/** 報告へ添える前後の文字数．どの辞書で見つかったかの手掛かりにする． */
const CONTEXT_RADIUS = 40;

function contextAt(text, index, length) {
  return text
    .slice(Math.max(0, index - CONTEXT_RADIUS), index + length + CONTEXT_RADIUS)
    .replace(/[\x00-\x1f]+/g, ' ')
    .trim();
}

/**
 * 走査できる平文から透明の指定を集める．
 * @param {string} text latin1 として読んだ PDF の中身
 * @param {string} source 見つかった場所の区分（plain・objstm）
 * @returns {Array<object>} 見つけた指定の一覧
 */
function findInText(text, source) {
  const found = [];

  for (const match of text.matchAll(SMASK_PATTERN)) {
    if (match[1]) continue;
    found.push({
      kind: 'smask',
      source,
      context: contextAt(text, match.index, match[0].length),
    });
  }

  for (const match of text.matchAll(ALPHA_PATTERN)) {
    const value = Number(match[2]);
    if (!(value < 1)) continue;
    found.push({
      kind: 'alpha',
      operator: match[1],
      value,
      source,
      context: contextAt(text, match.index, match[0].length),
    });
  }

  return found;
}

/**
 * PDF から透明の指定を集める．
 * @param {Buffer} buffer PDF のバイト列
 * @returns {Array<object>} 見つけた指定の一覧．透明が無ければ空
 */
export function findTransparency(buffer) {
  // PDF はバイト列であり，テキストとして扱うにはバイト値を保つ latin1 が要る
  const raw = buffer.toString('latin1');
  const decoded = decodeObjectStreams(raw, buffer);
  return [...findInText(raw, 'plain'), ...findInText(decoded, 'objstm')];
}

/**
 * 種別ごとの件数を 1 行にまとめる．
 * @param {Array<object>} found findTransparency の結果
 * @returns {string} 人が読む要約
 */
export function formatTransparencySummary(found) {
  const smask = found.filter(item => item.kind === 'smask').length;
  const alpha = found.filter(item => item.kind === 'alpha').length;
  return `/None でない SMask ${smask} 件・1 未満のアルファ ${alpha} 件`;
}

/**
 * 透明が残っていないことを確かめる．
 * @param {Buffer} buffer PDF のバイト列
 * @param {string} [label] 失敗の知らせに出す対象の呼び名
 * @returns {{ok: boolean, message?: string, found?: Array<object>}} 検証結果
 */
export function verifyNoTransparency(buffer, label = '紙入稿用 PDF') {
  const found = findTransparency(buffer);
  if (found.length === 0) {
    return { ok: true, found };
  }
  return {
    ok: false,
    found,
    message:
      `${label} に透明効果が ${found.length} 件残っています` +
      `（${formatTransparencySummary(found)}）．` +
      '発生源の CSS または SVG で，合成後の色を焼いて取り除いてください．',
  };
}

/**
 * ファイルを読んで検査する．
 * @param {string} pdfPath PDF のパス
 * @param {string} [label] 失敗の知らせに出す対象の呼び名
 * @returns {{ok: boolean, message?: string, found?: Array<object>}} 検証結果
 */
export function verifyNoTransparencyFile(pdfPath, label) {
  return verifyNoTransparency(fs.readFileSync(pdfPath), label);
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const pdfPath = process.argv[2] ?? 'dist/book-print.pdf';
  if (!fs.existsSync(pdfPath)) {
    console.error(`NG ${pdfPath} が見つからない`);
    process.exit(1);
  }
  const result = verifyNoTransparencyFile(pdfPath, pdfPath);
  if (!result.ok) {
    for (const item of result.found.slice(0, 10)) {
      console.error(`NG ${item.kind}: ${item.context}`);
    }
    if (result.found.length > 10) {
      console.error(`NG ほか ${result.found.length - 10} 件`);
    }
    console.error(result.message);
    process.exit(1);
  }
  console.log(`ok ${pdfPath} に透明効果は無い`);
}
