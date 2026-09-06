import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  FONT_TOKEN,
  ALLOWED_EXTRA_FONT_STACKS,
  EXCLUDED_FILES,
  normalizeFontStack,
  extractRootFontFamily,
  extractOtherFontFamilies,
  findMissingExcludedFiles,
  checkDiagramFonts,
} from './check-diagram-fonts.mjs';
import { parseCssVariables, resolveVar } from './check-contrast.mjs';

const THEME_CSS_PATH = fileURLToPath(new URL('../config/themes/techbook/theme.css', import.meta.url));
const DIAGRAMS_DIR = fileURLToPath(new URL('../src/assets/diagrams', import.meta.url));

const GOTHIC = "'Noto Sans CJK JP', 'Noto Sans JP', 'Hiragino Kaku Gothic ProN', 'Yu Gothic', sans-serif";
const THEME_CSS = `:root {\n  ${FONT_TOKEN}: ${GOTHIC};\n}`;
const SERIF = '"Times New Roman", "MS Mincho", serif';

function makeFiles(entries) {
  return new Map(Object.entries(entries));
}

// --- normalizeFontStack ---

test('normalizeFontStack: 引用符・大文字小文字・空白の違いを吸収する', () => {
  const a = normalizeFontStack("'Noto Sans CJK JP','Yu Gothic' ,  sans-serif");
  const b = normalizeFontStack('"noto sans cjk jp", "YU GOTHIC", SANS-SERIF');
  assert.equal(a, b);
  assert.equal(a, 'noto sans cjk jp, yu gothic, sans-serif');
});

test('normalizeFontStack: 空の要素は落とす', () => {
  assert.equal(normalizeFontStack('serif, , '), 'serif');
});

// --- extractRootFontFamily ---

test('extractRootFontFamily: root の <svg> の属性値を返す', () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" font-family="${GOTHIC}"><text>a</text></svg>`;
  assert.equal(extractRootFontFamily(svg), GOTHIC);
});

test('extractRootFontFamily: シングルクォートと = 前後の空白も受け付ける', () => {
  const svg = "<svg font-family = 'serif'><text>a</text></svg>";
  assert.equal(extractRootFontFamily(svg), 'serif');
});

test('extractRootFontFamily: root に無ければ子要素の指定があっても null を返す', () => {
  const svg = '<svg><text font-family="serif">a</text></svg>';
  assert.equal(extractRootFontFamily(svg), null);
});

test('extractRootFontFamily: XML 宣言とコメントの後ろにある root を見つける', () => {
  const svg = `<?xml version="1.0"?>\n<!-- <svg font-family="serif"> -->\n<svg font-family="${GOTHIC}"></svg>`;
  assert.equal(extractRootFontFamily(svg), GOTHIC);
});

// --- extractOtherFontFamilies ---

test('extractOtherFontFamilies: 子要素の属性・style 属性・<style> 要素の宣言を集め，root は含めない', () => {
  const svg = [
    `<svg font-family="${GOTHIC}">`,
    '<style>.serif { font-family: "Times New Roman", serif; font-size: 20px; }</style>',
    '<text font-family="monospace">a</text>',
    "<text style='font-family: Courier; fill: #000'>b</text>",
    '</svg>',
  ].join('\n');
  const found = extractOtherFontFamilies(svg);
  assert.deepEqual(
    found.map(f => [f.source, normalizeFontStack(f.value)]),
    [
      ['attribute', 'monospace'],
      ['declaration', 'times new roman, serif'],
      ['declaration', 'courier'],
    ]
  );
});

test('extractOtherFontFamilies: コメント内の指定は数えない', () => {
  const svg = `<svg font-family="${GOTHIC}"><!-- <text font-family="serif"/> --></svg>`;
  assert.deepEqual(extractOtherFontFamilies(svg), []);
});

// --- checkDiagramFonts（合成データ） ---

test('checkDiagramFonts: root がテーマと一致し，他に指定が無ければ違反なしになる', () => {
  const files = makeFiles({ 'a.svg': `<svg font-family="${GOTHIC}"><text>a</text></svg>` });
  assert.deepEqual(checkDiagramFonts(files, THEME_CSS), []);
});

test('checkDiagramFonts: root の指定が無い図を違反として検出する', () => {
  const files = makeFiles({ 'a.svg': '<svg><text>a</text></svg>' });
  const violations = checkDiagramFonts(files, THEME_CSS);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].type, 'root-font-missing');
  assert.equal(violations[0].file, 'a.svg');
});

test('checkDiagramFonts: root の値がテーマと違う図を違反として検出する', () => {
  const files = makeFiles({ 'a.svg': '<svg font-family="sans-serif"><text>a</text></svg>' });
  const violations = checkDiagramFonts(files, THEME_CSS);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].type, 'root-font-mismatch');
  assert.equal(violations[0].value, 'sans-serif');
});

test('checkDiagramFonts: 引用符や大文字小文字だけが違う root の値は一致とみなす', () => {
  const variant = '"noto sans cjk jp", "Noto Sans JP", "Hiragino Kaku Gothic ProN", "Yu Gothic", SANS-SERIF';
  const files = makeFiles({ 'a.svg': `<svg font-family='${variant}'><text>a</text></svg>` });
  assert.deepEqual(checkDiagramFonts(files, THEME_CSS), []);
});

test('checkDiagramFonts: 登録の無い別スタックを違反として検出する', () => {
  const files = makeFiles({
    'a.svg': `<svg font-family="${GOTHIC}"><style>.serif { font-family: ${SERIF}; }</style></svg>`,
  });
  const violations = checkDiagramFonts(files, THEME_CSS);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].type, 'unregistered-font-stack');
  assert.equal(normalizeFontStack(violations[0].value), normalizeFontStack(SERIF));
});

test('checkDiagramFonts: 登録した別スタックは違反にならない', () => {
  const files = makeFiles({
    'a.svg': `<svg font-family="${GOTHIC}"><style>.serif { font-family: ${SERIF}; }</style></svg>`,
  });
  assert.deepEqual(checkDiagramFonts(files, THEME_CSS, { allowedExtraStacks: [SERIF] }), []);
});

test('checkDiagramFonts: 子要素にテーマと同じスタックを重ねて書いても違反にならない', () => {
  const files = makeFiles({
    'a.svg': `<svg font-family="${GOTHIC}"><text font-family="${GOTHIC}">a</text></svg>`,
  });
  assert.deepEqual(checkDiagramFonts(files, THEME_CSS), []);
});

test('checkDiagramFonts: 除外したファイルは検査しない', () => {
  const files = makeFiles({ 'photo-like.svg': '<svg><text>a</text></svg>' });
  assert.deepEqual(checkDiagramFonts(files, THEME_CSS, { excludedFiles: ['photo-like.svg'] }), []);
});

test('checkDiagramFonts: 1 つの図の複数の違反を漏らさず報告する', () => {
  const files = makeFiles({
    'a.svg': '<svg><text font-family="serif">a</text><text font-family="monospace">b</text></svg>',
  });
  const types = checkDiagramFonts(files, THEME_CSS).map(v => v.type);
  assert.deepEqual(types, ['root-font-missing', 'unregistered-font-stack', 'unregistered-font-stack']);
});

test('checkDiagramFonts: テーマにトークンが無ければ失敗する', () => {
  const files = makeFiles({ 'a.svg': `<svg font-family="${GOTHIC}"></svg>` });
  assert.throws(() => checkDiagramFonts(files, ':root { --font-mincho: serif; }'), new RegExp(FONT_TOKEN));
});

test('ALLOWED_EXTRA_FONT_STACKS と EXCLUDED_FILES の既定は空である', () => {
  assert.deepEqual(ALLOWED_EXTRA_FONT_STACKS, []);
  assert.deepEqual(EXCLUDED_FILES, []);
});

// --- findMissingExcludedFiles ---

test('findMissingExcludedFiles: 実在しない除外名だけを返す', () => {
  assert.deepEqual(findMissingExcludedFiles(['a.svg'], ['a.svg', 'gone.svg']), ['gone.svg']);
});

// --- 実ファイル ---

const realFiles = new Map();
if (fs.existsSync(DIAGRAMS_DIR)) {
  for (const name of fs.readdirSync(DIAGRAMS_DIR)) {
    if (name.endsWith('.svg')) {
      realFiles.set(name, fs.readFileSync(path.join(DIAGRAMS_DIR, name), 'utf-8'));
    }
  }
}
const checkableFileCount = [...realFiles.keys()].filter(name => !EXCLUDED_FILES.includes(name)).length;

test(
  '実ファイル: src/assets/diagrams の全 SVG が図中フォントの規約を満たす',
  { skip: checkableFileCount === 0 ? '図中フォントの検査対象となる図版がまだない初期状態のため省略する' : false },
  () => {
    const css = fs.readFileSync(THEME_CSS_PATH, 'utf-8');
    const violations = checkDiagramFonts(realFiles, css);
    assert.deepEqual(violations, [], violations.map(v => v.message).join('\n'));
  }
);

test(
  '実ファイル: 除外リストのファイルが実在する（改名時の silent pass 防止）',
  { skip: realFiles.size === 0 ? '図版がまだ 1 件も無い初期状態のため省略する' : false },
  () => {
    const missing = findMissingExcludedFiles(realFiles.keys());
    assert.deepEqual(missing, [], `除外リストの ${missing.join('・')} が見つからない`);
  }
);

test('実ファイル: ' + FONT_TOKEN + ' が theme.css で宣言されている', () => {
  const vars = parseCssVariables(fs.readFileSync(THEME_CSS_PATH, 'utf-8'));
  const value = resolveVar(vars, FONT_TOKEN);
  assert.ok(value.includes(','), `${FONT_TOKEN} の値 ${value} がフォントスタックの形をしていない`);
});
