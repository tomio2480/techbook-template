import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  parseCssVariables,
  resolveVar,
  contrastRatio,
  checkCodeContrast,
  WCAG_AA_CONTRAST,
} from './check-contrast.mjs';

const PALETTE_CSS_PATH = fileURLToPath(
  new URL('../config/themes/techbook/palette.css', import.meta.url)
);

// --- parseCssVariables ---

test('parseCssVariables: カスタムプロパティ宣言を名前と値の Map として抽出する', () => {
  const css = `:root {\n  --foo: #123456;\n  --bar: var(--foo);\n}`;
  const vars = parseCssVariables(css);
  assert.equal(vars.get('--foo'), '#123456');
  assert.equal(vars.get('--bar'), 'var(--foo)');
});

test('parseCssVariables: コメントや変数以外の宣言は無視する', () => {
  const css = `:root {\n  /* --commented: #000; */\n  color: #fff;\n  --real: #333;\n}`;
  const vars = parseCssVariables(css);
  assert.equal(vars.has('--commented'), false);
  assert.equal(vars.has('color'), false);
  assert.equal(vars.get('--real'), '#333');
});

// --- resolveVar ---

test('resolveVar: 直接値のトークンはそのまま返す', () => {
  const vars = new Map([['--a', '#abcdef']]);
  assert.equal(resolveVar(vars, '--a'), '#abcdef');
});

test('resolveVar: 第 2 層の var() 参照を第 1 層の値へ辿る', () => {
  const vars = new Map([
    ['--palette-primary-light', '#f0f4f8'],
    ['--code-bg', 'var(--palette-primary-light)'],
  ]);
  assert.equal(resolveVar(vars, '--code-bg'), '#f0f4f8');
});

test('resolveVar: 多段の var() 参照も末端の値まで辿る', () => {
  const vars = new Map([
    ['--a', '#222'],
    ['--b', 'var(--a)'],
    ['--c', 'var(--b)'],
  ]);
  assert.equal(resolveVar(vars, '--c'), '#222');
});

test('resolveVar: 未定義のトークンを参照するとエラーになる', () => {
  const vars = new Map([['--a', 'var(--missing)']]);
  assert.throws(() => resolveVar(vars, '--a'), /--missing/);
});

test('resolveVar: 循環参照はエラーになる（無限ループしない）', () => {
  const vars = new Map([
    ['--a', 'var(--b)'],
    ['--b', 'var(--a)'],
  ]);
  assert.throws(() => resolveVar(vars, '--a'), /--a/);
});

// --- contrastRatio ---

test('contrastRatio: 黒と白のコントラスト比は 21 になる', () => {
  assert.equal(contrastRatio('#000000', '#ffffff'), 21);
});

test('contrastRatio: 同色どうしのコントラスト比は 1 になる', () => {
  assert.equal(contrastRatio('#2f5b8c', '#2f5b8c'), 1);
});

test('contrastRatio: 引数の順序を入れ替えても同じ比になる', () => {
  const a = contrastRatio('#333333', '#f0f4f8');
  const b = contrastRatio('#f0f4f8', '#333333');
  assert.equal(a, b);
});

test('contrastRatio: 3 桁 hex も 6 桁と同様に扱う', () => {
  assert.equal(contrastRatio('#000', '#fff'), 21);
  assert.equal(contrastRatio('#222', '#222222'), 1);
});

test('contrastRatio: 既知ペア #767676 対白は約 4.54 になる', () => {
  const ratio = contrastRatio('#767676', '#ffffff');
  assert.ok(Math.abs(ratio - 4.54) < 0.01, `expected ~4.54, got ${ratio}`);
});

test('contrastRatio: hex 以外の色表記はエラーになる', () => {
  assert.throws(() => contrastRatio('rebeccapurple', '#fff'), /rebeccapurple/);
});

// --- checkCodeContrast（合成 CSS） ---

function makeCss(codeColors, background = '#f0f4f8') {
  const decls = Object.entries(codeColors)
    .map(([name, value]) => `  --palette-code-${name}: ${value};`)
    .join('\n');
  return `:root {\n  --palette-primary-light: ${background};\n${decls}\n  --code-bg: var(--palette-primary-light);\n}`;
}

test('checkCodeContrast: 全シンタックス色が 4.5:1 以上なら全件 ok になる', () => {
  const results = checkCodeContrast(makeCss({ keyword: '#0055aa', string: '#aa4400' }));
  assert.equal(results.length, 2);
  assert.equal(results.every(r => r.ok), true);
});

test('checkCodeContrast: 4.5:1 未満のシンタックス色を違反として検出する', () => {
  const results = checkCodeContrast(makeCss({ keyword: '#0055aa', comment: '#cccccc' }));
  const violation = results.find(r => r.token === '--palette-code-comment');
  assert.equal(violation.ok, false);
  assert.ok(violation.ratio < WCAG_AA_CONTRAST);
});

test('checkCodeContrast: 各結果にトークン名・解決済み色・比を含む', () => {
  const results = checkCodeContrast(makeCss({ keyword: '#0055aa' }));
  assert.equal(results.length, 1);
  const [r] = results;
  assert.equal(r.token, '--palette-code-keyword');
  assert.equal(r.color, '#0055aa');
  assert.equal(r.background, '#f0f4f8');
  assert.equal(typeof r.ratio, 'number');
});

test('checkCodeContrast: --code-bg が存在しなければエラーになる', () => {
  const css = ':root {\n  --palette-code-keyword: #0055aa;\n}';
  assert.throws(() => checkCodeContrast(css), /--code-bg/);
});

test('checkCodeContrast: --palette-code-* が 1 件もなければエラーになる（改名時の silent pass 防止）', () => {
  const css = ':root {\n  --code-bg: #f0f4f8;\n}';
  assert.throws(() => checkCodeContrast(css), /--palette-code-/);
});

// --- checkCodeContrast（実ファイル palette.css） ---

test('palette.css: 全 --palette-code-* が --code-bg に対し 4.5:1 以上を満たす', () => {
  const css = fs.readFileSync(PALETTE_CSS_PATH, 'utf-8');
  const results = checkCodeContrast(css);
  const violations = results.filter(r => !r.ok);
  assert.deepEqual(
    violations,
    [],
    `コントラスト比 ${WCAG_AA_CONTRAST}:1 未満: ${violations
      .map(r => `${r.token}=${r.color} (${r.ratio.toFixed(2)}:1)`)
      .join(', ')}`
  );
});

test('palette.css: 主要シンタックストークンが定義されている', () => {
  const css = fs.readFileSync(PALETTE_CSS_PATH, 'utf-8');
  const tokens = checkCodeContrast(css).map(r => r.token);
  for (const name of ['comment', 'keyword', 'string', 'number', 'function']) {
    assert.ok(tokens.includes(`--palette-code-${name}`), `--palette-code-${name} が見つからない`);
  }
});
