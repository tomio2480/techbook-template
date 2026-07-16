#!/usr/bin/env node
/**
 * theme.css のハードストップ透過グラデーション検出
 *
 * config/themes/techbook/theme.css の linear-gradient() について，
 * 隣接する 2 つの色停止（stop）が同一位置を持ち，かつ一方が
 * transparent であるパターン（ハードストップ透過）を検出する．
 * このパターンは Edge / PDFium でレンダリングが不安定になるため，
 * clip-path や単色疑似要素へ置き換える必要がある（Issue #32）．
 */

import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';

const ANGLE_OR_DIRECTION = /^(-?\d+(\.\d+)?deg|to\s+(top|bottom|left|right)(\s+(top|bottom|left|right))?)$/i;
const POSITION_PATTERN = /^-?\d+(\.\d+)?(%|px|pt|em|rem|vw|vh|cm|mm|in|pc|q)$/i;

/**
 * 文字列を，深さ 0 のカンマでのみ分割する．
 * var(...) や rgba(...) 等の内側のカンマでは分割しない．
 * @param {string} str
 * @returns {string[]}
 */
function splitTopLevel(str) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of str) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim() !== '') {
    parts.push(current.trim());
  }
  return parts;
}

/**
 * CSS テキストから linear-gradient() の引数部分をすべて抽出する．
 * 括弧の対応を数えることで，var(...) 等の入れ子括弧を含む
 * linear-gradient() も正しく切り出す．
 * @param {string} cssText
 * @returns {string[]} 各 linear-gradient() の括弧内の文字列（引数部分）
 */
export function extractLinearGradients(cssText) {
  const withoutComments = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  const marker = 'linear-gradient(';
  const results = [];
  let searchFrom = 0;
  while (true) {
    const start = withoutComments.indexOf(marker, searchFrom);
    if (start === -1) break;
    const argsStart = start + marker.length;
    let depth = 1;
    let i = argsStart;
    for (; i < withoutComments.length; i++) {
      const ch = withoutComments[i];
      if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth === 0) break;
      }
    }
    results.push(withoutComments.slice(argsStart, i));
    searchFrom = i + 1;
  }
  return results;
}

/**
 * linear-gradient() の引数文字列を色停止（stop）の配列へ分解する．
 * 先頭が角度（例: 225deg）や方向（例: to right）の場合は除外する．
 * @param {string} argsStr linear-gradient() 括弧内の文字列
 * @returns {Array<{ color: string, position: string | null }>}
 */
export function parseGradientStops(argsStr) {
  const parts = splitTopLevel(argsStr);
  const stopParts = parts.length > 0 && ANGLE_OR_DIRECTION.test(parts[0]) ? parts.slice(1) : parts;
  return stopParts.map(part => {
    const tokens = part.split(/\s+/).filter(Boolean);
    const last = tokens[tokens.length - 1];
    if (tokens.length > 1 && POSITION_PATTERN.test(last)) {
      return { color: tokens.slice(0, -1).join(' '), position: last };
    }
    return { color: tokens.join(' '), position: null };
  });
}

/**
 * 色停止の配列に「ハードストップ透過」があるかを判定する．
 * 隣接する 2 つの stop が同一位置を持ち，かつ一方が transparent の場合に真．
 * @param {Array<{ color: string, position: string | null }>} stops
 * @returns {boolean}
 */
export function hasAdjacentHardStopTransparency(stops) {
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (a.position === null || b.position === null) continue;
    if (a.position !== b.position) continue;
    if (a.color === 'transparent' || b.color === 'transparent') {
      return true;
    }
  }
  return false;
}

/**
 * CSS テキスト中の全 linear-gradient() をハードストップ透過について検査する．
 * @param {string} cssText 検査対象の CSS
 * @returns {Array<{ gradient: string, stops: Array<{ color: string, position: string | null }> }>}
 */
export function checkGradientHardStops(cssText) {
  const gradients = extractLinearGradients(cssText);
  const violations = [];
  for (const args of gradients) {
    const stops = parseGradientStops(args);
    if (hasAdjacentHardStopTransparency(stops)) {
      violations.push({ gradient: `linear-gradient(${args})`, stops });
    }
  }
  return violations;
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const themePath = fileURLToPath(
    new URL('../config/themes/techbook/theme.css', import.meta.url)
  );
  const violations = checkGradientHardStops(fs.readFileSync(themePath, 'utf-8'));
  if (violations.length > 0) {
    for (const v of violations) {
      console.error(`NG ${v.gradient}`);
    }
    console.error(`ハードストップ透過グラデーションが ${violations.length} 件ある`);
    process.exit(1);
  }
  console.log('ok ハードストップ透過グラデーションは検出されなかった');
}
