import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'zlib';
import { findTagMarkers, verifyTaggedPdf } from './check-pdf-tags.mjs';

/* 走査は latin1 の 1 文字 = 1 バイトを前提にする．
   テストの PDF 断片も同じ扱いでバッファへ載せる */
const toBuffer = text => Buffer.from(text, 'latin1');

/* 平文側は間接オブジェクトの辞書だけを見る．
   素の辞書を渡す形では実物と違う経路を試すことになるため，見出しを添える */
const pdfObject = (dictionary, number = 1) => `${number} 0 obj\n${dictionary}\nendobj\n`;

// --- findTagMarkers: 平文 ---

test('findTagMarkers: 3 条件そろった PDF は 3 つとも true になる', () => {
  const pdf = toBuffer(
    pdfObject('<< /Type /Catalog /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> >>')
  );
  assert.deepEqual(findTagMarkers(pdf), {
    structTreeRoot: true,
    markInfo: true,
    markedTrue: true,
  });
});

test('findTagMarkers: マーカーが無ければ 3 つとも false になる', () => {
  const pdf = toBuffer(pdfObject('<< /Type /Catalog >>'));
  assert.deepEqual(findTagMarkers(pdf), {
    structTreeRoot: false,
    markInfo: false,
    markedTrue: false,
  });
});

test('findTagMarkers: /Marked false のみでは markedTrue は false のまま', () => {
  const markers = findTagMarkers(
    toBuffer(pdfObject('<< /Type /Catalog /MarkInfo << /Marked false >> >>'))
  );
  assert.equal(markers.markInfo, true);
  assert.equal(markers.markedTrue, false);
});

test('findTagMarkers: /StructTreeRootFoo という別名は数えない', () => {
  const markers = findTagMarkers(toBuffer(pdfObject('<< /Type /Catalog /StructTreeRootFoo 1 0 R >>')));
  assert.equal(markers.structTreeRoot, false);
});

test('findTagMarkers: 構造ルート自身の /Type /StructTreeRoot は数えない', () => {
  /* Catalog の参照が消え，届かない構造オブジェクトだけが残った退行を
     合格させないため，Catalog の鍵としての出現だけを数える */
  const pdf = toBuffer(
    pdfObject('<< /Type /Catalog >>', 1) + pdfObject('<< /Type /StructTreeRoot /K [] >>', 2)
  );
  assert.equal(findTagMarkers(pdf).structTreeRoot, false);
});

test('findTagMarkers: Catalog でない辞書の /StructTreeRoot・/MarkInfo は数えない', () => {
  const pdf = toBuffer(pdfObject('<< /Foo /Bar /StructTreeRoot 5 0 R /MarkInfo 6 0 R >>'));
  const markers = findTagMarkers(pdf);
  assert.equal(markers.structTreeRoot, false);
  assert.equal(markers.markInfo, false);
});

test('findTagMarkers: 文字列リテラルの中の記述は数えない', () => {
  const pdf = toBuffer(
    pdfObject('<< /ActualText (/StructTreeRoot /MarkInfo /Marked true について) >>')
  );
  assert.deepEqual(findTagMarkers(pdf), {
    structTreeRoot: false,
    markInfo: false,
    markedTrue: false,
  });
});

test('findTagMarkers: /MarkInfo が間接参照でも参照先の /Marked true を拾う', () => {
  const pdf = Buffer.concat([
    toBuffer(pdfObject('<< /Type /Catalog /StructTreeRoot 5 0 R /MarkInfo 6 0 R >>', 1)),
    toBuffer(pdfObject('<< /Marked true >>', 6)),
  ]);
  assert.deepEqual(findTagMarkers(pdf), {
    structTreeRoot: true,
    markInfo: true,
    markedTrue: true,
  });
});

// --- findTagMarkers: オブジェクトストリーム ---

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

test('findTagMarkers: 圧縮されたオブジェクトストリームの中のマーカーも見る', () => {
  const pdf = objectStream('<< /Type /Catalog /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> >>');
  assert.deepEqual(findTagMarkers(pdf), {
    structTreeRoot: true,
    markInfo: true,
    markedTrue: true,
  });
});

// --- verifyTaggedPdf ---

test('verifyTaggedPdf: 3 条件そろえば ok になる', () => {
  const pdf = toBuffer(
    pdfObject('<< /Type /Catalog /StructTreeRoot 5 0 R /MarkInfo << /Marked true >> >>')
  );
  assert.equal(verifyTaggedPdf(pdf).ok, true);
});

test('verifyTaggedPdf: マーカーが無ければ 3 項目とも欠落として失敗する', () => {
  const result = verifyTaggedPdf(toBuffer(pdfObject('<< /Type /Catalog >>')));
  assert.equal(result.ok, false);
  assert.match(result.message, /StructTreeRoot/);
  assert.match(result.message, /MarkInfo/);
  assert.match(result.message, /Marked true/);
});

test('verifyTaggedPdf: 対象の呼び名を知らせへ入れる', () => {
  const result = verifyTaggedPdf(toBuffer(pdfObject('<< /Type /Catalog >>')), '紙入稿用 PDF');
  assert.match(result.message, /^紙入稿用 PDF /);
});
