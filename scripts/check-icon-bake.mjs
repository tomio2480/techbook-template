#!/usr/bin/env node
/**
 * 枠アイコンの焼き込み検証（紙入稿用の置き換えとテーマ本体の一致）
 *
 * theme.css は Tips・注釈・注意の枠アイコンを mask で切り抜き，
 * opacity で薄く敷く．紙入稿用 PDF は透明効果を持てないため，
 * print.css が合成後の色を焼いた線画へ置き換える
 * （docs/spec/print-layout.md）．
 *
 * 同じ線画が 2 か所に並ぶため，片方だけを直すと誌面が食い違う．
 * 電子書籍用と紙用で絵柄が変わっても，どちらも組み上がるだけで
 * 誰も気づかない．本スクリプトは 2 点を機械で確かめる．
 *
 * - 線画の形（色を除いた中身）が theme.css と print.css で一致する．
 * - 焼いた色が，意味トークンの色を枠の地色へ opacity で重ねた値に近い．
 *
 * 基調色を差し替えた本では焼き直しが要る．検査はその漏れを止める．
 *
 * 色は完全一致では見ない．Chromium の合成は単純な四捨五入と食い違い，
 * 実測値が計算値から 1 階調ずれることがある（docs/spec/print-layout.md）．
 * 焼く色は実測で決める方針のため，検査は焼き忘れを捉える幅で判定する．
 */

import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { parseCssVariables, resolveVar } from './check-contrast.mjs';

/** 検査する枠の種別．theme.css の --<種別>-icon と対応する． */
export const BOX_TYPES = ['tips', 'note', 'caution'];

/**
 * 焼いた色と計算値のあいだで許すチャンネルごとの差（階調）．
 * 実測と計算のずれは 1 階調にとどまる一方，焼き忘れは桁違いに大きい．
 * 2 まで許せば，実測の値を退けずに焼き忘れだけを捉えられる．
 */
export const COLOR_TOLERANCE = 2;

/**
 * 枠の地色．theme.css の .tips・.note・.caution が持つ background である．
 * 紙の白と同じ値をリテラルで運用する方針のためトークン化されておらず，
 * ここでも同じ値を持つ（palette.css の冒頭を参照）．
 */
export const BOX_BACKGROUND = '#ffffff';

/** アイコンの不透明度を書いてある規則の目印． */
const ICON_RULE_PATTERN = /\.tips::after[^{]*\{([^}]*)\}/;
const OPACITY_PATTERN = /opacity:\s*([\d.]+)/;

const DATA_URI_PATTERN = /url\(\s*"data:image\/svg\+xml,([^"]*)"\s*\)/;
const HEX_COLOR_PATTERN = /#[0-9a-f]{3}(?:[0-9a-f]{3})?/gi;

/**
 * hex 色を小文字 6 桁へ正規化する．
 * @param {string} hex #rgb または #rrggbb
 * @returns {string} #rrggbb（小文字）
 */
export function normalizeHex(hex) {
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

function channels(hex) {
  const digits = normalizeHex(hex).slice(1);
  return [0, 2, 4].map(at => parseInt(digits.slice(at, at + 2), 16));
}

/**
 * 前景を背景へ不透明度 alpha で重ねた色を求める．
 * @param {string} foreground 前景の hex 色
 * @param {string} background 背景の hex 色
 * @param {number} alpha 0〜1 の不透明度
 * @returns {string} 合成後の hex 色（小文字 6 桁）
 */
export function bakeColor(foreground, background, alpha) {
  const front = channels(foreground);
  const back = channels(background);
  const mixed = front.map((value, i) => Math.round(value * alpha + back[i] * (1 - alpha)));
  return `#${mixed.map(value => value.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * 2 色のあいだで最も大きいチャンネルの差を返す．
 * @param {string} left hex 色
 * @param {string} right hex 色
 * @returns {number} 0〜255 の差
 */
export function channelGap(left, right) {
  const a = channels(left);
  const b = channels(right);
  return Math.max(...a.map((value, i) => Math.abs(value - b[i])));
}

/**
 * theme.css からアイコンの不透明度を読む．
 * @param {string} themeCss theme.css の中身
 * @returns {number} 0〜1 の不透明度
 */
export function extractIconOpacity(themeCss) {
  const rule = themeCss.match(ICON_RULE_PATTERN);
  if (!rule) {
    throw new Error('theme.css に枠アイコンの ::after 規則が見つからない');
  }
  const opacity = rule[1].match(OPACITY_PATTERN);
  if (!opacity) {
    throw new Error('枠アイコンの ::after 規則に opacity が見つからない');
  }
  return Number(opacity[1]);
}

/**
 * CSS 変数の値から SVG の中身を取り出す．
 * @param {string} value url("data:image/svg+xml,...") 形式の値
 * @returns {string} percent-encoding を戻した SVG
 */
export function decodeIconSvg(value) {
  const match = value.match(DATA_URI_PATTERN);
  if (!match) {
    throw new Error(`データ URI の SVG として読めない値: ${value.slice(0, 40)}`);
  }
  return decodeURIComponent(match[1]);
}

/**
 * 形の比較のため色の指定を伏せる．
 * @param {string} svg SVG の中身
 * @returns {string} 色を伏せた SVG
 */
export function stripColors(svg) {
  return svg.replace(HEX_COLOR_PATTERN, '#');
}

/**
 * SVG が使っている色を集める．
 * @param {string} svg SVG の中身
 * @returns {Array<string>} 小文字 6 桁の hex 色（重複なし）
 */
export function extractColors(svg) {
  return [...new Set((svg.match(HEX_COLOR_PATTERN) ?? []).map(normalizeHex))];
}

/**
 * 焼き込みの整合性を検査する．
 * @param {string} themeCss theme.css の中身
 * @param {string} printCss print.css の中身
 * @param {string} paletteCss palette.css の中身
 * @returns {Array<object>} 違反の一覧．問題が無ければ空
 */
export function checkIconBake(themeCss, printCss, paletteCss) {
  const violations = [];
  const opacity = extractIconOpacity(themeCss);
  const themeVars = parseCssVariables(themeCss);
  const printVars = parseCssVariables(printCss);
  const paletteVars = parseCssVariables(paletteCss);

  for (const type of BOX_TYPES) {
    const sourceName = `--${type}-icon`;
    const bakedName = `--${type}-icon-baked`;

    if (!themeVars.has(sourceName)) {
      violations.push({
        type: 'missing-source',
        box: type,
        message: `theme.css に ${sourceName} が無い`,
      });
      continue;
    }
    if (!printVars.has(bakedName)) {
      violations.push({
        type: 'missing-baked',
        box: type,
        message: `print.css に ${bakedName} が無い（紙用の置き換えが漏れている）`,
      });
      continue;
    }

    const source = decodeIconSvg(themeVars.get(sourceName));
    const baked = decodeIconSvg(printVars.get(bakedName));

    if (stripColors(source) !== stripColors(baked)) {
      violations.push({
        type: 'shape-mismatch',
        box: type,
        message: `${sourceName} と ${bakedName} の線画が食い違う（色を除いた中身が一致しない）`,
      });
    }

    const accent = normalizeHex(resolveVar(paletteVars, `--${type}-accent`));
    const expected = bakeColor(accent, BOX_BACKGROUND, opacity);
    const used = extractColors(baked);

    for (const color of used) {
      const gap = channelGap(color, expected);
      if (gap > COLOR_TOLERANCE) {
        violations.push({
          type: 'color-mismatch',
          box: type,
          color,
          message:
            `${bakedName} の色 ${color} が焼き込みの計算値 ${expected} から ${gap} 階調離れている` +
            `（${accent} を ${BOX_BACKGROUND} へ不透明度 ${opacity} で重ねた値．` +
            `許容は ${COLOR_TOLERANCE} 階調．実測して焼き直すこと）`,
        });
      }
    }
  }

  return violations;
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const read = name =>
    fs.readFileSync(fileURLToPath(new URL(`../config/themes/techbook/${name}`, import.meta.url)), 'utf-8');
  const violations = checkIconBake(read('theme.css'), read('print.css'), read('palette.css'));
  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(`NG ${violation.message}`);
    }
    console.error(`枠アイコンの焼き込みに ${violations.length} 件の食い違いがある`);
    process.exit(1);
  }
  console.log(`ok 枠アイコン ${BOX_TYPES.length} 種の焼き込みが theme.css と一致している`);
}
