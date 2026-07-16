import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  extractLinearGradients,
  parseGradientStops,
  hasAdjacentHardStopTransparency,
  checkGradientHardStops,
} from './check-gradient-hardstops.mjs';

const THEME_CSS_PATH = fileURLToPath(
  new URL('../config/themes/techbook/theme.css', import.meta.url)
);

// --- extractLinearGradients ---

test('extractLinearGradients: 単一の linear-gradient() の引数部分を抽出する', () => {
  const css = 'h1 { background: linear-gradient(225deg, #fff 10pt, transparent 10pt); }';
  const results = extractLinearGradients(css);
  assert.deepEqual(results, ['225deg, #fff 10pt, transparent 10pt']);
});

test('extractLinearGradients: 複数の linear-gradient() をすべて抽出する', () => {
  const css = `h1 {
    background:
      linear-gradient(225deg, #fff 10pt, transparent 10pt),
      linear-gradient(to right, var(--heading-plate-bg), #fff);
  }`;
  const results = extractLinearGradients(css);
  assert.equal(results.length, 2);
  assert.equal(results[0], '225deg, #fff 10pt, transparent 10pt');
  assert.equal(results[1], 'to right, var(--heading-plate-bg), #fff');
});

test('extractLinearGradients: var() の入れ子括弧を含んでも正しく切り出す', () => {
  const css = '.column { background: linear-gradient(225deg, transparent 14pt, var(--column-bg) 14pt); }';
  const results = extractLinearGradients(css);
  assert.deepEqual(results, ['225deg, transparent 14pt, var(--column-bg) 14pt']);
});

test('extractLinearGradients: コメント内の linear-gradient() は無視する', () => {
  const css = '/* linear-gradient(225deg, #fff 10pt, transparent 10pt) */ h1 { color: red; }';
  const results = extractLinearGradients(css);
  assert.deepEqual(results, []);
});

test('extractLinearGradients: linear-gradient が無ければ空配列を返す', () => {
  const results = extractLinearGradients('h1 { color: red; }');
  assert.deepEqual(results, []);
});

// --- parseGradientStops ---

test('parseGradientStops: 角度付きの stop を色と位置に分解する', () => {
  const stops = parseGradientStops('225deg, #fff 10pt, transparent 10pt');
  assert.deepEqual(stops, [
    { color: '#fff', position: '10pt' },
    { color: 'transparent', position: '10pt' },
  ]);
});

test('parseGradientStops: 方向キーワード（to right）は stop から除外する', () => {
  const stops = parseGradientStops('to right, var(--heading-plate-bg), #fff');
  assert.deepEqual(stops, [
    { color: 'var(--heading-plate-bg)', position: null },
    { color: '#fff', position: null },
  ]);
});

test('parseGradientStops: 角度も方向もない場合はすべて stop として扱う', () => {
  const stops = parseGradientStops('transparent 60%, var(--heading-plate-bg) 60%');
  assert.deepEqual(stops, [
    { color: 'transparent', position: '60%' },
    { color: 'var(--heading-plate-bg)', position: '60%' },
  ]);
});

// --- hasAdjacentHardStopTransparency ---

test('hasAdjacentHardStopTransparency: 同一位置かつ一方が transparent なら真', () => {
  const stops = [
    { color: '#fff', position: '10pt' },
    { color: 'transparent', position: '10pt' },
  ];
  assert.equal(hasAdjacentHardStopTransparency(stops), true);
});

test('hasAdjacentHardStopTransparency: 位置が異なるフェードは偽になる', () => {
  const stops = [
    { color: 'transparent', position: '0%' },
    { color: '#000', position: '100%' },
  ];
  assert.equal(hasAdjacentHardStopTransparency(stops), false);
});

test('hasAdjacentHardStopTransparency: 位置が同一でも transparent を含まなければ偽', () => {
  const stops = [
    { color: '#fff', position: '10pt' },
    { color: '#000', position: '10pt' },
  ];
  assert.equal(hasAdjacentHardStopTransparency(stops), false);
});

test('hasAdjacentHardStopTransparency: 位置指定のない stop 同士は偽になる', () => {
  const stops = [
    { color: 'var(--heading-plate-bg)', position: null },
    { color: '#fff', position: null },
  ];
  assert.equal(hasAdjacentHardStopTransparency(stops), false);
});

// --- checkGradientHardStops（合成 CSS） ---

test('checkGradientHardStops: 違反パターン文字列を検出する', () => {
  const css = 'h1 { background: linear-gradient(225deg, #fff 10pt, transparent 10pt); }';
  const violations = checkGradientHardStops(css);
  assert.equal(violations.length, 1);
  assert.match(violations[0].gradient, /transparent 10pt/);
});

test('checkGradientHardStops: #fff へのフェード（位置指定なし）は検出しない', () => {
  const css = 'h1 { background: linear-gradient(to right, var(--heading-plate-bg), #fff); }';
  const violations = checkGradientHardStops(css);
  assert.equal(violations.length, 0);
});

test('checkGradientHardStops: 位置の異なる stop は検出しない', () => {
  const css = 'div { background: linear-gradient(180deg, transparent 0%, #000 100%); }';
  const violations = checkGradientHardStops(css);
  assert.equal(violations.length, 0);
});

test('checkGradientHardStops: 複数箇所の違反をすべて検出する', () => {
  const css = `
    h1 { background: linear-gradient(225deg, #fff 10pt, transparent 10pt); }
    h2::before { background: linear-gradient(315deg, transparent 5pt, var(--heading-plate-bg) 5pt); }
  `;
  const violations = checkGradientHardStops(css);
  assert.equal(violations.length, 2);
});

// --- checkGradientHardStops（実ファイル theme.css） ---

test('theme.css: ハードストップ透過グラデーションが 0 件である', () => {
  const css = fs.readFileSync(THEME_CSS_PATH, 'utf-8');
  const violations = checkGradientHardStops(css);
  assert.deepEqual(
    violations,
    [],
    `ハードストップ透過グラデーションを検出: ${violations.map(v => v.gradient).join(' / ')}`
  );
});
