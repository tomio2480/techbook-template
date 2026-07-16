#!/usr/bin/env node
/**
 * palette.css のシンタックス色コントラスト検証
 *
 * config/themes/techbook/palette.css の --palette-code-* が，
 * コードブロック背景 --code-bg（既定 var(--palette-primary-light)）に対し
 * WCAG コントラスト比 4.5:1 以上を満たすことを機械計算で確認する．
 * CSS 変数はテキストパースで解決し，var() 参照は末端の hex 値まで辿る．
 * 前提の明文化は palette.css 冒頭コメントと README
 * 「配色（カラーパレット）の変更」節を参照．
 */

import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';

export const WCAG_AA_CONTRAST = 4.5;

const CODE_TOKEN_PREFIX = '--palette-code-';
const CODE_BG_TOKEN = '--code-bg';

/**
 * CSS テキストからカスタムプロパティ宣言を抽出する．
 * @param {string} cssText
 * @returns {Map<string, string>} 変数名 → 値（未解決のまま）
 */
export function parseCssVariables(cssText) {
  const withoutComments = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  const vars = new Map();
  for (const match of withoutComments.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)) {
    vars.set(match[1], match[2].trim());
  }
  return vars;
}

/**
 * var() 参照を辿り，トークンを末端の値へ解決する．
 * @param {Map<string, string>} vars parseCssVariables の結果
 * @param {string} name 解決するトークン名
 * @returns {string} 解決済みの値
 */
export function resolveVar(vars, name, seen = new Set()) {
  if (seen.has(name)) {
    throw new Error(`CSS 変数の循環参照を検出した: ${[...seen, name].join(' -> ')}`);
  }
  if (!vars.has(name)) {
    throw new Error(`CSS 変数 ${name} が定義されていない`);
  }
  seen.add(name);
  const value = vars.get(name);
  const ref = value.match(/^var\((--[\w-]+)\)$/);
  return ref ? resolveVar(vars, ref[1], seen) : value;
}

/**
 * hex 色（#rgb / #rrggbb）を 0〜255 の RGB へ変換する．
 * @param {string} hex
 * @returns {{ r: number, g: number, b: number }}
 */
function hexToRgb(hex) {
  const match = hex.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) {
    throw new Error(`hex 色として解釈できない値: ${hex}`);
  }
  let digits = match[1];
  if (digits.length === 3) {
    digits = [...digits].map(d => d + d).join('');
  }
  return {
    r: parseInt(digits.slice(0, 2), 16),
    g: parseInt(digits.slice(2, 4), 16),
    b: parseInt(digits.slice(4, 6), 16),
  };
}

/**
 * WCAG の相対輝度を計算する．
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 * @param {{ r: number, g: number, b: number }} rgb
 * @returns {number} 0（黒）〜 1（白）
 */
function relativeLuminance({ r, g, b }) {
  const [rs, gs, bs] = [r, g, b].map(channel => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * 2 色の WCAG コントラスト比を計算する．
 * @param {string} hexA
 * @param {string} hexB
 * @returns {number} 1〜21
 */
export function contrastRatio(hexA, hexB) {
  const la = relativeLuminance(hexToRgb(hexA));
  const lb = relativeLuminance(hexToRgb(hexB));
  const [lighter, darker] = la >= lb ? [la, lb] : [lb, la];
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * CSS テキスト中の全 --palette-code-* を --code-bg と照合する．
 * @param {string} cssText palette.css の内容
 * @returns {Array<{ token: string, color: string, background: string, ratio: number, ok: boolean }>}
 */
export function checkCodeContrast(cssText) {
  const vars = parseCssVariables(cssText);
  if (!vars.has(CODE_BG_TOKEN)) {
    throw new Error(`背景トークン ${CODE_BG_TOKEN} が定義されていない`);
  }
  const background = resolveVar(vars, CODE_BG_TOKEN);
  const codeTokens = [...vars.keys()].filter(name => name.startsWith(CODE_TOKEN_PREFIX));
  if (codeTokens.length === 0) {
    throw new Error(`${CODE_TOKEN_PREFIX}* のトークンが 1 件も見つからない`);
  }
  return codeTokens.map(token => {
    const color = resolveVar(vars, token);
    const ratio = contrastRatio(color, background);
    return { token, color, background, ratio, ok: ratio >= WCAG_AA_CONTRAST };
  });
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const palettePath = fileURLToPath(
    new URL('../config/themes/techbook/palette.css', import.meta.url)
  );
  const results = checkCodeContrast(fs.readFileSync(palettePath, 'utf-8'));
  for (const r of results) {
    const mark = r.ok ? 'ok' : 'NG';
    console.log(`${mark} ${r.token}: ${r.color} on ${r.background} = ${r.ratio.toFixed(2)}:1`);
  }
  const violations = results.filter(r => !r.ok);
  if (violations.length > 0) {
    console.error(`コントラスト比 ${WCAG_AA_CONTRAST}:1 未満のトークンが ${violations.length} 件ある`);
    process.exit(1);
  }
}
