#!/usr/bin/env node
/**
 * 生成 PDF への XMP メタデータの埋め込み
 *
 * Vivliostyle CLI は文書情報辞書（DocInfo）は書くが，Catalog の
 * `/Metadata` 鍵に置く XMP メタデータストリームは書かない．
 * veraPDF の PDF/UA-1 検証で「Catalog に Metadata 鍵が無い」
 * （条項 7.1 テスト 8）として現れる（Issue #198）．
 * 本スクリプトはビルドの最終段で `config/book.yaml` の書誌情報から
 * XMP を組み立て，出来上がった PDF へ埋め込む．
 *
 * タグ構造（構造ツリー）には触れない．Issue #183 で廃止した
 * 「タグを書き換える後処理」とは異なり，Catalog へ鍵を 1 つ足すだけ
 * である．埋め込み後もタグの目印は verify-build.mjs の検査が確かめる．
 *
 * PDF/UA-1 の適合宣言（pdfuaid:part）は書かない．リンク注釈や
 * リスト構造など上流由来の非準拠が残る現状で宣言すると，
 * 事実と異なる適合表明になるためである（Issue #198 の判断）．
 *
 * 出力の再現性を保つため，日時（xmp:CreateDate 等）は書かない．
 *
 * PDF の書き換えには pdf-lib を使う．検査スクリプト群の
 * 「外部依存を増やさない」方針は読み取りに限った判断であり，
 * 書き換えを手書きすると相互参照表の再構築まで抱え込むためである．
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { PDFDocument, PDFName } from 'pdf-lib';
import { parse } from 'yaml';
import { decodeObjectStreams } from './count-pdf-pages.mjs';
import { collectDictionaries, collectPlainDictionaries } from './check-print-transparency.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// PDF の空白は NUL・水平タブ・改行・改ページ・復帰・空白の 6 種である
const PDF_WHITESPACE = '\\x00\\t\\n\\f\\r ';

/* 名前は英数字だけでなく記号でも続く．/MetadataFoo を別のキーとして
   外すため，続く 1 文字が名前を作る文字でないことを見る */
const NAME_CONTINUATION = '[^\\x00\\t\\n\\f\\r /\\[\\]<>(){}%]';

const CATALOG_PATTERN = new RegExp(
  `/Type(?!${NAME_CONTINUATION})[${PDF_WHITESPACE}]*/Catalog(?!${NAME_CONTINUATION})`
);
const METADATA_PATTERN = new RegExp(`/Metadata(?!${NAME_CONTINUATION})`);

/** XML の内容として安全な形へエスケープする */
function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * 書誌情報から XMP パケットを組み立てる．
 * 値の無い項目は要素ごと省き，書名・著者の欠落は警告する．
 * @param {{ title?: unknown, author?: unknown, language?: unknown, warn?: (m: string) => void }} options
 * @returns {string} XMP パケット（XML 文字列）
 */
export function buildXmpPacket(options = {}) {
  const warn = options.warn ?? console.warn;
  const language = isNonEmptyString(options.language) ? options.language.trim() : 'ja';

  const descriptions = [];
  if (isNonEmptyString(options.title)) {
    descriptions.push(
      `      <dc:title><rdf:Alt><rdf:li xml:lang="${escapeXml(language)}">` +
        `${escapeXml(options.title.trim())}</rdf:li></rdf:Alt></dc:title>`
    );
  } else {
    warn('config/book.yaml: title が未設定のため XMP へ dc:title を書かない');
  }
  if (isNonEmptyString(options.author)) {
    descriptions.push(
      `      <dc:creator><rdf:Seq><rdf:li>${escapeXml(options.author.trim())}</rdf:li></rdf:Seq></dc:creator>`
    );
  } else {
    warn('config/book.yaml: author が未設定のため XMP へ dc:creator を書かない');
  }
  descriptions.push(
    `      <dc:language><rdf:Bag><rdf:li>${escapeXml(language)}</rdf:li></rdf:Bag></dc:language>`
  );

  /* xpacket begin の値は仕様が定める UTF-8 の BOM 1 文字である */
  return [
    '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>',
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
    '  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    '    <rdf:Description rdf:about=""',
    '        xmlns:dc="http://purl.org/dc/elements/1.1/">',
    ...descriptions,
    '    </rdf:Description>',
    '  </rdf:RDF>',
    '</x:xmpmeta>',
    '<?xpacket end="w"?>',
  ].join('\n');
}

/**
 * PDF の Catalog へ XMP メタデータストリームを埋め込む．
 * @param {Buffer|Uint8Array} pdfBytes 元の PDF
 * @param {string} xmp XMP パケット
 * @returns {Promise<Uint8Array>} 埋め込み後の PDF
 */
export async function embedXmpMetadata(pdfBytes, xmp) {
  /* DocInfo は Vivliostyle CLI が書いた値を保つ（updateMetadata: false） */
  const doc = await PDFDocument.load(pdfBytes, { updateMetadata: false });
  const stream = doc.context.stream(Buffer.from(xmp, 'utf8'), {
    Type: 'Metadata',
    Subtype: 'XML',
  });
  doc.catalog.set(PDFName.of('Metadata'), doc.context.register(stream));
  return doc.save();
}

/**
 * Catalog が Metadata 鍵を持つことを確かめる．
 * 走査の方針は check-pdf-tags.mjs と同じで，辞書の単位で読む．
 * @param {Buffer} buffer PDF のバイト列
 * @param {string} [label] 失敗の知らせに出す対象の呼び名
 * @returns {{ok: boolean, message?: string}} 検証結果
 */
export function verifyPdfMetadata(buffer, label = 'PDF') {
  const raw = buffer.toString('latin1');
  const decoded = decodeObjectStreams(raw, buffer);
  const dictionaries = [...collectPlainDictionaries(raw), ...collectDictionaries(decoded)];

  for (const dictionary of dictionaries) {
    if (CATALOG_PATTERN.test(dictionary) && METADATA_PATTERN.test(dictionary)) {
      return { ok: true };
    }
  }
  return {
    ok: false,
    message:
      `${label} の Catalog に XMP メタデータ（/Metadata）がありません．` +
      'scripts/add-pdf-metadata.mjs がビルドの経路で実行されたか確認してください．',
  };
}

/**
 * ファイルを読んで検査する．
 * @param {string} pdfPath PDF のパス
 * @param {string} [label] 失敗の知らせに出す対象の呼び名
 * @returns {{ok: boolean, message?: string}} 検証結果
 */
export function verifyPdfMetadataFile(pdfPath, label) {
  return verifyPdfMetadata(fs.readFileSync(pdfPath), label);
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const repoRoot = path.join(__dirname, '..');
  const pdfPath = process.argv[2] ?? path.join(repoRoot, 'dist', 'book.pdf');
  if (!fs.existsSync(pdfPath)) {
    console.error(`NG ${pdfPath} が見つからない`);
    process.exit(1);
  }
  const bookYaml =
    parse(fs.readFileSync(path.join(repoRoot, 'config', 'book.yaml'), 'utf-8')) ?? {};
  /* 言語はビルド設定を単一の出所とする */
  const config = (await import(pathToFileURL(path.join(repoRoot, 'vivliostyle.config.js')))).default;
  const xmp = buildXmpPacket({
    title: bookYaml.title,
    author: bookYaml.author,
    language: config.language,
  });
  const embedded = await embedXmpMetadata(fs.readFileSync(pdfPath), xmp);
  fs.writeFileSync(pdfPath, embedded);
  console.log(`ok ${pdfPath} へ XMP メタデータを埋め込んだ`);
}
