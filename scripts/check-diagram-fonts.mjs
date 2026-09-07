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
 * 書体を root から動かす一括指定も違反とする．font の短縮記法
 * （`font: 20px Courier`・`font="20px Impact"`）と all の一括指定（`all: initial`）が
 * 当たる．登録済みのスタックを書いた場合も含める．図版では font-family と
 * font-size を分けて書く規約とし，一括指定の値を解析する経路そのものを持たない．
 *
 * ALLOWED_EXTRA_FONT_STACKS・EXCLUDED_FILES は本ごとに差し替える定数として
 * 先頭に集約している．
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { parseCssVariables, resolveVar } from './check-contrast.mjs';
import { stripXmlComments, findUnreadableMarkup, toUnreadableViolation } from './svg-source.mjs';

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
 * svg-source.mjs の stripXmlComments と同じ形にしている．
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
/* 書体を root から動かしうる一括指定．font-family などの個別プロパティは
   直後がハイフンのため一致しない．値としての all（transition: all）にも一致しない */
const TYPEFACE_OVERRIDE_DECLARATION = /(?<![\w-])(font|all)\s*:\s*([^;}]+)/gi;
/* font 属性の短縮記法．Chromium は無視するが，書き手の意図が誌面へ出ないため報告する．
   all は presentation attribute に無いため，属性としては見ない */
const FONT_SHORTHAND_ATTRIBUTE = /(?<![\w:.-])font\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

/* 開始タグ．属性の走査はこの中だけで行う．図の本文に現れる文字列
   （例: `<text>ここへ font="20px Impact" と書く</text>`）を属性と誤認しない
   ためである．閉じタグ・XML 宣言・DOCTYPE は先頭 1 文字で外れる */
const OPENING_TAG = /<[a-zA-Z_][\w:.-]*(?:[^>"']|"[^"]*"|'[^']*')*>/g;
/* at-rule の前置き．@ から，ブロックを開く { か文を閉じる ; の手前までを指す．
   @supports (all: initial) の条件を宣言と誤認しないため，宣言の走査から外す．
   ブロックの中身は残るため，@media に包んだ宣言は従来どおり拾える */
const AT_RULE_PRELUDE = /@[\w-]+[^{;]*/g;

/**
 * SVG テキストを，属性を走査する開始タグと CSS のテキストへ分ける．
 * <style> の中身は属性の走査から外す．CSS コメントで無効化したセレクタ
 * （text[font-family="serif"] など）を属性と誤認しないためである．
 * @param {string} source XML コメントを除いた SVG テキスト
 * @returns {{ tags: string, cssTexts: string[] }}
 */
function splitMarkupAndCss(source) {
  const styleContents = [...source.matchAll(STYLE_ELEMENT)].map(match => match[1]);
  const tags = (stripStyleElements(source).match(OPENING_TAG) ?? []).join('\n');
  const cssTexts = [
    ...styleContents,
    ...[...tags.matchAll(STYLE_ATTRIBUTE)].map(match => decodeXmlEntities(match[1] ?? match[2])),
  ];
  return { tags, cssTexts };
}

/**
 * CSS のテキストから宣言だけを残す．コメントと at-rule の前置きを外す．
 * 順序は入れ替えない．コメントを先に外さないと，コメント内の @ が
 * 前置きとして扱われ，後続の宣言まで消える．
 * @param {string} cssText
 * @returns {string}
 */
function stripToDeclarations(cssText) {
  return stripCssComments(cssText).replace(AT_RULE_PRELUDE, '');
}

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
  const { tags, cssTexts } = splitMarkupAndCss(body);
  const found = [];
  for (const match of tags.matchAll(FONT_FAMILY_ATTRIBUTE)) {
    found.push({ value: decodeXmlEntities(match[1] ?? match[2]).trim(), source: 'attribute' });
  }
  for (const cssText of cssTexts) {
    for (const match of stripToDeclarations(cssText).matchAll(FONT_FAMILY_DECLARATION)) {
      found.push({ value: stripImportant(match[1]), source: 'declaration' });
    }
  }
  return found;
}

/**
 * 書体を root の指定から動かしうる一括指定を集める．対象は 2 つある．
 *
 * 1 つは font の短縮記法である．font-family を含むため root の指定を覆す．
 * 値の並びは省略可能な要素を含み，family だけを取り出す解析は誤りやすい．
 * 図版では font-family と font-size を分けて書く規約とし，短縮記法そのものを
 * 違反として報告する．登録済みのスタックを短縮記法で書いた場合も含む．
 *
 * もう 1 つは all である．CSS Cascade 3 は all を shorthand と定め，
 * direction と unicode-bidi を除く全プロパティを戻すとする．
 * font-family も戻るため，root の指定が効かなくなる．
 *
 * 覆り方は Chromium で実測した．font は <style> の規則も style 属性も
 * root の値を覆す．at-rule に包んでも，2 つ目以降の <style> でも覆る．
 * font 属性だけは無視され，root の値のまま描かれる．
 * all は initial のときだけ覆る．font-family は継承プロパティであり，
 * CSS Cascade 3 が unset を inherit と定めるためである．revert も同様に残る．
 *
 * それでも一律に報告する．値のキーワードで場合分けすると，font の短縮記法で
 * 避けたはずの値の解析へ戻るためである．また font 属性のように誌面が
 * 変わらない場合も，指定したつもりの書体が出ない状態を残さない．
 * root も対象とする．例外にすると同じ抜け道が root に残るためである．
 * @param {string} svgText
 * @returns {Array<{ property: 'font' | 'all', value: string, source: 'attribute' | 'declaration' }>}
 */
export function extractTypefaceOverrides(svgText) {
  const { tags, cssTexts } = splitMarkupAndCss(stripXmlComments(svgText));
  const found = [];
  for (const match of tags.matchAll(FONT_SHORTHAND_ATTRIBUTE)) {
    found.push({
      property: 'font',
      value: decodeXmlEntities(match[1] ?? match[2]).trim(),
      source: 'attribute',
    });
  }
  for (const cssText of cssTexts) {
    for (const match of stripToDeclarations(cssText).matchAll(TYPEFACE_OVERRIDE_DECLARATION)) {
      found.push({
        property: match[1].toLowerCase(),
        value: stripImportant(match[2]),
        source: 'declaration',
      });
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
    const unreadable = findUnreadableMarkup(svgText);
    if (unreadable.length > 0) {
      violations.push(...unreadable.map(item => toUnreadableViolation(file, item)));
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
    for (const { property, value, source } of extractTypefaceOverrides(svgText)) {
      const remedy =
        property === 'font'
          ? 'font-family と font-size を分けて書く'
          : '書体を戻す必要があれば font-family を明示する';
      violations.push({
        type: `${property}-shorthand`,
        file,
        value,
        message: `${file} の ${property} 一括指定「${value}」（${source}）は使わない（${remedy}）`,
      });
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
