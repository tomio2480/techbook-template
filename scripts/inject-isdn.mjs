/**
 * ISDN の発行情報（config/isdn.yaml の issued 節）を誌面へ流し込む
 * rehype プラグイン．マーカーは単独の段落として書かれた次の 2 つに限る．
 *
 * - `{{isdn}}`: 奥付（99-colophon.md）へ番号を単独段落で出力する
 * - `{{isdn-barcode}}`: 裏表紙（back-cover.md）へバーコード画像を配置する
 *
 * データが無い・不正な場合はマーカーを取り除いたうえで警告を出す．
 * 出版物にマーカー文字列が残る事故を防ぐためである．
 * 文章中に埋め込まれた同じ文字列は置き換え対象にしない．
 * マーカー置換の方式は scripts/inject-colophon.mjs に合わせている．
 */

import { validateIsdnNumber } from './check-isdn.mjs';

const ISDN_MARKER = '{{isdn}}';
const BARCODE_MARKER = '{{isdn-barcode}}';

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function el(tagName, properties, children) {
  return { type: 'element', tagName, properties, children };
}

function text(value) {
  return { type: 'text', value };
}

/**
 * 奥付へ出す ISDN 番号の段落を組み立てる．
 * 番号が無い・不正な場合は警告して null を返す．
 * @param {unknown} number config/isdn.yaml の issued.number
 * @param {(message: string) => void} warn
 */
export function buildIsdnSection(number, warn = console.warn) {
  if (!isNonEmptyString(number) && typeof number !== 'number') {
    warn('config/isdn.yaml: issued.number が未設定のため奥付へ ISDN を出力しない');
    return null;
  }
  const problems = validateIsdnNumber(number);
  if (problems.length > 0) {
    warn(`config/isdn.yaml: ${problems[0]}．奥付へ ISDN を出力しない`);
    return null;
  }
  return el('p', { className: ['colophon-isdn'] }, [text(String(number).trim())]);
}

/**
 * 裏表紙へ置くバーコードブロックを組み立てる．
 * 画像が無い場合は警告して null を返す．
 * 番号が無効でも画像があれば配置する．画像自体が受領物の正であるため．
 * @param {unknown} number config/isdn.yaml の issued.number
 * @param {{ src: string, exists: boolean }} barcode 画像の参照情報
 * @param {(message: string) => void} warn
 */
export function buildIsdnBarcodeSection(number, barcode, warn = console.warn) {
  if (!barcode || barcode.exists !== true || !isNonEmptyString(barcode.src)) {
    warn('ISDN バーコード画像が無いため裏表紙へ配置しない．受領した画像を issued.barcode のパスへ置く');
    return null;
  }
  const isValidNumber =
    (isNonEmptyString(number) || typeof number === 'number') &&
    validateIsdnNumber(number).length === 0;
  const alt = isValidNumber ? `ISDN バーコード（${String(number).trim()}）` : 'ISDN バーコード';
  return el('div', { className: ['isdn-barcode'] }, [
    el('img', { src: barcode.src, alt }, []),
  ]);
}

/**
 * 単独段落のマーカーを判定する．空白だけのテキストノードは無視する．
 * @param {Record<string, unknown>} node
 * @returns {string | null} マーカー文字列（該当しなければ null）
 */
function markerOf(node) {
  if (!node || node.type !== 'element' || node.tagName !== 'p') {
    return null;
  }
  const meaningful = (node.children ?? []).filter(
    (child) => !(child.type === 'text' && child.value.trim() === ''),
  );
  if (meaningful.length !== 1 || meaningful[0].type !== 'text') {
    return null;
  }
  const value = meaningful[0].value.trim();
  return value === ISDN_MARKER || value === BARCODE_MARKER ? value : null;
}

/**
 * プラグイン本体．vivliostyle.config.js の documentProcessor から
 * `.use(injectIsdnPlugin, { number, barcode })` の形で組み込む．
 * @param {{ number?: unknown, barcode?: { src: string, exists: boolean }, warn?: (m: string) => void }} options
 */
export function injectIsdnPlugin(options = {}) {
  const warn = options.warn ?? console.warn;
  return (tree) => {
    const builders = {
      [ISDN_MARKER]: () => buildIsdnSection(options.number, warn),
      [BARCODE_MARKER]: () => buildIsdnBarcodeSection(options.number, options.barcode, warn),
    };
    const visit = (node) => {
      if (!node || !Array.isArray(node.children)) {
        return;
      }
      node.children = node.children.flatMap((child) => {
        const marker = markerOf(child);
        if (marker !== null) {
          const replacement = builders[marker]();
          return replacement === null ? [] : [replacement];
        }
        visit(child);
        return [child];
      });
    };
    visit(tree);
  };
}
