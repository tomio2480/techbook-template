import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'zlib';
import {
  findTransparency,
  verifyNoTransparency,
  formatTransparencySummary,
} from './check-print-transparency.mjs';

/* 走査は latin1 の 1 文字 = 1 バイトを前提にする．
   テストの PDF 断片も同じ扱いでバッファへ載せる */
const toBuffer = text => Buffer.from(text, 'latin1');

// --- findTransparency: ソフトマスク ---

test('findTransparency: /None でない SMask を数える', () => {
  const found = findTransparency(toBuffer('<< /Type /ExtGState /SMask 12 0 R >>'));
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, 'smask');
});

test('findTransparency: /SMask /None は透明を無効にする指定なので数えない', () => {
  assert.deepEqual(findTransparency(toBuffer('<< /SMask /None >>')), []);
});

test('findTransparency: 辞書として書かれた SMask も数える', () => {
  const found = findTransparency(toBuffer('<< /SMask << /Type /Mask /S /Luminosity >> >>'));
  assert.equal(found.length, 1);
});

test('findTransparency: /SMaskInData は別のキーなので数えない', () => {
  assert.deepEqual(findTransparency(toBuffer('<< /SMaskInData 1 >>')), []);
});

// --- findTransparency: 定数アルファ ---

test('findTransparency: 1 未満の /ca を数える', () => {
  const found = findTransparency(toBuffer('<< /Type /ExtGState /ca 0.12 >>'));
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, 'alpha');
  assert.equal(found[0].operator, 'ca');
  assert.equal(found[0].value, 0.12);
});

test('findTransparency: 1 未満の /CA を数える', () => {
  const found = findTransparency(toBuffer('<< /CA .5 >>'));
  assert.equal(found.length, 1);
  assert.equal(found[0].operator, 'CA');
  assert.equal(found[0].value, 0.5);
});

test('findTransparency: 不透明の指定（1・1.0）は数えない', () => {
  assert.deepEqual(findTransparency(toBuffer('<< /ca 1 /CA 1.0 >>')), []);
});

test('findTransparency: 塗りと線の両方が透明なら 2 件になる', () => {
  const found = findTransparency(toBuffer('<< /ca 0.12 /CA 0.4 >>'));
  assert.equal(found.length, 2);
  assert.deepEqual(
    found.map(item => item.operator),
    ['ca', 'CA']
  );
});

test('findTransparency: /ca で始まる別の名前を数えない', () => {
  assert.deepEqual(findTransparency(toBuffer('<< /caption 0.5 /CAP 0.5 >>')), []);
});

test('findTransparency: 透明を持たない PDF では空になる', () => {
  assert.deepEqual(findTransparency(toBuffer('<< /Type /Page /SMask /None /ca 1 >>')), []);
});

// --- findTransparency: オブジェクトストリーム ---

test('findTransparency: 圧縮されたオブジェクトストリームの中も走査する', () => {
  const inner = '<< /Type /ExtGState /ca 0.12 >>';
  const compressed = zlib.deflateSync(Buffer.from(inner, 'latin1'));
  const pdf = Buffer.concat([
    Buffer.from(`1 0 obj\n<< /Type /ObjStm /N 1 /First 0 /Length ${compressed.length} >>\nstream\n`, 'latin1'),
    compressed,
    Buffer.from('\nendstream\nendobj\n', 'latin1'),
  ]);
  const found = findTransparency(pdf);
  assert.equal(found.length, 1);
  assert.equal(found[0].value, 0.12);
});

// --- findTransparency: 報告の中身 ---

test('findTransparency: 見つけた箇所の前後を添える', () => {
  const found = findTransparency(toBuffer('<< /Type /ExtGState /ca 0.12 /BM /Normal >>'));
  assert.ok(found[0].context.includes('/ca 0.12'));
});

// --- verifyNoTransparency ---

test('verifyNoTransparency: 透明が無ければ ok になる', () => {
  const result = verifyNoTransparency(toBuffer('<< /SMask /None /ca 1 >>'));
  assert.equal(result.ok, true);
});

test('verifyNoTransparency: 透明があれば件数を添えて失敗する', () => {
  const result = verifyNoTransparency(toBuffer('<< /ca 0.12 /SMask 5 0 R >>'));
  assert.equal(result.ok, false);
  assert.match(result.message, /2/);
});

test('verifyNoTransparency: 対象の呼び名を知らせへ入れる', () => {
  const result = verifyNoTransparency(toBuffer('<< /ca 0.12 >>'), '表紙の PDF');
  assert.match(result.message, /^表紙の PDF /);
});

// --- formatTransparencySummary ---

test('formatTransparencySummary: 種別ごとの件数を並べる', () => {
  const summary = formatTransparencySummary(findTransparency(toBuffer('<< /ca 0.12 /SMask 5 0 R >>')));
  assert.match(summary, /SMask 1/);
  assert.match(summary, /1 未満のアルファ 1/);
});
