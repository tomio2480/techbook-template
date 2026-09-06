#!/usr/bin/env node
/**
 * 図版 SVG の図中フォント指定の検査
 *
 * src/assets/diagrams/*.svg の root の <svg> に font-family があることを検査する．
 * その値はテーマの --font-gothic（本文のゴシック体スタック）と一致させる．
 * img で埋め込んだ SVG はページの CSS を継承しない．
 * root に指定が無いと図中の和文ラベルはブラウザ既定のフォントで描かれ，
 * 図ごとにフォントがぶれる．
 *
 * root の font-family 属性以外の指定（子要素の属性・style 属性・<style> 要素）は，
 * テーマのスタックか ALLOWED_EXTRA_FONT_STACKS に登録したスタックだけを許す．
 * 量記号を明朝の斜体で組むための別スタックのように，意図して使う指定は登録する．
 * 登録の無い指定は，図ごとの差の発生源になるため違反として報告する．
 *
 * ALLOWED_EXTRA_FONT_STACKS・EXCLUDED_FILES は本ごとに差し替える定数として
 * 先頭に集約している．
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { parseCssVariables, resolveVar } from './check-contrast.mjs';

/** テーマ側の対応トークン．root の font-family はこの値と一致させる． */
export const FONT_TOKEN = '--font-gothic';

/**
 * root 以外で使ってよい別のフォントスタック．本ごとに差し替える．既定は空とする．
 * 例は量記号用の明朝スタック `"Times New Roman", "MS Mincho", serif` である．
 * 比較は正規化（引用符の除去・小文字化・区切りの空白の統一）後に行う．
 */
export const ALLOWED_EXTRA_FONT_STACKS = [];

/** 検査から除外するファイル．本ごとに差し替える．既定は空とする． */
export const EXCLUDED_FILES = [];

/**
 * XML コメントを除去する．コメント内に残る指定（無効化済みの記述）を
 * 検査対象から除外し，誤検出・誤通過の両方を防ぐ．
 * 入れ子・破損したコメント境界では 1 回の置換で取り残しが生じ得るため，
 * 変化がなくなるまで繰り返す．
 * @param {string} svgText
 * @returns {string}
 */
function stripXmlComments(svgText) {
  let text = svgText;
  for (;;) {
    const next = text.replace(/<!--[\s\S]*?-->/g, '');
    if (next === text) {
      return next;
    }
    text = next;
  }
}

const XML_ENTITIES = new Map([
  ['quot', '"'],
  ['apos', "'"],
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
]);

/**
 * XML の属性値に含まれる実体参照を復号する．
 * `style="font-family: &quot;Times New Roman&quot;, serif"` のように，
 * 外側と同じ引用符をフォント名へ使うと実体参照になるためである．
 * @param {string} value
 * @returns {string}
 */
export function decodeXmlEntities(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return XML_ENTITIES.get(body.toLowerCase()) ?? whole;
  });
}

/**
 * CSS コメントを除去する．無効化した宣言を検査対象から外す．
 * @param {string} cssText
 * @returns {string}
 */
function stripCssComments(cssText) {
  return cssText.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * CSS のエスケープ（\ の後ろ）を 1 つ復号し，消費した文字数を返す．
 * 16 進エスケープは 1〜6 桁で，直後の空白 1 つを終端として飲み込む（CSS Syntax）．
 * それ以外は次の 1 文字をそのまま採る．
 * @param {string} value
 * @param {number} index バックスラッシュの位置
 * @returns {{ text: string, length: number }}
 */
function decodeCssEscape(value, index) {
  const hex = value.slice(index + 1).match(/^[0-9a-f]{1,6}/i);
  if (hex) {
    const code = parseInt(hex[0], 16);
    const text = code === 0 || code > 0x10ffff ? '�' : String.fromCodePoint(code);
    const after = value[index + 1 + hex[0].length];
    const terminator = after === ' ' || after === '\t' || after === '\n' ? 1 : 0;
    return { text, length: 1 + hex[0].length + terminator };
  }
  if (index + 1 < value.length) {
    return { text: value[index + 1], length: 2 };
  }
  return { text: '', length: 1 };
}

/**
 * フォントスタックをフォント名の配列へ分ける．
 * 引用符の中のカンマは区切りとして扱わず，引用符と CSS のエスケープを外す．
 * @param {string} value font-family の値
 * @returns {string[]}
 */
export function splitFontStack(value) {
  const families = [];
  let current = '';
  let quote = null;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (ch === '\\') {
      const { text, length } = decodeCssEscape(value, i);
      current += text;
      i += length - 1;
      continue;
    }
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ',') {
      families.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  families.push(current);
  return families.map(family => family.trim()).filter(family => family.length > 0);
}

/**
 * フォントスタックを比較用に正規化する．
 * 引用符を外し，小文字にし，カンマ区切りの前後の空白を 1 つの形へそろえる．
 * 引用符の中のカンマはフォント名の一部として保つ．
 * @param {string} value font-family の値
 * @returns {string} 例: `noto sans cjk jp, noto sans jp, sans-serif`
 */
export function normalizeFontStack(value) {
  return splitFontStack(value)
    .map(family => family.toLowerCase())
    .join(', ');
}

/**
 * root の <svg> 開始タグを取り出す．
 * @param {string} svgText
 * @returns {string | null} 開始タグ全体．無ければ null
 */
function findRootSvgTag(svgText) {
  /* 属性値の中の > を開始タグの終端にしない．引用符の中は丸ごと読み飛ばす */
  const match = stripXmlComments(svgText).match(/<svg\b(?:[^>"']|"[^"]*"|'[^']*')*>/);
  return match ? match[0] : null;
}

/**
 * <style> 要素を取り除く．入れ子や破損した境界（例: `<style><style>…</style>`）では
 * 1 回の置換で取り残しが生じ得るため，変化がなくなるまで繰り返す．
 * CodeQL js/incomplete-multi-character-sanitization への対応で，
 * check-diagram-luminance.mjs の stripXmlComments と同じ形にしている．
 * @param {string} text
 * @returns {string}
 */
function stripStyleElements(text) {
  let current = text;
  for (;;) {
    const next = current.replace(STYLE_ELEMENT, '');
    if (next === current) {
      return next;
    }
    current = next;
  }
}

/** 宣言の優先指定（!important）は値ではないため，比較の前に切り離す． */
function stripImportant(value) {
  return value.replace(/\s*!\s*important\s*$/i, '').trim();
}

/* 属性名は直前が空白かタグ先頭に限る．\b では data-font-family や
   名前空間付き属性の末尾にも一致してしまう */
const FONT_FAMILY_ATTRIBUTE = /(?<![\w:.-])font-family\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
/* CSS の宣言．値には引用符付きのフォント名が入るため，区切りは ; と } だけにする．
   style 属性の値と <style> 要素の中身を切り出してから当てる */
const FONT_FAMILY_DECLARATION = /(?<![\w-])font-family\s*:\s*([^;}]+)/gi;
const STYLE_ELEMENT = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
const STYLE_ATTRIBUTE = /(?<![\w:.-])style\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

/**
 * root の <svg> の font-family 属性の値を返す．
 * @param {string} svgText
 * @returns {string | null} 未指定なら null
 */
export function extractRootFontFamily(svgText) {
  const rootTag = findRootSvgTag(svgText);
  if (!rootTag) {
    return null;
  }
  const match = rootTag.match(/(?<![\w:.-])font-family\s*=\s*(?:"([^"]*)"|'([^']*)')/);
  if (!match) {
    return null;
  }
  return decodeXmlEntities(match[1] ?? match[2]).trim();
}

/**
 * root の font-family 属性以外の font-family 指定を集める．
 * 子要素の属性，style 属性内の宣言（root のものを含む），<style> 要素内の宣言を対象にする．
 * root の inline style は presentation attribute より優先されるため，除外しない．
 * @param {string} svgText
 * @returns {Array<{ value: string, source: 'attribute' | 'declaration' }>}
 */
export function extractOtherFontFamilies(svgText) {
  const withoutComments = stripXmlComments(svgText);
  const rootTag = findRootSvgTag(svgText);
  /* root からは font-family 属性だけを取り除き，style 属性は残して検査する */
  const body = rootTag
    ? withoutComments.replace(rootTag, rootTag.replace(FONT_FAMILY_ATTRIBUTE, ''))
    : withoutComments;
  /* <style> の中身は属性の走査から外す．CSS コメントで無効化したセレクタ
     （text[font-family="serif"] など）を属性と誤認しないためである */
  const styleContents = [...body.matchAll(STYLE_ELEMENT)].map(match => match[1]);
  const markup = stripStyleElements(body);
  const found = [];
  for (const match of markup.matchAll(FONT_FAMILY_ATTRIBUTE)) {
    found.push({ value: decodeXmlEntities(match[1] ?? match[2]).trim(), source: 'attribute' });
  }
  const cssTexts = [
    ...styleContents,
    ...[...markup.matchAll(STYLE_ATTRIBUTE)].map(match => decodeXmlEntities(match[1] ?? match[2])),
  ];
  for (const cssText of cssTexts) {
    for (const match of stripCssComments(cssText).matchAll(FONT_FAMILY_DECLARATION)) {
      found.push({ value: stripImportant(match[1]), source: 'declaration' });
    }
  }
  return found;
}

/**
 * 除外リストのうち実在しないファイル名を返す．
 * 図版を改名すると除外リストが古びて検査が素通りするため，その取り残しを拾う．
 * @param {Iterable<string>} realFileNames
 * @param {string[]} [excludedFiles]
 * @returns {string[]}
 */
export function findMissingExcludedFiles(realFileNames, excludedFiles = EXCLUDED_FILES) {
  const names = new Set(realFileNames);
  return excludedFiles.filter(name => !names.has(name));
}

/**
 * 図版 SVG 群を，テーマのフォントスタックに照らして検査する．
 * @param {Map<string, string>} svgFiles ファイル名 → SVG テキスト
 * @param {string} themeCss --font-gothic を宣言した CSS の内容
 * @param {{ fontToken?: string, allowedExtraStacks?: string[], excludedFiles?: string[] }} [options]
 * @returns {Array<{ type: string, file: string, value?: string, message: string }>}
 */
export function checkDiagramFonts(svgFiles, themeCss, options = {}) {
  const fontToken = options.fontToken ?? FONT_TOKEN;
  const excludedFiles = options.excludedFiles ?? EXCLUDED_FILES;
  const expected = normalizeFontStack(resolveVar(parseCssVariables(themeCss), fontToken));
  const allowed = new Set([
    expected,
    ...(options.allowedExtraStacks ?? ALLOWED_EXTRA_FONT_STACKS).map(normalizeFontStack),
  ]);
  const violations = [];

  for (const [file, svgText] of svgFiles) {
    if (excludedFiles.includes(file)) {
      continue;
    }
    const rootValue = extractRootFontFamily(svgText);
    if (rootValue === null) {
      violations.push({
        type: 'root-font-missing',
        file,
        message: `${file} の root <svg> に font-family が無い（${fontToken} と同じ値を指定する）`,
      });
    } else if (normalizeFontStack(rootValue) !== expected) {
      violations.push({
        type: 'root-font-mismatch',
        file,
        value: rootValue,
        message: `${file} の root <svg> の font-family「${rootValue}」が ${fontToken} と一致しない`,
      });
    }
    for (const { value, source } of extractOtherFontFamilies(svgText)) {
      if (!allowed.has(normalizeFontStack(value))) {
        violations.push({
          type: 'unregistered-font-stack',
          file,
          value,
          message: `${file} の font-family「${value}」（${source}）は登録が無い（ALLOWED_EXTRA_FONT_STACKS へ登録するか，指定を外して root の値を継承させる）`,
        });
      }
    }
  }

  return violations;
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const diagramsDir = fileURLToPath(new URL('../src/assets/diagrams', import.meta.url));
  const themePath = fileURLToPath(new URL('../config/themes/techbook/theme.css', import.meta.url));
  const files = new Map();
  if (fs.existsSync(diagramsDir)) {
    for (const name of fs.readdirSync(diagramsDir)) {
      if (name.endsWith('.svg')) {
        files.set(name, fs.readFileSync(path.join(diagramsDir, name), 'utf-8'));
      }
    }
  }
  const checkableCount = [...files.keys()].filter(name => !EXCLUDED_FILES.includes(name)).length;
  if (checkableCount === 0) {
    console.log('ok 図中フォントの検査対象となる図版がまだない（初期状態のため省略）');
    process.exit(0);
  }
  const violations = checkDiagramFonts(files, fs.readFileSync(themePath, 'utf-8'));
  if (violations.length > 0) {
    for (const v of violations) {
      console.error(`NG ${v.message}`);
    }
    console.error(`図中フォントの規約違反が ${violations.length} 件ある`);
    process.exit(1);
  }
  console.log(`ok 図版 SVG ${files.size} 件（除外 ${EXCLUDED_FILES.length} 件を含む）の図中フォントを確認した`);
}
