import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'zlib';
import {
  collectDictionaries,
  collectObjectDictionaries,
  findTransparency,
  verifyNoTransparency,
  formatTransparencySummary,
} from './check-print-transparency.mjs';

/* 走査は latin1 の 1 文字 = 1 バイトを前提にする．
   テストの PDF 断片も同じ扱いでバッファへ載せる */
const toBuffer = text => Buffer.from(text, 'latin1');

/* 平文側は間接オブジェクトの辞書だけを見る．
   素の辞書を渡す形では実物と違う経路を試すことになるため，見出しを添える */
const pdfObject = (dictionary, number = 1) => `${number} 0 obj\n${dictionary}\nendobj\n`;

const scan = dictionary => findTransparency(toBuffer(pdfObject(dictionary)));

// --- collectDictionaries ---

test('collectDictionaries: 入れ子の辞書もそれぞれ拾う', () => {
  const dictionaries = collectDictionaries('<< /Resources << /ca 0.5 >> >>');
  assert.equal(dictionaries.length, 2);
  assert.ok(dictionaries.some(text => text.includes('/ca 0.5')));
});

test('collectDictionaries: 文字列の中の辞書は拾わない', () => {
  assert.deepEqual(collectDictionaries('(<< /ca 0.5 >>)'), []);
});

test('collectObjectDictionaries: 見出しを持たない辞書は拾わない', () => {
  assert.deepEqual(collectObjectDictionaries('<< /ca 0.5 >>'), []);
});

// --- findTransparency: ソフトマスク ---

test('findTransparency: /None でない SMask を数える', () => {
  const found = scan('<< /Type /ExtGState /SMask 12 0 R >>');
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, 'smask');
});

test('findTransparency: /SMask /None は透明を無効にする指定なので数えない', () => {
  assert.deepEqual(scan('<< /SMask /None >>'), []);
});

test('findTransparency: 辞書として書かれた SMask も数える', () => {
  const found = scan('<< /SMask << /Type /Mask /S /Luminosity >> >>');
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, 'smask');
});

// --- findTransparency: 定数アルファ ---

test('findTransparency: 1 未満の /ca を数える', () => {
  const found = scan('<< /Type /ExtGState /ca 0.12 >>');
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, 'alpha');
  assert.equal(found[0].operator, 'ca');
  assert.equal(found[0].value, 0.12);
});

test('findTransparency: 1 未満の /CA を数える', () => {
  const found = scan('<< /CA .5 >>');
  assert.equal(found.length, 1);
  assert.equal(found[0].operator, 'CA');
  assert.equal(found[0].value, 0.5);
});

test('findTransparency: 不透明の指定（1・1.0）は数えない', () => {
  assert.deepEqual(scan('<< /ca 1 /CA 1.0 >>'), []);
});

test('findTransparency: 塗りと線の両方が透明なら 2 件になる', () => {
  const found = scan('<< /ca 0.12 /CA 0.4 >>');
  assert.equal(found.length, 2);
  assert.deepEqual(
    found.map(item => item.operator),
    ['ca', 'CA']
  );
});

test('findTransparency: /ca で始まる別の名前を数えない', () => {
  assert.deepEqual(scan('<< /caption 0.5 /CAP 0.5 >>'), []);
});

// --- findTransparency: 合成モード ---

test('findTransparency: /BM /Normal は数えない', () => {
  assert.deepEqual(scan('<< /Type /ExtGState /BM /Normal /ca 1 >>'), []);
});

test('findTransparency: /BM /Compatible も数えない', () => {
  assert.deepEqual(scan('<< /BM /Compatible >>'), []);
});

test('findTransparency: 不透明でない合成モードを数える', () => {
  const found = scan('<< /Type /ExtGState /BM /Multiply /ca 1 >>');
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, 'blend');
  assert.equal(found[0].value, 'Multiply');
});

test('findTransparency: 名前を読めない /BM は不透明と示せないため数える', () => {
  const found = scan('<< /BM [ /Normal ] >>');
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, 'blend');
  assert.equal(found[0].value, null);
});

// --- findTransparency: 埋め込みアルファ ---

test('findTransparency: 0 でない /SMaskInData を数える', () => {
  const found = scan('<< /Subtype /Image /Filter /JPXDecode /SMaskInData 1 >>');
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, 'embedded-alpha');
  assert.equal(found[0].value, 1);
});

test('findTransparency: /SMaskInData 0 はアルファを使わない指定なので数えない', () => {
  assert.deepEqual(scan('<< /SMaskInData 0 >>'), []);
});

// --- findTransparency: 構文の読み分け ---

test('findTransparency: 文字列の中に現れた指定を数えない', () => {
  assert.deepEqual(scan('<< /ActualText (CSS の /ca 0.5 について) >>'), []);
});

test('findTransparency: 圧縮側でも文字列の中の指定を数えない', () => {
  const inner = '<< /Alt (/ca 0.5 と書いた本文) >>';
  assert.deepEqual(findTransparency(objectStream(inner)), []);
});

test('findTransparency: 鍵と値のあいだのコメントを読み飛ばす', () => {
  const found = scan('<< /ca%注記\n0.12 >>');
  assert.equal(found.length, 1);
  assert.equal(found[0].value, 0.12);
});

test('findTransparency: 透明を持たない PDF では空になる', () => {
  assert.deepEqual(scan('<< /Type /Page /SMask /None /ca 1 /BM /Normal >>'), []);
});

// --- findTransparency: オブジェクトストリーム ---

/* オブジェクトストリームは中身を Flate で圧縮して持つ．
   平文の走査では届かないため，展開して辿れることを確かめる */
function objectStream(inner) {
  const compressed = zlib.deflateSync(Buffer.from(inner, 'latin1'));
  return Buffer.concat([
    Buffer.from(
      `1 0 obj\n<< /Type /ObjStm /N 1 /First 0 /Length ${compressed.length} >>\nstream\n`,
      'latin1'
    ),
    compressed,
    Buffer.from('\nendstream\nendobj\n', 'latin1'),
  ]);
}

test('findTransparency: 圧縮されたオブジェクトストリームの中も走査する', () => {
  const found = findTransparency(objectStream('<< /Type /ExtGState /ca 0.12 >>'));
  assert.equal(found.length, 1);
  assert.equal(found[0].value, 0.12);
});

// --- findTransparency: 報告の中身 ---

test('findTransparency: 見つけた箇所の前後を添える', () => {
  const found = scan('<< /Type /ExtGState /ca 0.12 /BM /Normal >>');
  assert.ok(found[0].context.includes('/ca 0.12'));
});

// --- verifyNoTransparency ---

test('verifyNoTransparency: 透明が無ければ ok になる', () => {
  const result = verifyNoTransparency(toBuffer(pdfObject('<< /SMask /None /ca 1 >>')));
  assert.equal(result.ok, true);
});

test('verifyNoTransparency: 透明があれば件数を添えて失敗する', () => {
  const result = verifyNoTransparency(toBuffer(pdfObject('<< /ca 0.12 /SMask 5 0 R >>')));
  assert.equal(result.ok, false);
  assert.match(result.message, /2/);
});

test('verifyNoTransparency: 対象の呼び名を知らせへ入れる', () => {
  const result = verifyNoTransparency(toBuffer(pdfObject('<< /ca 0.12 >>')), '表紙の PDF');
  assert.match(result.message, /^表紙の PDF /);
});

// --- formatTransparencySummary ---

test('formatTransparencySummary: 種別ごとの件数を並べる', () => {
  const summary = formatTransparencySummary(
    scan('<< /ca 0.12 /SMask 5 0 R /BM /Multiply /SMaskInData 1 >>')
  );
  assert.match(summary, /SMask 1/);
  assert.match(summary, /1 未満のアルファ 1/);
  assert.match(summary, /合成モード 1/);
  assert.match(summary, /埋め込みアルファ 1/);
});
