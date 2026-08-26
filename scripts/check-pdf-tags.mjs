#!/usr/bin/env node
/**
 * タグ付き PDF であることの検査
 *
 * スクリーンリーダー等の支援技術が読み上げ順序・見出し構造を扱えるよう，
 * 出力する PDF はタグ付き（Tagged PDF）である必要がある（Issue #185）．
 * 本スクリプトは出来上がった PDF を走査し，タグ付けの目印が揃っているかを確かめる．
 *
 * 数える対象は次の 3 つである．
 * - 構造ツリーの根（`/StructTreeRoot`）
 * - マーク情報辞書（`/MarkInfo`）
 * - マーク情報辞書の `/Marked true`
 *
 * `/StructTreeRoot` と `/MarkInfo` は Catalog 辞書の鍵として，
 * `/Marked true` はいずれかの辞書の中で数える．値の指す先までは検証しない
 * （`/StructTreeRoot` が指す先の構造木の妥当性までは扱わない）．
 *
 * 走査は辞書の単位で行う．素のバイト列へ正規表現を当てると，
 * 誌面の文字列や読み上げ用の代替テキストに現れた `/StructTreeRoot` を
 * 本物の指定と取り違える．平文側はファイルの本体を辿って辞書だけを読み，
 * ストリームの中身を飛ばす．圧縮側はオブジェクトストリームを展開し，
 * 文字列とコメントを飛ばして辿る．辞書を読む部品は count-pdf-pages.mjs と
 * check-print-transparency.mjs（辞書の収集）を共有する．
 *
 * `/MarkInfo 5 0 R` のような間接参照は，参照先のオブジェクトも
 * 辞書として別に集まるため，`/Marked true` はそちらから拾える．
 *
 * `/Marked true` は Catalog の `/MarkInfo` の値とは突き合わせない．
 * 突き合わせには間接参照の解決が要り，ObjStm 内のオブジェクトは
 * 見出しを持たないため番号表（/N・/First）の解釈まで実装が広がる．
 * `/Marked` を鍵に持つ標準の辞書は MarkInfo だけであり，実在の
 * 生成系でこの緩さが偽陽性になる経路は無い．意味的な妥当性の検証は
 * spec がスコープ外と定め，veraPDF の手動手順が受け持つ．
 *
 * 外部依存は増やさない．
 */

import fs from 'fs';
import { pathToFileURL } from 'url';
import { decodeObjectStreams } from './count-pdf-pages.mjs';
import { collectDictionaries, collectPlainDictionaries } from './check-print-transparency.mjs';

// PDF の空白は NUL・水平タブ・改行・改ページ・復帰・空白の 6 種である
const PDF_WHITESPACE = '\\x00\\t\\n\\f\\r ';

/* 名前は英数字だけでなく記号でも続く．/StructTreeRootFoo を別のキーとして
   外すため，続く 1 文字が名前を作る文字でないことを見る */
const NAME_CONTINUATION = '[^\\x00\\t\\n\\f\\r /\\[\\]<>(){}%]';

/* /StructTreeRoot と /MarkInfo は Catalog 辞書の中でだけ数える．
   構造ルートオブジェクト自身も /Type /StructTreeRoot という値を持つため，
   出現だけを見ると，Catalog から参照が消えて支援技術の届かなくなった
   孤児オブジェクトの残骸を合格させてしまう．Catalog の中であれば，
   この 2 つの名前は鍵としてしか現れない */
const CATALOG_PATTERN = new RegExp(
  `/Type(?!${NAME_CONTINUATION})[${PDF_WHITESPACE}]*/Catalog(?!${NAME_CONTINUATION})`
);
const STRUCT_TREE_ROOT_PATTERN = new RegExp(`/StructTreeRoot(?!${NAME_CONTINUATION})`);
const MARK_INFO_PATTERN = new RegExp(`/MarkInfo(?!${NAME_CONTINUATION})`);

/* /Marked の値は true のみ許容する．true の直後が英数字なら，
   /Marked を接頭辞に持つ別の値（想定していない書き方）であり一致させない */
const MARKED_TRUE_PATTERN = new RegExp(
  `/Marked(?!${NAME_CONTINUATION})[${PDF_WHITESPACE}]*true(?![A-Za-z0-9])`
);

/** 検査項目ごとの，知らせに出す表示名 */
const MARKER_LABELS = {
  structTreeRoot: '/StructTreeRoot',
  markInfo: '/MarkInfo',
  markedTrue: '/Marked true',
};

/**
 * PDF からタグ付けの目印を探す．
 * @param {Buffer} buffer PDF のバイト列
 * @returns {{structTreeRoot: boolean, markInfo: boolean, markedTrue: boolean}} 見つかった目印
 */
export function findTagMarkers(buffer) {
  // PDF はバイト列であり，テキストとして扱うにはバイト値を保つ latin1 が要る
  const raw = buffer.toString('latin1');
  const decoded = decodeObjectStreams(raw, buffer);
  const dictionaries = [...collectPlainDictionaries(raw), ...collectDictionaries(decoded)];

  const markers = { structTreeRoot: false, markInfo: false, markedTrue: false };

  for (const dictionary of dictionaries) {
    if (CATALOG_PATTERN.test(dictionary)) {
      if (STRUCT_TREE_ROOT_PATTERN.test(dictionary)) {
        markers.structTreeRoot = true;
      }
      if (MARK_INFO_PATTERN.test(dictionary)) {
        markers.markInfo = true;
      }
    }
    /* /Marked は MarkInfo 辞書の鍵である．MarkInfo 辞書は /Type を持たず
       入れ子・間接参照の両形があるため，置き場所では絞らない．
       /Marked を値に使う標準の名前は無く，誤検出の余地は残らない */
    if (!markers.markedTrue && MARKED_TRUE_PATTERN.test(dictionary)) {
      markers.markedTrue = true;
    }
  }

  return markers;
}

/**
 * タグ付き PDF であることを確かめる．
 * @param {Buffer} buffer PDF のバイト列
 * @param {string} [label] 失敗の知らせに出す対象の呼び名
 * @returns {{ok: boolean, message?: string, missing?: Array<string>}} 検証結果
 */
export function verifyTaggedPdf(buffer, label = 'タグ付き PDF') {
  const markers = findTagMarkers(buffer);
  const missing = Object.keys(MARKER_LABELS)
    .filter(key => !markers[key])
    .map(key => MARKER_LABELS[key]);

  if (missing.length === 0) {
    return { ok: true };
  }
  return {
    ok: false,
    missing,
    message:
      `${label} にタグ付けの目印（${missing.join('・')}）がありません．` +
      'PDF の生成元がタグ付き出力に設定されているか確認してください．',
  };
}

/**
 * ファイルを読んで検査する．
 * @param {string} pdfPath PDF のパス
 * @param {string} [label] 失敗の知らせに出す対象の呼び名
 * @returns {{ok: boolean, message?: string, missing?: Array<string>}} 検証結果
 */
export function verifyTaggedPdfFile(pdfPath, label) {
  return verifyTaggedPdf(fs.readFileSync(pdfPath), label);
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const pdfPath = process.argv[2] ?? 'dist/book.pdf';
  if (!fs.existsSync(pdfPath)) {
    console.error(`NG ${pdfPath} が見つからない`);
    process.exit(1);
  }
  const result = verifyTaggedPdfFile(pdfPath, pdfPath);
  if (!result.ok) {
    console.error(result.message);
    process.exit(1);
  }
  console.log(`ok ${pdfPath} はタグ付き PDF`);
}
