import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  TOLERANCE,
  EXCLUDED_FILES,
  luminanceOf,
  parseTranslate,
  parsePathSubpaths,
  parseShapes,
  findMissingExcludedFiles,
  checkDiagramConnectivity,
} from './check-diagram-connectivity.mjs';

const DIAGRAMS_DIR = fileURLToPath(new URL('../src/assets/diagrams', import.meta.url));

function makeFiles(entries) {
  return new Map(Object.entries(entries));
}

function svg(body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">${body}</svg>`;
}

/* 部品（矩形）と接続点（円）へ配線が触れている基準図 */
const CONNECTED = svg(
  '<rect x="60" y="40" width="40" height="20" fill="none" stroke="black"/>' +
    '<circle cx="20" cy="50" r="2" fill="black"/>' +
    '<line class="wire" x1="20" y1="50" x2="60" y2="50" stroke="black"/>' +
    '<polyline class="wire" points="100,50 140,50 140,80" fill="none" stroke="black"/>' +
    '<line x1="130" y1="80" x2="150" y2="80" stroke="black"/>'
);

// --- luminanceOf ---

test('luminanceOf: 黒系は暗く，補助記載の中明度と none は回路本体にならない', () => {
  assert.ok(luminanceOf('black') < 35);
  assert.ok(luminanceOf('#333') < 35);
  assert.ok(luminanceOf('#5588bb') > 35);
  assert.equal(luminanceOf('none'), null);
  assert.equal(luminanceOf(undefined), null);
  assert.equal(luminanceOf('url(#grad)'), null);
});

// --- parseTranslate ---

test('parseTranslate: translate と平行移動の matrix を足し合わせる', () => {
  assert.deepEqual(parseTranslate('translate(10, 5) translate(1)'), { x: 11, y: 5 });
  assert.deepEqual(parseTranslate('matrix(1 0 0 1 3 4)'), { x: 3, y: 4 });
  assert.deepEqual(parseTranslate(undefined), { x: 0, y: 0 });
});

test('parseTranslate: 回転や拡大を含めば null を返す', () => {
  assert.equal(parseTranslate('rotate(90)'), null);
  assert.equal(parseTranslate('translate(1 2) scale(2)'), null);
  assert.equal(parseTranslate('matrix(2 0 0 2 0 0)'), null);
});

// --- parsePathSubpaths ---

test('parsePathSubpaths: 絶対・相対の直線命令と H・V を頂点へ解釈する', () => {
  const [sp] = parsePathSubpaths('M 10,20 L 30,20 l 0,10 H 50 v -5');
  assert.deepEqual(sp.points, [[10, 20], [30, 20], [30, 30], [50, 30], [50, 25]]);
  assert.equal(sp.closed, false);
});

test('parsePathSubpaths: Z で閉じ，続く M で次のサブパスを始める', () => {
  const subpaths = parsePathSubpaths('M0 0 L10 0 L10 10 Z M20 20 l5 0');
  assert.equal(subpaths.length, 2);
  assert.equal(subpaths[0].closed, true);
  assert.deepEqual(subpaths[1].points, [[20, 20], [25, 20]]);
});

test('parsePathSubpaths: 曲線は端点だけを取る', () => {
  const [sp] = parsePathSubpaths('M0 0 C 1 1, 2 2, 10 0 Q 5 5 20 0 A 5 5 0 0 1 30 0');
  assert.deepEqual(sp.points, [[0, 0], [10, 0], [20, 0], [30, 0]]);
});

test('parsePathSubpaths: Z の後に M を挟まず続く描画命令は，始点から新しい開いたサブパスになる', () => {
  const subpaths = parsePathSubpaths('M0 0 L10 0 Z l5 0');
  assert.equal(subpaths.length, 2);
  assert.equal(subpaths[0].closed, true);
  assert.deepEqual(subpaths[1].points, [[0, 0], [5, 0]]);
  assert.equal(subpaths[1].closed, false);
});

test('parsePathSubpaths: M の後の座標の繰り返しは L として読む', () => {
  const [sp] = parsePathSubpaths('M 0 0 10 0 10 10');
  assert.deepEqual(sp.points, [[0, 0], [10, 0], [10, 10]]);
});

// --- parseShapes ---

test('parseShapes: 祖先 <g> の class・stroke・translate を継承する', () => {
  const { shapes } = parseShapes(
    svg('<g class="wire" stroke="black" transform="translate(5 5)"><line x1="0" y1="0" x2="10" y2="0"/></g>')
  );
  assert.equal(shapes.length, 1);
  assert.equal(shapes[0].isWire, true);
  assert.equal(shapes[0].strokeDark, true);
  assert.deepEqual(shapes[0].subpaths[0].points, [[5, 5], [15, 5]]);
});

test('parseShapes: translate 以外の transform を持つ図形は unsupported に入る', () => {
  const { shapes, unsupported } = parseShapes(
    svg('<line id="a" class="wire" stroke="black" x1="0" y1="0" x2="1" y2="1" transform="rotate(45)"/>')
  );
  assert.deepEqual(shapes, []);
  assert.deepEqual(unsupported, [{ label: 'line#a', reason: 'transform', isWire: true }]);
});

test('parseShapes: 祖先 <g> の transform が対応外なら配下の図形も unsupported に入る', () => {
  const { shapes, unsupported } = parseShapes(
    svg('<g transform="rotate(10)"><g transform="translate(1 1)"><line x1="0" y1="0" x2="1" y2="1"/></g></g><line x1="0" y1="0" x2="2" y2="2"/>')
  );
  assert.deepEqual(unsupported.map(u => u.label), ['line[1]']);
  assert.equal(shapes.length, 1);
  assert.equal(shapes[0].label, 'line[2]');
});

test('parseShapes: <defs> と <symbol> の中の図形は集めず，<use> は対応外に入る', () => {
  const { shapes, unsupported } = parseShapes(
    svg(
      '<defs><line class="wire" stroke="black" x1="0" y1="0" x2="9" y2="9"/></defs>' +
        '<symbol id="s"><rect x="0" y="0" width="5" height="5" stroke="black"/></symbol>' +
        '<use href="#s" x="10" y="10" class="wire"/>' +
        '<line x1="0" y1="0" x2="2" y2="2" stroke="black"/>'
    )
  );
  assert.deepEqual(shapes.map(s => s.label), ['line[1]']);
  assert.deepEqual(unsupported, [{ label: 'use[1]', reason: 'use', isWire: true }]);
});

test('parseShapes: root の class="circuit" を読み取る', () => {
  assert.equal(parseShapes('<svg class="circuit diagram"></svg>').isCircuit, true);
  assert.equal(parseShapes('<svg></svg>').isCircuit, false);
});

test('parseShapes: コメント内の図形は読まない', () => {
  const { shapes } = parseShapes(svg('<!-- <line x1="0" y1="0" x2="1" y2="1"/> -->'));
  assert.deepEqual(shapes, []);
});

// --- checkDiagramConnectivity（合成データ） ---

test('checkDiagramConnectivity: 部品・接続点・他の配線へ触れる配線は違反なしになる', () => {
  const result = checkDiagramConnectivity(makeFiles({ 'a.svg': CONNECTED }));
  assert.deepEqual(result.violations, []);
  assert.deepEqual(result.unmarkedFiles, []);
});

test('checkDiagramConnectivity: 部品まで届かない端点を検出する', () => {
  const gap = svg(
    '<rect x="60" y="40" width="40" height="20" fill="none" stroke="black"/>' +
      '<line class="wire" x1="20" y1="50" x2="58" y2="50" stroke="black"/>' +
      '<circle cx="20" cy="50" r="2" fill="black"/>'
  );
  const { violations } = checkDiagramConnectivity(makeFiles({ 'a.svg': gap }));
  assert.equal(violations.length, 1);
  assert.equal(violations[0].type, 'dangling-endpoint');
  assert.equal(violations[0].element, 'line[1]');
  assert.deepEqual(violations[0].point, [58, 50]);
});

test('checkDiagramConnectivity: 突き抜けた端点も検出する', () => {
  const overshoot = svg(
    '<rect x="60" y="40" width="40" height="20" fill="none" stroke="black"/>' +
      '<line class="wire" x1="20" y1="50" x2="63" y2="50" stroke="black"/>' +
      '<circle cx="20" cy="50" r="2" fill="black"/>'
  );
  const { violations } = checkDiagramConnectivity(makeFiles({ 'a.svg': overshoot }));
  assert.equal(violations.length, 1);
  assert.deepEqual(violations[0].point, [63, 50]);
});

test('checkDiagramConnectivity: 許容差の中のずれは触れているとみなす', () => {
  const nearly = svg(
    '<rect x="60" y="40" width="40" height="20" fill="none" stroke="black"/>' +
      '<line class="wire" x1="20" y1="50" x2="59.7" y2="50" stroke="black"/>' +
      '<circle cx="20" cy="50" r="2" fill="black"/>'
  );
  assert.deepEqual(checkDiagramConnectivity(makeFiles({ 'a.svg': nearly })).violations, []);
  const strict = checkDiagramConnectivity(makeFiles({ 'a.svg': nearly }), { tolerance: 0.1 });
  assert.equal(strict.violations.length, 1);
});

test('checkDiagramConnectivity: 他の配線の途中（T 字）へ触れる端点は接続とみなす', () => {
  const tee = svg(
    '<line class="wire" x1="0" y1="50" x2="100" y2="50" stroke="black"/>' +
      '<line class="wire" x1="50" y1="50" x2="50" y2="90" stroke="black"/>' +
      '<circle cx="0" cy="50" r="2" fill="black"/><circle cx="100" cy="50" r="2" fill="black"/>' +
      '<rect x="40" y="90" width="20" height="10" fill="none" stroke="black"/>'
  );
  assert.deepEqual(checkDiagramConnectivity(makeFiles({ 'a.svg': tee })).violations, []);
});

test('checkDiagramConnectivity: 閉じた path の辺と黒塗りの多角形も触れる相手になる', () => {
  const led = svg(
    '<path d="M 50,40 L 70,50 L 50,60 Z" fill="none" stroke="black"/>' +
      '<polygon points="120,40 140,50 120,60" fill="#000"/>' +
      '<line class="wire" x1="0" y1="50" x2="50" y2="50" stroke="black" data-connectivity="free"/>' +
      '<line class="wire" x1="70" y1="50" x2="120" y2="50" stroke="black"/>'
  );
  assert.deepEqual(checkDiagramConnectivity(makeFiles({ 'a.svg': led })).violations, []);
});

test('checkDiagramConnectivity: 補助記載の色の線は回路本体にも配線にもならない', () => {
  const annotated = svg(
    '<rect x="60" y="40" width="40" height="20" fill="none" stroke="black"/>' +
      '<line class="wire" x1="20" y1="50" x2="60" y2="50" stroke="black"/>' +
      '<circle cx="20" cy="50" r="2" fill="black"/>' +
      '<line class="wire" x1="30" y1="20" x2="45" y2="20" stroke="#5588bb"/>' +
      '<path d="M 40,15 L 45,20 L 40,25" fill="none" stroke="#5588bb"/>'
  );
  assert.deepEqual(checkDiagramConnectivity(makeFiles({ 'a.svg': annotated })).violations, []);
});

test('checkDiagramConnectivity: marker を持つ配線と data-connectivity="free" の配線は検査しない', () => {
  const free = svg(
    '<line class="wire" x1="0" y1="10" x2="30" y2="10" stroke="black" marker-end="url(#arrow)"/>' +
      '<g data-connectivity="free"><line class="wire" x1="0" y1="20" x2="30" y2="20" stroke="black"/></g>' +
      '<line class="wire" x1="0" y1="30" x2="30" y2="30" stroke="black"/>'
  );
  const { violations } = checkDiagramConnectivity(makeFiles({ 'a.svg': free }));
  assert.equal(violations.length, 2);
  assert.ok(violations.every(v => v.element === 'line[3]'));
});

test('checkDiagramConnectivity: 中空の円は円周だけを相手にし，中心で止まる配線を検出する', () => {
  const hollow = svg(
    '<circle cx="50" cy="50" r="20" fill="none" stroke="black"/>' +
      '<line class="wire" x1="0" y1="50" x2="30" y2="50" stroke="black"/>' +
      '<line class="wire" x1="100" y1="50" x2="50" y2="50" stroke="black"/>' +
      '<circle cx="0" cy="50" r="2" fill="black"/><circle cx="100" cy="50" r="2" fill="black"/>'
  );
  const { violations } = checkDiagramConnectivity(makeFiles({ 'a.svg': hollow }));
  assert.equal(violations.length, 1);
  assert.deepEqual(violations[0].point, [50, 50]);
});

test('checkDiagramConnectivity: 同じ path の別のサブパスへ触れる端点は接続とみなす', () => {
  const merged = svg(
    '<path class="wire" d="M0 0 L10 0 M5 0 L5 10" fill="none" stroke="black"/>' +
      '<circle cx="0" cy="0" r="1" fill="black"/><circle cx="10" cy="0" r="1" fill="black"/>' +
      '<circle cx="5" cy="10" r="1" fill="black"/>'
  );
  assert.deepEqual(checkDiagramConnectivity(makeFiles({ 'a.svg': merged })).violations, []);
});

test('checkDiagramConnectivity: 配線がすべて対応外の transform を持つ図は，未対応にせず報告する', () => {
  const rotatedWires = svg(
    '<g transform="rotate(5)"><line class="wire" x1="0" y1="0" x2="10" y2="0" stroke="black"/></g>'
  );
  const result = checkDiagramConnectivity(makeFiles({ 'a.svg': rotatedWires }));
  assert.deepEqual(result.unmarkedFiles, []);
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].type, 'unsupported-transform');
});

test('checkDiagramConnectivity: <use> で置いた配線や部品は対応外として報告する', () => {
  const used = svg(
    '<defs><symbol id="r"><rect x="0" y="0" width="10" height="4" stroke="black" fill="none"/></symbol></defs>' +
      '<use href="#r" x="60" y="48"/>' +
      '<line class="wire" x1="20" y1="50" x2="60" y2="50" stroke="black"/>' +
      '<circle cx="20" cy="50" r="2" fill="black"/>'
  );
  const types = checkDiagramConnectivity(makeFiles({ 'a.svg': used })).violations.map(v => v.type);
  assert.ok(types.includes('unsupported-element'));
});

test('checkDiagramConnectivity: root に class="circuit" があるのに配線の印が無ければ違反にする', () => {
  const circuit = '<svg class="circuit" viewBox="0 0 10 10"><line x1="0" y1="0" x2="10" y2="0" stroke="black"/></svg>';
  const result = checkDiagramConnectivity(makeFiles({ 'a.svg': circuit }));
  assert.deepEqual(result.unmarkedFiles, []);
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0].type, 'no-wires-marked');
});

test('checkDiagramConnectivity: 配線の印が無い図は未対応として返し，違反にしない', () => {
  const unmarked = svg('<line x1="0" y1="0" x2="10" y2="0" stroke="black"/>');
  const result = checkDiagramConnectivity(makeFiles({ 'a.svg': unmarked, 'b.svg': CONNECTED }));
  assert.deepEqual(result.violations, []);
  assert.deepEqual(result.unmarkedFiles, ['a.svg']);
});

test('checkDiagramConnectivity: 配線を持つ図で translate 以外の transform があれば報告する', () => {
  const rotated = svg(
    '<rect x="60" y="40" width="40" height="20" fill="none" stroke="black"/>' +
      '<line class="wire" x1="20" y1="50" x2="60" y2="50" stroke="black"/>' +
      '<circle cx="20" cy="50" r="2" fill="black"/>' +
      '<line x1="0" y1="0" x2="1" y2="1" stroke="black" transform="rotate(30)"/>'
  );
  const { violations } = checkDiagramConnectivity(makeFiles({ 'a.svg': rotated }));
  assert.equal(violations.length, 1);
  assert.equal(violations[0].type, 'unsupported-transform');
});

test('checkDiagramConnectivity: 除外したファイルは検査しない', () => {
  const gap = svg('<line class="wire" x1="0" y1="0" x2="10" y2="0" stroke="black"/>');
  const result = checkDiagramConnectivity(makeFiles({ 'x.svg': gap }), { excludedFiles: ['x.svg'] });
  assert.deepEqual(result.violations, []);
  assert.deepEqual(result.unmarkedFiles, []);
});

test('TOLERANCE と EXCLUDED_FILES の既定', () => {
  assert.equal(TOLERANCE, 0.5);
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

test(
  '実ファイル: src/assets/diagrams の配線付き SVG に浮いた端点が無い',
  { skip: realFiles.size === 0 ? '図版がまだ 1 件も無い初期状態のため省略する' : false },
  () => {
    const { violations } = checkDiagramConnectivity(realFiles);
    assert.deepEqual(violations, [], violations.map(v => v.message).join('\n'));
  }
);

test(
  '実ファイル: 同梱のサンプル回路図は配線に印があり，検査の対象になっている',
  { skip: !realFiles.has('led-circuit.svg') ? 'サンプル図が無いため省略する' : false },
  () => {
    const { unmarkedFiles } = checkDiagramConnectivity(realFiles);
    assert.ok(!unmarkedFiles.includes('led-circuit.svg'), 'led-circuit.svg の配線に class="wire" が無い');
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
