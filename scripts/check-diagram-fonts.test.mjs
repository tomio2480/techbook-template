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
  splitFontStack,
  decodeXmlEntities,
  extractRootFontFamily,
  extractOtherFontFamilies,
  extractTypefaceOverrides,
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

test('normalizeFontStack: 引用符の中のカンマは区切りにしない', () => {
  assert.equal(normalizeFontStack('"A,B", serif'), 'a,b, serif');
  assert.notEqual(normalizeFontStack('"A,B", serif'), normalizeFontStack('A, B, serif'));
});

test('splitFontStack: バックスラッシュのエスケープを外す', () => {
  assert.deepEqual(splitFontStack('"Foo \\"Bar\\"", serif'), ['Foo "Bar"', 'serif']);
});

test('splitFontStack: CSS の 16 進エスケープを復号し，終端の空白を飲み込む', () => {
  assert.deepEqual(splitFontStack('"A\\2c B", serif'), ['A,B', 'serif']);
  assert.deepEqual(splitFontStack('"A\\2c  B", serif'), ['A, B', 'serif']);
  assert.notEqual(normalizeFontStack('"A\\2c B", serif'), normalizeFontStack('"A2c B", serif'));
});

test('extractRootFontFamily: 属性値の中の > を開始タグの終端にしない', () => {
  const svg = `<svg aria-label="input > output" font-family="${GOTHIC}"><text>a</text></svg>`;
  assert.equal(extractRootFontFamily(svg), GOTHIC);
});

test('extractOtherFontFamilies: !important は値から切り離す', () => {
  const svg = `<svg font-family="${GOTHIC}"><style>text { font-family: ${GOTHIC} !important; }</style></svg>`;
  assert.deepEqual(extractOtherFontFamilies(svg).map(f => normalizeFontStack(f.value)), [normalizeFontStack(GOTHIC)]);
});

test('extractOtherFontFamilies: CSS コメントで無効化したセレクタを属性と誤認しない', () => {
  const svg = `<svg font-family="${GOTHIC}"><style>/* text[font-family="serif"] {} */</style><text>a</text></svg>`;
  assert.deepEqual(extractOtherFontFamilies(svg), []);
});

test('decodeXmlEntities: 名前付き・10 進・16 進の実体参照を復号する', () => {
  assert.equal(decodeXmlEntities('&quot;A&quot; &amp; &#39;B&#x27;'), '"A" & \'B\'');
  assert.equal(decodeXmlEntities('&unknown;'), '&unknown;');
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

test('extractOtherFontFamilies: CSS コメントで無効化した宣言は数えない', () => {
  const svg = `<svg font-family="${GOTHIC}"><style>/* .old { font-family: serif; } */ .a { fill: #000; }</style></svg>`;
  assert.deepEqual(extractOtherFontFamilies(svg), []);
});

test('extractOtherFontFamilies: root の style 属性の宣言は検査対象に含める', () => {
  const svg = `<svg font-family="${GOTHIC}" style="font-family: serif"><text>a</text></svg>`;
  assert.deepEqual(extractOtherFontFamilies(svg).map(f => [f.source, f.value]), [['declaration', 'serif']]);
});

test('extractOtherFontFamilies: data-font-family などの別属性は数えない', () => {
  const svg = `<svg font-family="${GOTHIC}"><text data-font-family="serif" xml:font-family="serif">a</text></svg>`;
  assert.deepEqual(extractOtherFontFamilies(svg), []);
});

test('extractOtherFontFamilies: style 属性の実体参照を復号する', () => {
  const svg = `<svg font-family="${GOTHIC}"><text style="font-family: &quot;Times New Roman&quot;, serif">a</text></svg>`;
  assert.deepEqual(extractOtherFontFamilies(svg).map(f => f.value), ['"Times New Roman", serif']);
});

test('extractRootFontFamily: data-font-family しか無い root は未指定として扱う', () => {
  const svg = `<svg data-font-family="${GOTHIC}"><text>a</text></svg>`;
  assert.equal(extractRootFontFamily(svg), null);
});

test('extractOtherFontFamilies: 本文の文字列に現れる属性を誤認しない', () => {
  const attr = `<svg font-family="${GOTHIC}"><text>ここへ font-family="serif" と書く</text></svg>`;
  assert.deepEqual(extractOtherFontFamilies(attr), []);
  const style = `<svg font-family="${GOTHIC}"><text>ここへ style="font-family: serif" と書く</text></svg>`;
  assert.deepEqual(extractOtherFontFamilies(style), []);
});

test('extractOtherFontFamilies: font shorthand は font-family として集めない', () => {
  const svg = `<svg font-family="${GOTHIC}"><text style="font: 20px Courier">a</text></svg>`;
  assert.deepEqual(extractOtherFontFamilies(svg), []);
});

// --- extractTypefaceOverrides ---

test('extractTypefaceOverrides: <style> 要素・style 属性・font 属性の shorthand を集める', () => {
  const svg = [
    `<svg font-family="${GOTHIC}">`,
    '<style>.label { font: 20px Courier; }</style>',
    '<text style="font: italic 12px Papyrus">a</text>',
    '<text font="20px Impact">b</text>',
    '</svg>',
  ].join('\n');
  assert.deepEqual(
    extractTypefaceOverrides(svg).map(f => [f.property, f.source, f.value]),
    [
      ['font', 'attribute', '20px Impact'],
      ['font', 'declaration', '20px Courier'],
      ['font', 'declaration', 'italic 12px Papyrus'],
    ]
  );
});

test('extractTypefaceOverrides: root の font 属性も集める', () => {
  const svg = '<svg font="20px Impact"><text>a</text></svg>';
  assert.deepEqual(
    extractTypefaceOverrides(svg).map(f => [f.property, f.source, f.value]),
    [['font', 'attribute', '20px Impact']]
  );
});

test('extractTypefaceOverrides: at-rule に包んだ font 宣言も集める', () => {
  const svg = `<svg font-family="${GOTHIC}"><style>@media screen { .label { font: 20px Courier; } }</style></svg>`;
  assert.deepEqual(
    extractTypefaceOverrides(svg).map(f => [f.property, f.value]),
    [['font', '20px Courier']]
  );
});

test('extractTypefaceOverrides: 2 つ目以降の <style> 要素の中身も集める', () => {
  const svg = [
    `<svg font-family="${GOTHIC}">`,
    '<style>.a { fill: #000; }</style>',
    '<style>.b { font: 20px Impact; }</style>',
    '</svg>',
  ].join('\n');
  assert.deepEqual(
    extractTypefaceOverrides(svg).map(f => [f.property, f.value]),
    [['font', '20px Impact']]
  );
});

test('extractTypefaceOverrides: all の一括指定を集める', () => {
  const svg = [
    `<svg font-family="${GOTHIC}">`,
    '<style>.reset { all: initial; }</style>',
    '<text style="all: initial">a</text>',
    '</svg>',
  ].join('\n');
  assert.deepEqual(
    extractTypefaceOverrides(svg).map(f => [f.property, f.source, f.value]),
    [
      ['all', 'declaration', 'initial'],
      ['all', 'declaration', 'initial'],
    ]
  );
});

test('extractTypefaceOverrides: 誌面の書体が変わらない値でも all を集める', () => {
  /* unset と revert は，font-family が継承プロパティのため root の値を残す．
     それでも集める．値で場合分けすると，font の短縮記法で避けた値の解析へ戻る */
  const svg = [
    `<svg font-family="${GOTHIC}">`,
    '<style>.a { all: unset; }</style>',
    '<text style="all: revert">a</text>',
    '</svg>',
  ].join('\n');
  assert.deepEqual(
    extractTypefaceOverrides(svg).map(f => [f.property, f.value]),
    [
      ['all', 'unset'],
      ['all', 'revert'],
    ]
  );
});

test('extractTypefaceOverrides: 本文の文字列に現れる font= を属性と誤認しない', () => {
  const svg = `<svg font-family="${GOTHIC}"><text>ここへ font="20px Impact" と書く</text></svg>`;
  assert.deepEqual(extractTypefaceOverrides(svg), []);
});

test('extractTypefaceOverrides: at-rule の条件部を宣言と誤認しない', () => {
  const svg = [
    `<svg font-family="${GOTHIC}">`,
    '<style>@supports (all: initial) { .l { fill: black; } }</style>',
    '<style>@supports (font: menu) { .l { fill: black; } }</style>',
    '</svg>',
  ].join('\n');
  assert.deepEqual(extractTypefaceOverrides(svg), []);
});

test('extractTypefaceOverrides: コメント内の @ で後続の宣言が消えない', () => {
  /* at-rule の前置きを外す前に，CSS コメントを外す順序であることを固定する．
     逆順にすると，コメント内の @ が前置きとして後続の宣言まで飲み込む．
     style 属性には { も ; も無いため，前置きの走査が値の末尾まで届く */
  const svg = `<svg font-family="${GOTHIC}"><text style="/* @media の話 */ font: 20px Courier">a</text></svg>`;
  assert.deepEqual(
    extractTypefaceOverrides(svg).map(f => [f.property, f.value]),
    [['font', '20px Courier']]
  );
});

test('extractTypefaceOverrides: 条件部を外してもブロックの中身は拾う', () => {
  const svg = [
    `<svg font-family="${GOTHIC}">`,
    '<style>@media screen and (min-width: 30em) { .l { font: 20px Courier; } }</style>',
    '</svg>',
  ].join('\n');
  assert.deepEqual(
    extractTypefaceOverrides(svg).map(f => [f.property, f.value]),
    [['font', '20px Courier']]
  );
});

test('extractTypefaceOverrides: 値としての all は拾わない', () => {
  const svg = [
    `<svg font-family="${GOTHIC}">`,
    '<style>.a { transition: all 0.3s; transition-property: all; cursor: all-scroll; }</style>',
    '<style>.b { overall: 1; }</style>',
    '</svg>',
  ].join('\n');
  assert.deepEqual(extractTypefaceOverrides(svg), []);
});

test('extractTypefaceOverrides: all は属性としては拾わない', () => {
  const svg = `<svg font-family="${GOTHIC}"><text all="initial">a</text></svg>`;
  assert.deepEqual(extractTypefaceOverrides(svg), []);
});

test('extractTypefaceOverrides: font-family・font-size などの個別プロパティは拾わない', () => {
  const svg = [
    `<svg font-family="${GOTHIC}">`,
    '<style>.label { font-family: serif; font-size: 20px; font-weight: bold; }</style>',
    `<text font-family="${GOTHIC}" font-size="12">a</text>`,
    '</svg>',
  ].join('\n');
  assert.deepEqual(extractTypefaceOverrides(svg), []);
});

test('extractTypefaceOverrides: data-font などの別属性は拾わない', () => {
  const svg = `<svg font-family="${GOTHIC}"><text data-font="20px Impact" xml:font="20px Impact">a</text></svg>`;
  assert.deepEqual(extractTypefaceOverrides(svg), []);
});

test('extractTypefaceOverrides: XML コメント・CSS コメントで無効化した指定は拾わない', () => {
  const commented = `<svg font-family="${GOTHIC}"><!-- <text font="20px Impact"/> --></svg>`;
  assert.deepEqual(extractTypefaceOverrides(commented), []);
  const cssCommented = `<svg font-family="${GOTHIC}"><style>/* .label { font: 20px Courier; all: initial; } */</style></svg>`;
  assert.deepEqual(extractTypefaceOverrides(cssCommented), []);
});

test('extractTypefaceOverrides: !important と実体参照を外して値を返す', () => {
  const svg = `<svg font-family="${GOTHIC}"><text style="font: 12px &quot;MS Mincho&quot; !important">a</text></svg>`;
  assert.deepEqual(extractTypefaceOverrides(svg).map(f => f.value), ['12px "MS Mincho"']);
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

test('checkDiagramFonts: root の inline style がテーマと違えば違反として検出する', () => {
  const files = makeFiles({ 'a.svg': `<svg font-family="${GOTHIC}" style="font-family: serif"><text>a</text></svg>` });
  const violations = checkDiagramFonts(files, THEME_CSS);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].type, 'unregistered-font-stack');
});

test('checkDiagramFonts: 実体参照で書いた登録済みスタックは違反にならない', () => {
  const files = makeFiles({
    'a.svg': `<svg font-family="${GOTHIC}"><text style="font-family: &quot;Times New Roman&quot;, &quot;MS Mincho&quot;, serif">a</text></svg>`,
  });
  assert.deepEqual(checkDiagramFonts(files, THEME_CSS, { allowedExtraStacks: [SERIF] }), []);
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

test('checkDiagramFonts: <style> 要素の font shorthand を違反として検出する', () => {
  const files = makeFiles({
    'a.svg': `<svg font-family="${GOTHIC}"><style>.label { font: 20px Courier; }</style></svg>`,
  });
  const violations = checkDiagramFonts(files, THEME_CSS);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].type, 'font-shorthand');
  assert.equal(violations[0].value, '20px Courier');
});

test('checkDiagramFonts: style 属性の font shorthand を違反として検出する', () => {
  const files = makeFiles({
    'a.svg': `<svg font-family="${GOTHIC}"><text style="font: italic 12px Papyrus">a</text></svg>`,
  });
  const violations = checkDiagramFonts(files, THEME_CSS);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].type, 'font-shorthand');
});

test('checkDiagramFonts: 子要素と root の font 属性の shorthand を違反として検出する', () => {
  const child = makeFiles({ 'a.svg': `<svg font-family="${GOTHIC}"><text font="20px Impact">a</text></svg>` });
  assert.deepEqual(
    checkDiagramFonts(child, THEME_CSS).map(v => v.type),
    ['font-shorthand']
  );
  const root = makeFiles({ 'b.svg': `<svg font-family="${GOTHIC}" font="20px Impact"><text>a</text></svg>` });
  assert.deepEqual(
    checkDiagramFonts(root, THEME_CSS).map(v => v.type),
    ['font-shorthand']
  );
});

test('checkDiagramFonts: 登録済みのスタックでも shorthand で書けば違反になる', () => {
  const files = makeFiles({
    'a.svg': `<svg font-family="${GOTHIC}"><text style='font: 12px ${SERIF}'>a</text></svg>`,
  });
  const violations = checkDiagramFonts(files, THEME_CSS, { allowedExtraStacks: [SERIF] });
  assert.deepEqual(
    violations.map(v => v.type),
    ['font-shorthand']
  );
});

test('checkDiagramFonts: font-size と font-family を分けて書けば違反にならない', () => {
  const files = makeFiles({
    'a.svg': `<svg font-family="${GOTHIC}"><text font-size="12" font-family="${GOTHIC}">a</text></svg>`,
  });
  assert.deepEqual(checkDiagramFonts(files, THEME_CSS), []);
});

test('checkDiagramFonts: system font キーワードの shorthand も違反として検出する', () => {
  const files = makeFiles({ 'a.svg': `<svg font-family="${GOTHIC}"><text style="font: menu">a</text></svg>` });
  assert.deepEqual(
    checkDiagramFonts(files, THEME_CSS).map(v => v.type),
    ['font-shorthand']
  );
});

test('checkDiagramFonts: all の一括指定を違反として検出する', () => {
  const files = makeFiles({ 'a.svg': `<svg font-family="${GOTHIC}"><text style="all: initial">a</text></svg>` });
  const violations = checkDiagramFonts(files, THEME_CSS);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].type, 'all-shorthand');
  assert.equal(violations[0].value, 'initial');
});

test('checkDiagramFonts: all は誌面の書体が変わらない値でも違反として検出する', () => {
  const files = makeFiles({
    'a.svg': `<svg font-family="${GOTHIC}"><style>.a { all: unset; } .b { all: revert; }</style></svg>`,
  });
  assert.deepEqual(
    checkDiagramFonts(files, THEME_CSS).map(v => [v.type, v.value]),
    [
      ['all-shorthand', 'unset'],
      ['all-shorthand', 'revert'],
    ]
  );
});

test('checkDiagramFonts: at-rule に包んだ font 宣言を違反として検出する', () => {
  const files = makeFiles({
    'a.svg': `<svg font-family="${GOTHIC}"><style>@media print { .l { font: 20px Courier; } }</style></svg>`,
  });
  assert.deepEqual(
    checkDiagramFonts(files, THEME_CSS).map(v => v.type),
    ['font-shorthand']
  );
});

test('checkDiagramFonts: 2 つ目の <style> 要素の font 宣言を違反として検出する', () => {
  const files = makeFiles({
    'a.svg': `<svg font-family="${GOTHIC}"><style>.a{fill:#000}</style><style>.b{font:20px Impact}</style></svg>`,
  });
  assert.deepEqual(
    checkDiagramFonts(files, THEME_CSS).map(v => v.type),
    ['font-shorthand']
  );
});

test('checkDiagramFonts: 除外したファイルの font shorthand は検査しない', () => {
  const files = makeFiles({ 'photo-like.svg': `<svg font-family="${GOTHIC}"><text font="20px Impact">a</text></svg>` });
  assert.deepEqual(checkDiagramFonts(files, THEME_CSS, { excludedFiles: ['photo-like.svg'] }), []);
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
