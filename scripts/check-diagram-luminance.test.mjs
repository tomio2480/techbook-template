import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  DIAGRAM_TIER_COLORS,
  EXCLUDED_FILES,
  MIN_SEPARATION,
  ANNOTATION_TOKEN,
  rec601Luminance,
  isChromatic,
  extractSvgColors,
  checkDiagramColors,
} from './check-diagram-luminance.mjs';
import { parseCssVariables, resolveVar } from './check-contrast.mjs';

const PALETTE_CSS_PATH = fileURLToPath(
  new URL('../config/themes/techbook/palette.css', import.meta.url)
);
const DIAGRAMS_DIR = fileURLToPath(new URL('../src/assets/diagrams', import.meta.url));

const VALID_PALETTE_CSS = ':root {\n  --palette-diagram-annotation: #5588bb;\n}';

// --- rec601Luminance ---

test('rec601Luminance: 黒は 0%・白は 100% になる', () => {
  assert.equal(rec601Luminance('#000000'), 0);
  assert.equal(rec601Luminance('#ffffff'), 100);
});

test('rec601Luminance: 注釈色 #5588bb は約 50% になる', () => {
  const luma = rec601Luminance('#5588bb');
  assert.ok(Math.abs(luma - 49.6) < 0.5, `expected ~49.6, got ${luma}`);
});

test('rec601Luminance: 3 桁 hex も 6 桁と同様に扱う', () => {
  assert.equal(rec601Luminance('#fff'), 100);
  assert.equal(rec601Luminance('#888'), rec601Luminance('#888888'));
});

test('rec601Luminance: hex 以外の値はエラーになる', () => {
  assert.throws(() => rec601Luminance('rebeccapurple'), /rebeccapurple/);
});

// --- isChromatic ---

test('isChromatic: 有彩色を検出しグレー系は除外する', () => {
  assert.equal(isChromatic('#5588bb'), true);
  assert.equal(isChromatic('#cc6666'), true);
  assert.equal(isChromatic('#888888'), false);
  assert.equal(isChromatic('#000000'), false);
});

test('isChromatic: チャンネル差が小さいオフホワイトはグレー系として扱う', () => {
  assert.equal(isChromatic('#f2efe9'), false);
});

// --- extractSvgColors ---

test('extractSvgColors: fill と stroke の hex 色を小文字 6 桁へ正規化して集める', () => {
  const svg = '<svg><rect fill="#5588BB" stroke="#333"/><path fill="#2f5b8c"/></svg>';
  const colors = extractSvgColors(svg);
  assert.deepEqual([...colors].sort(), ['#2f5b8c', '#333333', '#5588bb']);
});

test('extractSvgColors: none は無視し black / white キーワードは hex へ正規化する', () => {
  const svg = '<svg><rect fill="none" stroke="black"/><circle fill="white"/></svg>';
  const colors = extractSvgColors(svg);
  assert.deepEqual([...colors].sort(), ['#000000', '#ffffff']);
});

test('extractSvgColors: stop-color も収集対象に含める', () => {
  const svg = '<svg><stop stop-color="#aa2200"/></svg>';
  assert.deepEqual([...extractSvgColors(svg)], ['#aa2200']);
});

test('extractSvgColors: シングルクォートの属性値も収集する', () => {
  const svg = "<svg><path fill='#cc6666' stroke='black'/></svg>";
  assert.deepEqual([...extractSvgColors(svg)].sort(), ['#000000', '#cc6666']);
});

test('extractSvgColors: = の前後に空白がある属性も収集する', () => {
  const svg = '<svg><path fill = "#cc6666"/><path stroke =\t"#5588bb"/></svg>';
  assert.deepEqual([...extractSvgColors(svg)].sort(), ['#5588bb', '#cc6666']);
});

// --- checkDiagramColors（合成データ） ---

function makeFiles(entries) {
  return new Map(Object.entries(entries));
}

test('checkDiagramColors: 登録済み明度段のみ使う SVG は違反なしになる', () => {
  const files = makeFiles({
    'a.svg': '<svg><path stroke="#5588bb"/><path stroke="black"/></svg>',
    'b.svg': '<svg><text fill="#2f5b8c"/><text fill="#8cb2d8"/><rect fill="#f0f4f8"/></svg>',
  });
  const violations = checkDiagramColors(files, VALID_PALETTE_CSS);
  assert.deepEqual(violations, []);
});

// トークン使用検査を通すため，注釈色 #5588bb を使う基準 SVG を併置する．
const BASE_SVG = '<svg><path stroke="#5588bb"/></svg>';

test('checkDiagramColors: 未登録の有彩色を違反として検出する', () => {
  const files = makeFiles({ 'base.svg': BASE_SVG, 'a.svg': '<svg><path stroke="#cc6666"/></svg>' });
  const violations = checkDiagramColors(files, VALID_PALETTE_CSS);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].type, 'unregistered-chromatic');
  assert.equal(violations[0].file, 'a.svg');
  assert.equal(violations[0].color, '#cc6666');
});

test('checkDiagramColors: グレー系は登録なしでも違反にならない', () => {
  const files = makeFiles({
    'base.svg': BASE_SVG,
    'a.svg': '<svg><rect fill="#fafafa" stroke="#999"/><text fill="#333"/></svg>',
  });
  assert.deepEqual(checkDiagramColors(files, VALID_PALETTE_CSS), []);
});

test('checkDiagramColors: 除外ファイルは有彩色検査の対象外になる', () => {
  const files = makeFiles({
    'base.svg': BASE_SVG,
    'led-circuit.svg': '<svg><path stroke="#cc3333"/></svg>',
  });
  assert.deepEqual(checkDiagramColors(files, VALID_PALETTE_CSS), []);
});

test('checkDiagramColors: hex へ解釈できない色値は黙認せず違反になる', () => {
  const files = makeFiles({
    'base.svg': BASE_SVG,
    'a.svg': '<svg><path fill="red"/><rect fill="url(#g)"/></svg>',
  });
  const violations = checkDiagramColors(files, VALID_PALETTE_CSS);
  const unsupported = violations.filter(v => v.type === 'unsupported-color-value');
  assert.equal(unsupported.length, 2);
  assert.equal(unsupported[0].file, 'a.svg');
});

test('checkDiagramColors: CSS プロパティ形式の色指定（style 属性・style 要素）は違反になる', () => {
  const files = makeFiles({
    'base.svg': BASE_SVG,
    'a.svg': '<svg><style>.x { fill: #cc6666; }</style><path style="stroke:#cc6666"/></svg>',
  });
  const violations = checkDiagramColors(files, VALID_PALETTE_CSS);
  assert.ok(violations.some(v => v.type === 'style-color' && v.file === 'a.svg'));
});

test('checkDiagramColors: CSS プロパティ名は大文字小文字を区別せず検出する', () => {
  const files = makeFiles({
    'base.svg': BASE_SVG,
    'a.svg': '<svg><path style="FILL:#cc0000"/></svg>',
  });
  const violations = checkDiagramColors(files, VALID_PALETTE_CSS);
  assert.ok(violations.some(v => v.type === 'style-color' && v.file === 'a.svg'));
});

test('checkDiagramColors: XML コメント内の色属性は検査対象にしない', () => {
  const files = makeFiles({
    'base.svg': BASE_SVG,
    'a.svg': '<svg><!-- <path fill="#cc0000"/> --><path fill="#5588bb"/></svg>',
  });
  assert.deepEqual(checkDiagramColors(files, VALID_PALETTE_CSS), []);
});

test('checkDiagramColors: トークンの色が除外ファイルのみで使われていても未使用扱いにしない', () => {
  const files = makeFiles({
    'a.svg': '<svg><path stroke="#2f5b8c"/></svg>',
    'led-circuit.svg': BASE_SVG,
  });
  assert.deepEqual(checkDiagramColors(files, VALID_PALETTE_CSS), []);
});

test('checkDiagramColors: 明度段どうしが 15 ポイント未満に接近すると違反になる', () => {
  const files = makeFiles({ 'a.svg': '<svg><path stroke="#5588bb"/></svg>' });
  const violations = checkDiagramColors(files, VALID_PALETTE_CSS, {
    tierColors: ['#5588bb', '#6699cc'],
  });
  assert.ok(violations.some(v => v.type === 'tier-too-close'));
});

test('checkDiagramColors: 明度段が 20〜80% の帯を外れると違反になる', () => {
  const files = makeFiles({ 'a.svg': '<svg><path stroke="#5588bb"/></svg>' });
  const violations = checkDiagramColors(files, VALID_PALETTE_CSS, {
    tierColors: ['#5588bb', '#101830'],
  });
  assert.ok(violations.some(v => v.type === 'tier-out-of-band'));
});

test('checkDiagramColors: トークンが明度段に含まれない値だと違反になる', () => {
  const files = makeFiles({ 'a.svg': '<svg><path stroke="#5588bb"/></svg>' });
  const css = ':root {\n  --palette-diagram-annotation: #cc6666;\n}';
  const violations = checkDiagramColors(files, css);
  assert.ok(violations.some(v => v.type === 'token-mismatch'));
});

test('checkDiagramColors: トークンの色がどの SVG でも未使用だと違反になる', () => {
  const files = makeFiles({ 'a.svg': '<svg><path stroke="#2f5b8c"/></svg>' });
  const violations = checkDiagramColors(files, VALID_PALETTE_CSS);
  assert.ok(violations.some(v => v.type === 'token-unused'));
});

test('checkDiagramColors: トークン未定義はエラーになる', () => {
  const files = makeFiles({ 'a.svg': '<svg><path stroke="#5588bb"/></svg>' });
  assert.throws(() => checkDiagramColors(files, ':root {}'), /--palette-diagram-annotation/);
});

// --- 定数の妥当性 ---

test('明度段パレット: 相互の Rec.601 輝度差が 15 ポイント以上ある', () => {
  const lumas = DIAGRAM_TIER_COLORS.map(rec601Luminance).sort((a, b) => a - b);
  for (let i = 1; i < lumas.length; i += 1) {
    assert.ok(
      lumas[i] - lumas[i - 1] >= MIN_SEPARATION,
      `${lumas[i - 1].toFixed(1)}% と ${lumas[i].toFixed(1)}% の差が ${MIN_SEPARATION} 未満`
    );
  }
});

// --- 実ファイル検証 ---
//
// テンプレートは本文執筆前の初期状態で配布される．同梱の led-circuit.svg は
// LED 発光表現に実体色（赤）を使うサンプルであり，除外リストの使い方を示す
// 実例を兼ねて EXCLUDED_FILES に含めている．そのため検査対象（除外リスト外）の
// 図版が 0 件になり得る．0 件のときに実ファイル検証を空振り（無意味な green）
// させず，かつ新規プロジェクトの npm test を赤くもしないよう，検査対象なしの
// 場合は理由付きで skip する．

function loadRealFiles() {
  let names;
  try {
    names = fs.readdirSync(DIAGRAMS_DIR);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return new Map();
    }
    throw err;
  }
  const files = new Map();
  for (const name of names) {
    if (name.endsWith('.svg')) {
      files.set(name, fs.readFileSync(path.join(DIAGRAMS_DIR, name), 'utf-8'));
    }
  }
  return files;
}

const realFiles = loadRealFiles();
const checkableFileCount = [...realFiles.keys()].filter(
  name => !EXCLUDED_FILES.includes(name)
).length;

test(
  '実ファイル: src/assets/diagrams の全 SVG が配色規約を満たす',
  { skip: checkableFileCount === 0 ? '配色規約の検査対象となる図版がまだない初期状態のため省略する' : false },
  () => {
    const css = fs.readFileSync(PALETTE_CSS_PATH, 'utf-8');
    const violations = checkDiagramColors(realFiles, css);
    assert.deepEqual(
      violations,
      [],
      violations.map(v => `${v.type}: ${v.file ?? ''} ${v.color ?? ''} ${v.message}`).join('\n')
    );
  }
);

test('実ファイル: 除外リストのファイルが実在する（改名時の silent pass 防止）', () => {
  for (const name of EXCLUDED_FILES) {
    assert.ok(realFiles.has(name), `除外リストの ${name} が見つからない`);
  }
});

test('実ファイル: ' + ANNOTATION_TOKEN + ' が palette.css で有効な hex 値として宣言されている', () => {
  // コメント中の言及だけでは満たされないよう，宣言を実際にパースして検証する．
  // css.includes(ANNOTATION_TOKEN) だと，宣言を削除してもヘッダコメントの
  // 言及が残っていれば見逃す．
  const css = fs.readFileSync(PALETTE_CSS_PATH, 'utf-8');
  const vars = parseCssVariables(css);
  const value = resolveVar(vars, ANNOTATION_TOKEN);
  assert.match(
    value,
    /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/,
    `${ANNOTATION_TOKEN} の値 ${value} が hex 色として解釈できない`
  );
});

test(ANNOTATION_TOKEN + ': コメント中の言及だけでは宣言とみなされない', () => {
  const commentOnlyCss = `/* ${ANNOTATION_TOKEN} の説明コメント */\n:root {\n}`;
  const vars = parseCssVariables(commentOnlyCss);
  assert.throws(() => resolveVar(vars, ANNOTATION_TOKEN), new RegExp(ANNOTATION_TOKEN));
});
