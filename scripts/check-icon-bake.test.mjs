import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  BOX_TYPES,
  BOX_BACKGROUND,
  bakeColor,
  extractIconOpacity,
  decodeIconSvg,
  stripColors,
  extractColors,
  normalizeHex,
  channelGap,
  COLOR_TOLERANCE,
  checkIconBake,
} from './check-icon-bake.mjs';

const themeDir = name =>
  fileURLToPath(new URL(`../config/themes/techbook/${name}`, import.meta.url));

const THEME_CSS = fs.readFileSync(themeDir('theme.css'), 'utf-8');
const PRINT_CSS = fs.readFileSync(themeDir('print.css'), 'utf-8');
const PALETTE_CSS = fs.readFileSync(themeDir('palette.css'), 'utf-8');

/* 検査の骨格だけを持つ最小の CSS．実ファイルに引きずられず境界を試す */
const icon = color =>
  `url("data:image/svg+xml,%3Csvg%3E%3Cpath stroke='${color}' d='M0 0h4'/%3E%3C/svg%3E")`;

const minimalTheme = (opacity = '0.12') =>
  BOX_TYPES.map(type => `:root { --${type}-icon: ${icon('%23000')}; }`).join('\n') +
  `\n.tips::after,\n.note::after {\n  opacity: ${opacity};\n}\n`;

const minimalPrint = (color = '%23e6ebf1') =>
  BOX_TYPES.map(type => `:root { --${type}-icon-baked: ${icon(color)}; }`).join('\n');

const minimalPalette = BOX_TYPES.map(type => `--${type}-accent: #2f5b8c;`).join('\n  ');

// --- bakeColor ---

test('bakeColor: 不透明度 0 なら背景の色になる', () => {
  assert.equal(bakeColor('#2f5b8c', '#ffffff', 0), '#ffffff');
});

test('bakeColor: 不透明度 1 なら前景の色になる', () => {
  assert.equal(bakeColor('#2f5b8c', '#ffffff', 1), '#2f5b8c');
});

test('bakeColor: 基調色を白へ 0.12 で重ねると #e6ebf1 になる', () => {
  assert.equal(bakeColor('#2f5b8c', '#ffffff', 0.12), '#e6ebf1');
});

test('bakeColor: 3 桁の hex も扱える', () => {
  assert.equal(bakeColor('#000', '#fff', 0.5), bakeColor('#000000', '#ffffff', 0.5));
});

// --- extractIconOpacity ---

test('extractIconOpacity: ::after 規則から不透明度を読む', () => {
  assert.equal(extractIconOpacity(minimalTheme('0.2')), 0.2);
});

test('extractIconOpacity: 規則が無ければエラーになる', () => {
  assert.throws(() => extractIconOpacity(':root { --tips-icon: none; }'), /::after/);
});

test('extractIconOpacity: 実ファイルの不透明度は 0 より大きく 1 未満である', () => {
  const opacity = extractIconOpacity(THEME_CSS);
  assert.ok(opacity > 0 && opacity < 1, `expected 0 < opacity < 1, got ${opacity}`);
});

// --- decodeIconSvg・stripColors・extractColors ---

test('decodeIconSvg: データ URI を SVG へ戻す', () => {
  assert.match(decodeIconSvg(icon('%23000')), /^<svg>/);
});

test('decodeIconSvg: データ URI でない値はエラーになる', () => {
  assert.throws(() => decodeIconSvg('none'), /データ URI/);
});

test('stripColors: 色だけが伏せられ形は残る', () => {
  const stripped = stripColors(decodeIconSvg(icon('%23000')));
  assert.ok(!stripped.includes('#000'));
  assert.ok(stripped.includes("d='M0 0h4'"));
});

test('stripColors: 色が違っても形が同じなら一致する', () => {
  assert.equal(
    stripColors(decodeIconSvg(icon('%23000'))),
    stripColors(decodeIconSvg(icon('%23e6ebf1')))
  );
});

test('extractColors: 使われている色を小文字 6 桁で返す', () => {
  assert.deepEqual(extractColors(decodeIconSvg(icon('%23FFF'))), ['#ffffff']);
});

// --- checkIconBake ---

test('checkIconBake: 形と色が揃っていれば違反は無い', () => {
  assert.deepEqual(checkIconBake(minimalTheme(), minimalPrint(), `:root { ${minimalPalette} }`), []);
});

test('checkIconBake: 紙用の置き換えが無ければ違反になる', () => {
  const violations = checkIconBake(minimalTheme(), '', `:root { ${minimalPalette} }`);
  assert.equal(violations.length, BOX_TYPES.length);
  assert.ok(violations.every(v => v.type === 'missing-baked'));
});

test('checkIconBake: 線画の形が食い違えば違反になる', () => {
  const changed = minimalPrint().replace("M0 0h4", "M0 0h8");
  const violations = checkIconBake(minimalTheme(), changed, `:root { ${minimalPalette} }`);
  assert.ok(violations.some(v => v.type === 'shape-mismatch'));
});

test('channelGap: 最も大きいチャンネルの差を返す', () => {
  assert.equal(channelGap('#e6ebf1', '#e6ebf1'), 0);
  assert.equal(channelGap('#e7ecf2', '#e6ebf1'), 1);
  assert.equal(channelGap('#000000', '#ffffff'), 255);
});

test('checkIconBake: 実測で 1 階調ずれた色は違反にしない', () => {
  const violations = checkIconBake(
    minimalTheme(),
    minimalPrint('%23e7ecf2'),
    `:root { ${minimalPalette} }`
  );
  assert.deepEqual(violations, []);
});

test('checkIconBake: 許容を超えて離れた色は違反になる', () => {
  const violations = checkIconBake(
    minimalTheme(),
    minimalPrint('%23e6ebf5'),
    `:root { ${minimalPalette} }`
  );
  assert.ok(violations.some(v => v.type === 'color-mismatch'));
  assert.ok(COLOR_TOLERANCE < 4, '許容は 4 階調未満であること');
});

test('checkIconBake: 焼いた色が計算値と違えば違反になる', () => {
  const violations = checkIconBake(
    minimalTheme(),
    minimalPrint('%23ff0000'),
    `:root { ${minimalPalette} }`
  );
  assert.ok(violations.some(v => v.type === 'color-mismatch'));
});

test('checkIconBake: 基調色を差し替えると焼き直しを促す', () => {
  const violations = checkIconBake(minimalTheme(), minimalPrint(), ':root { --tips-accent: #8b0000;\n  --note-accent: #2f5b8c;\n  --caution-accent: #2f5b8c; }');
  assert.ok(violations.some(v => v.type === 'color-mismatch' && v.box === 'tips'));
});

test('checkIconBake: 実ファイルは違反を持たない', () => {
  assert.deepEqual(checkIconBake(THEME_CSS, PRINT_CSS, PALETTE_CSS), []);
});

test('BOX_BACKGROUND: 枠の地色は theme.css の指定と一致する', () => {
  const rule = THEME_CSS.match(/\.tips\s*\{([^}]*)\}/);
  assert.ok(rule, '.tips の規則が見つからない');
  const background = rule[1].match(/background:\s*(#[0-9a-f]{3,6})/i);
  assert.ok(background, '.tips に地色の指定が見つからない');
  assert.equal(normalizeHex(background[1]), BOX_BACKGROUND);
});
