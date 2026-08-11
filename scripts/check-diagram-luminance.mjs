#!/usr/bin/env node
/**
 * 図版 SVG の配色規約検証（グレースケール輝度差）
 *
 * src/assets/diagrams/*.svg の fill / stroke / stop-color から色を集める．
 * 有彩色が登録済みの明度段パレット（テーマ基調色 3 段）だけかを検査する．
 * 明度段どうしが Rec.601 輝度で判別可能な間隔を保つことも検査する．
 * グレースケール印刷でも色に頼らず判別できる状態を機械的に守る．
 *
 * 無彩色（グレー系）は検査対象外とする．種別の判別は線の太さ・線種・
 * 文字ラベルが担い，色に依存させない方針のためである．
 * hex へ解釈できない色値と CSS プロパティ形式の色指定は，
 * 検査のすり抜けを防ぐため黙認せず違反として報告する．
 *
 * DIAGRAM_TIER_COLORS・EXCLUDED_FILES は本ごとに差し替える定数として
 * 先頭に集約している．配色替えの本では，この 2 定数と
 * palette.css の --palette-diagram-annotation を合わせて調整する．
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { parseCssVariables, resolveVar } from './check-contrast.mjs';

/** 図版で許可する有彩色（明度段パレット）．暗い順に並べる．本ごとに差し替える． */
export const DIAGRAM_TIER_COLORS = ['#2f5b8c', '#5588bb', '#8cb2d8'];

/**
 * 検査から除外するファイル．本ごとに差し替える．
 * led-circuit.svg はテンプレート同梱のサンプルで，LED 発光表現に実体色
 * （赤）を使う．実物の色をそのまま再現する図は明度段パレットの検査対象に
 * しない方針のため除外する．種別の判別は部品形状・ラベルが担う．
 */
export const EXCLUDED_FILES = ['led-circuit.svg'];

/** 明度段が収まるべき Rec.601 輝度の帯（%）．黒・白との判別を担保する． */
export const MID_BAND = { min: 20, max: 80 };

/** 明度段どうしの最小輝度差（ポイント）． */
export const MIN_SEPARATION = 15;

/** palette.css 側の対応トークン．SVG ハードコード値との乖離を検出する． */
export const ANNOTATION_TOKEN = '--palette-diagram-annotation';

/** 有彩色とみなす RGB チャンネル差の下限．紙色系オフホワイトを除外する． */
const CHROMA_THRESHOLD = 16;

const COLOR_KEYWORDS = new Map([
  ['black', '#000000'],
  ['white', '#ffffff'],
]);

/**
 * hex 色を小文字 6 桁へ正規化する．
 * @param {string} hex #rgb または #rrggbb
 * @returns {string} #rrggbb（小文字）
 */
function normalizeHex(hex) {
  const match = hex.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) {
    throw new Error(`hex 色として解釈できない値: ${hex}`);
  }
  let digits = match[1].toLowerCase();
  if (digits.length === 3) {
    digits = [...digits].map(d => d + d).join('');
  }
  return `#${digits}`;
}

/**
 * hex 色の Rec.601 輝度を百分率で返す．
 * PDF のグレースケール変換に近い単純輝度であり，
 * check-contrast.mjs の WCAG 相対輝度とは意図的に別式を使う．
 * @param {string} hex
 * @returns {number} 0（黒）〜 100（白）
 */
export function rec601Luminance(hex) {
  const digits = normalizeHex(hex).slice(1);
  const r = parseInt(digits.slice(0, 2), 16);
  const g = parseInt(digits.slice(2, 4), 16);
  const b = parseInt(digits.slice(4, 6), 16);
  return ((0.299 * r + 0.587 * g + 0.114 * b) / 255) * 100;
}

/**
 * 有彩色（グレー系以外）かどうかを判定する．
 * @param {string} hex
 * @returns {boolean}
 */
export function isChromatic(hex) {
  const digits = normalizeHex(hex).slice(1);
  const channels = [
    parseInt(digits.slice(0, 2), 16),
    parseInt(digits.slice(2, 4), 16),
    parseInt(digits.slice(4, 6), 16),
  ];
  return Math.max(...channels) - Math.min(...channels) >= CHROMA_THRESHOLD;
}

/**
 * CSS プロパティ形式の色指定（style 属性・style 要素の双方で違反）．
 * CSS プロパティ名は ASCII 大文字小文字を区別しないため i フラグを付ける．
 */
const CSS_COLOR_PROPERTY = /(?:fill|stroke|stop-color)\s*:/i;

/**
 * XML コメントを除去する．コメント内に残る色指定（無効化済みの記述）を
 * 検査対象から除外し，誤検出・誤通過の両方を防ぐ．
 * @param {string} svgText
 * @returns {string}
 */
function stripXmlComments(svgText) {
  // 入れ子・破損したコメント境界（例: `<!-- a <!-- b -->`）では 1 回の
  // 置換では取り残しが生じ得るため，変化がなくなるまで繰り返す．
  // CodeQL js/incomplete-multi-character-sanitization の指摘への対応．
  let text = svgText;
  for (;;) {
    const next = text.replace(/<!--[\s\S]*?-->/g, '');
    if (next === text) {
      return next;
    }
    text = next;
  }
}

/**
 * SVG テキストから fill / stroke / stop-color の値を分類して集める．
 * XML として妥当な表記ゆれ（シングルクォート・= 前後の空白）も受け付ける．
 * none は無視し，black / white キーワードと 3 桁 hex は正規化する．
 * hex へ解釈できない値（CSS 名前色・url() 参照など）は unsupported へ分ける．
 * @param {string} svgText
 * @returns {{ colors: Set<string>, unsupported: string[] }}
 */
function parseColorValues(svgText) {
  const withoutComments = stripXmlComments(svgText);
  const colors = new Set();
  const unsupported = [];
  const attrPattern = /(?:fill|stroke|stop-color)\s*=\s*(?:"([^"]+)"|'([^']+)')/g;
  for (const match of withoutComments.matchAll(attrPattern)) {
    const value = (match[1] ?? match[2]).trim().toLowerCase();
    if (value === 'none') {
      continue;
    }
    if (COLOR_KEYWORDS.has(value)) {
      colors.add(COLOR_KEYWORDS.get(value));
      continue;
    }
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(value)) {
      colors.add(normalizeHex(value));
      continue;
    }
    unsupported.push(value);
  }
  return { colors, unsupported };
}

/**
 * SVG テキストから fill / stroke / stop-color の色を集める．
 * @param {string} svgText
 * @returns {Set<string>} 小文字 6 桁 hex の集合
 */
export function extractSvgColors(svgText) {
  return parseColorValues(svgText).colors;
}

/**
 * 除外リストのうち実在しないファイル名を返す．
 * 図版を改名すると除外リストが古びて検査が素通りするため，その取り残しを拾う．
 * @param {Iterable<string>} realFileNames 実在する図版のファイル名
 * @param {string[]} [excludedFiles] 検査から除外するファイル
 * @returns {string[]}
 */
export function findMissingExcludedFiles(realFileNames, excludedFiles = EXCLUDED_FILES) {
  const names = new Set(realFileNames);
  return excludedFiles.filter(name => !names.has(name));
}

/**
 * 図版 SVG 群と palette.css を配色規約に照らして検査する．
 * @param {Map<string, string>} svgFiles ファイル名 → SVG テキスト
 * @param {string} paletteCss palette.css の内容
 * @param {{ tierColors?: string[], excludedFiles?: string[] }} [options]
 * @returns {Array<{ type: string, file?: string, color?: string, message: string }>}
 */
export function checkDiagramColors(svgFiles, paletteCss, options = {}) {
  const tierColors = (options.tierColors ?? DIAGRAM_TIER_COLORS).map(normalizeHex);
  const excludedFiles = options.excludedFiles ?? EXCLUDED_FILES;
  const violations = [];

  for (const color of tierColors) {
    const luma = rec601Luminance(color);
    if (luma < MID_BAND.min || luma > MID_BAND.max) {
      violations.push({
        type: 'tier-out-of-band',
        color,
        message: `明度段 ${color}（${luma.toFixed(1)}%）が ${MID_BAND.min}〜${MID_BAND.max}% の帯を外れている`,
      });
    }
  }
  const sortedTiers = [...tierColors].sort((a, b) => rec601Luminance(a) - rec601Luminance(b));
  for (let i = 1; i < sortedTiers.length; i += 1) {
    const gap = rec601Luminance(sortedTiers[i]) - rec601Luminance(sortedTiers[i - 1]);
    if (gap < MIN_SEPARATION) {
      violations.push({
        type: 'tier-too-close',
        color: sortedTiers[i],
        message: `明度段 ${sortedTiers[i - 1]} と ${sortedTiers[i]} の輝度差 ${gap.toFixed(1)} ポイントが ${MIN_SEPARATION} 未満`,
      });
    }
  }

  const usedColors = new Set();
  for (const [file, svgText] of svgFiles) {
    const { colors, unsupported } = parseColorValues(svgText);
    for (const color of colors) {
      usedColors.add(color);
    }
    if (excludedFiles.includes(file)) {
      continue;
    }
    for (const value of unsupported) {
      violations.push({
        type: 'unsupported-color-value',
        file,
        color: value,
        message: `${file} の色値 ${value} は hex へ解釈できず検査をすり抜けるため許可しない`,
      });
    }
    if (CSS_COLOR_PROPERTY.test(stripXmlComments(svgText))) {
      violations.push({
        type: 'style-color',
        file,
        message: `${file} に CSS プロパティ形式の色指定がある（fill/stroke/stop-color は属性で書く）`,
      });
    }
    for (const color of colors) {
      if (isChromatic(color) && !tierColors.includes(color)) {
        violations.push({
          type: 'unregistered-chromatic',
          file,
          color,
          message: `${file} の有彩色 ${color} が明度段パレットに登録されていない`,
        });
      }
    }
  }

  const vars = parseCssVariables(paletteCss);
  const tokenValue = normalizeHex(resolveVar(vars, ANNOTATION_TOKEN));
  if (!tierColors.includes(tokenValue)) {
    violations.push({
      type: 'token-mismatch',
      color: tokenValue,
      message: `${ANNOTATION_TOKEN} の値 ${tokenValue} が明度段パレットに含まれていない`,
    });
  } else if (!usedColors.has(tokenValue)) {
    violations.push({
      type: 'token-unused',
      color: tokenValue,
      message: `${ANNOTATION_TOKEN} の値 ${tokenValue} がどの SVG でも使われていない`,
    });
  }

  return violations;
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const diagramsDir = fileURLToPath(new URL('../src/assets/diagrams', import.meta.url));
  const palettePath = fileURLToPath(
    new URL('../config/themes/techbook/palette.css', import.meta.url)
  );
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
    console.log('ok 配色規約の検査対象となる図版がまだない（初期状態のため省略）');
    process.exit(0);
  }
  const violations = checkDiagramColors(files, fs.readFileSync(palettePath, 'utf-8'));
  if (violations.length > 0) {
    for (const v of violations) {
      console.error(`NG ${v.message}`);
    }
    console.error(`図版の配色規約違反が ${violations.length} 件ある`);
    process.exit(1);
  }
  console.log(`ok 図版 SVG ${files.size} 件（除外 ${EXCLUDED_FILES.length} 件を含む）の配色規約を確認した`);
}
