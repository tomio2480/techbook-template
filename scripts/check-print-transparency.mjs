#!/usr/bin/env node
/**
 * 紙入稿用 PDF の透明効果検査
 *
 * 印刷所は透明効果を再現できないことがある．合成の結果が刷り上がりで
 * 変わらないよう，入稿データからは透明を取り除く（docs/spec/print-layout.md）．
 * 本スクリプトは出来上がった PDF を走査し，透明が残っていないかを確かめる．
 *
 * 数える対象は PDF の透明モデルを働かせる指定に限る．
 * - `/None` でないソフトマスク（`/SMask`）
 * - 1 未満の定数アルファ（`/ca`・`/CA`）
 * - `/Normal`・`/Compatible` 以外の合成モード（`/BM`）
 * - 0 でない埋め込みアルファの指定（`/SMaskInData`）
 * 指定の有無で数えると，透明を無効にする `/SMask /None` や，
 * 不透明を表す `/ca 1`・`/BM /Normal` まで数えてしまう．
 * 測り方は docs/spec/print-submission.md の表 4 に従う．
 *
 * 透明グループ（`/Group << /S /Transparency >>`）は数えない．
 * 合成の場を宣言するだけであり，そこで透明を使う要素は上の 4 つが捉える．
 * 生成側が常に付ける可能性もあり，付いていること自体は違反の証拠にならない．
 *
 * 走査は辞書の単位で行う．素のバイト列へ正規表現を当てると，
 * 誌面の文字列や読み上げ用の代替テキストに現れた `/ca 0.5` を
 * 指定と取り違える．鍵と値のあいだに置けるコメントも読み落とす．
 * 平文側は間接オブジェクトの辞書だけを見て，圧縮データを避ける．
 * 圧縮側はオブジェクトストリームを展開し，文字列とコメントを飛ばして辿る．
 * 辞書を読む部品は count-pdf-pages.mjs と共有する．
 *
 * 値は直接オブジェクトである前提を置く（`/ca 5 0 R` のような間接参照は読まない）．
 * 組版に使う Chromium はいずれも数値と名前で書き出す．
 *
 * ページツリーは辿らず，見つかった辞書をすべて見る．
 * 参照されないオブジェクトまで数える可能性はあるが，入稿データに透明の指定が
 * 1 つも無い状態を求めるため，多めに拾う側へ倒す．
 *
 * 外部依存は増やさない．
 */

import fs from 'fs';
import { pathToFileURL } from 'url';
import {
  decodeObjectStreams,
  readDictionary,
  skipComment,
  skipLiteralString,
  skipHexString,
  skipWhitespaceAndComments,
} from './count-pdf-pages.mjs';

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

const BLEND_PATTERN = new RegExp(
  `/BM(?!${NAME_CONTINUATION})[${PDF_WHITESPACE}]*(/(${NAME_CONTINUATION}+))?`,
  'g'
);

const SMASK_IN_DATA_PATTERN = new RegExp(
  `/SMaskInData(?!${NAME_CONTINUATION})[${PDF_WHITESPACE}]*(\\d+)`,
  'g'
);

/** 透明を働かせない合成モード．これ以外は，下の絵柄と混ぜて刷ることになる． */
const OPAQUE_BLEND_MODES = ['Normal', 'Compatible'];

/** オブジェクトの見出し（`12 0 obj`）は obj キーワードで捉える． */
const OBJECT_KEYWORD_PATTERN = /\bobj\b/g;
const OBJECT_KEYWORD_LENGTH = 'obj'.length;

/** 報告へ添える前後の文字数．どの辞書で見つかったかの手掛かりにする． */
const CONTEXT_RADIUS = 40;

function contextAt(text, index, length) {
  return text
    .slice(Math.max(0, index - CONTEXT_RADIUS), index + length + CONTEXT_RADIUS)
    .replace(/[\x00-\x1f]+/g, ' ')
    .trim();
}

/**
 * 文字列とコメントを飛ばしながら辞書を集める．
 * 入れ子の辞書も拾えるよう，`<<` の次の 1 文字から走査を続ける．
 * @param {string} text 走査できる平文
 * @returns {Array<string>} 辞書ごとの，外側の鍵だけを残した文字列
 */
export function collectDictionaries(text) {
  const dictionaries = [];
  let index = 0;

  while (index < text.length) {
    const character = text[index];
    if (character === '%') {
      index = skipComment(text, index);
      continue;
    }
    if (character === '(') {
      index = skipLiteralString(text, index);
      continue;
    }
    if (character === '<') {
      if (text[index + 1] === '<') {
        const dictionary = readDictionary(text, index);
        if (dictionary !== null) dictionaries.push(dictionary.outer);
        /* 終端まで飛ばさず 2 文字だけ進める．readDictionary は入れ子の
           中身を落とすため，飛ばすと内側の辞書を見落とす */
        index += 2;
        continue;
      }
      index = skipHexString(text, index);
      continue;
    }
    index += 1;
  }

  return dictionaries;
}

/**
 * 平文の PDF から，間接オブジェクトの辞書を集める．
 * 圧縮データを走査の対象から外すため，オブジェクトの見出しを起点にする．
 * @param {string} text latin1 として読んだ PDF の中身
 * @returns {Array<string>} 辞書ごとの，外側の鍵だけを残した文字列
 */
export function collectObjectDictionaries(text) {
  const dictionaries = [];
  /* 同じ辞書へ複数の起点からたどり着くことがある．
     見出しの後ろのコメントが obj で終わる形が例であり，位置で覚えて重複を避ける */
  const seen = new Set();

  for (const keyword of text.matchAll(OBJECT_KEYWORD_PATTERN)) {
    const start = skipWhitespaceAndComments(text, keyword.index + OBJECT_KEYWORD_LENGTH);
    const dictionary = readDictionary(text, start);
    if (dictionary === null || seen.has(start)) continue;
    seen.add(start);
    /* 辞書の範囲だけを渡す．この中に圧縮データは無く，入れ子も拾える */
    dictionaries.push(...collectDictionaries(text.slice(start, dictionary.end)));
  }

  return dictionaries;
}

/**
 * 辞書 1 つから透明の指定を集める．
 * @param {string} dictionary 外側の鍵だけを残した辞書の文字列
 * @param {string} source 見つかった場所の区分（plain・objstm）
 * @returns {Array<object>} 見つけた指定の一覧
 */
function findInDictionary(dictionary, source) {
  const found = [];
  const add = (item, match) =>
    found.push({
      ...item,
      source,
      context: contextAt(dictionary, match.index, match[0].length),
    });

  for (const match of dictionary.matchAll(SMASK_PATTERN)) {
    if (match[1]) continue;
    add({ kind: 'smask' }, match);
  }

  for (const match of dictionary.matchAll(ALPHA_PATTERN)) {
    const value = Number(match[2]);
    if (!(value < 1)) continue;
    add({ kind: 'alpha', operator: match[1], value }, match);
  }

  for (const match of dictionary.matchAll(BLEND_PATTERN)) {
    /* 名前を読めない形（配列・間接参照）は不透明と示せない．
       読めないまま通すと，取り除いたつもりの透明が入稿データへ残る */
    const mode = match[2] ?? null;
    if (mode !== null && OPAQUE_BLEND_MODES.includes(mode)) continue;
    add({ kind: 'blend', value: mode }, match);
  }

  for (const match of dictionary.matchAll(SMASK_IN_DATA_PATTERN)) {
    const value = Number(match[1]);
    if (value === 0) continue;
    add({ kind: 'embedded-alpha', value }, match);
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

  return [
    ...collectObjectDictionaries(raw).flatMap(dictionary =>
      findInDictionary(dictionary, 'plain')
    ),
    ...collectDictionaries(decoded).flatMap(dictionary =>
      findInDictionary(dictionary, 'objstm')
    ),
  ];
}

/**
 * 種別ごとの件数を 1 行にまとめる．
 * @param {Array<object>} found findTransparency の結果
 * @returns {string} 人が読む要約
 */
export function formatTransparencySummary(found) {
  const count = kind => found.filter(item => item.kind === kind).length;
  return [
    `/None でない SMask ${count('smask')} 件`,
    `1 未満のアルファ ${count('alpha')} 件`,
    `不透明でない合成モード ${count('blend')} 件`,
    `埋め込みアルファ ${count('embedded-alpha')} 件`,
  ].join('・');
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
