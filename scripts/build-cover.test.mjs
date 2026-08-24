import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'zlib';

import {
  BOX_TOLERANCE_MM,
  COVER_TARGETS,
  boxSizeMm,
  readPdfBoxes,
  resolveBleedMm,
  resolveCoverTarget,
  verifyBleedSize,
  verifySinglePage,
  verifyTrimSizeMatch,
} from './build-cover.mjs';

// --- COVER_TARGETS ---

test('COVER_TARGETS: 表 1 と表 4 の 2 つを持つ', () => {
  assert.equal(COVER_TARGETS.length, 2);
  assert.deepEqual(
    COVER_TARGETS.map(target => target.key),
    ['cover', 'back-cover']
  );
});

test('COVER_TARGETS: 出力先の名前が原稿名と対応する', () => {
  const [front, back] = COVER_TARGETS;
  assert.equal(front.entry, 'src/chapters/cover.md');
  assert.equal(front.output, 'dist/cover.pdf');
  assert.equal(back.entry, 'src/chapters/back-cover.md');
  assert.equal(back.output, 'dist/back-cover.pdf');
});

// --- resolveCoverTarget ---

test('resolveCoverTarget: 対象の名前から定義を引く', () => {
  assert.equal(resolveCoverTarget('back-cover').output, 'dist/back-cover.pdf');
});

test('resolveCoverTarget: 名前が無ければ選べる名前を添えて失敗する', () => {
  assert.throws(() => resolveCoverTarget(undefined), /cover.+back-cover/s);
});

test('resolveCoverTarget: 知らない名前は選べる名前を添えて失敗する', () => {
  assert.throws(() => resolveCoverTarget('spine'), /spine/);
});

// --- resolveBleedMm ---

test('resolveBleedMm: 紙入稿用のスタイルから塗り足しの量を読む', () => {
  assert.equal(resolveBleedMm(':root {\n  --bleed: 3mm;\n}'), 3);
  assert.equal(resolveBleedMm('--bleed:5mm;'), 5);
  assert.equal(resolveBleedMm('--bleed: 2.5mm;'), 2.5);
});

test('resolveBleedMm: 記述が無ければ探した場所を添えて失敗する', () => {
  assert.throws(() => resolveBleedMm(':root { --bleed-x: 3mm; }'), /--bleed/);
});

test('resolveBleedMm: ミリメートル以外の単位は読み取らない', () => {
  assert.throws(() => resolveBleedMm('--bleed: 8.5pt;'), /--bleed/);
});

test('resolveBleedMm: 0 以下の量は塗り足しとして扱わない', () => {
  assert.throws(() => resolveBleedMm('--bleed: 0mm;'), /0 より大きい/);
});

// --- verifySinglePage ---

test('verifySinglePage: 1 ページなら成功する', () => {
  assert.equal(verifySinglePage(1, '表 1（表紙）').ok, true);
});

test('verifySinglePage: 2 ページ以上なら対象とページ数を添えて失敗する', () => {
  const result = verifySinglePage(2, '表 1（表紙）');
  assert.equal(result.ok, false);
  assert.match(result.message, /表 1（表紙）/);
  assert.match(result.message, /2/);
});

test('verifySinglePage: 0 ページでも失敗する', () => {
  assert.equal(verifySinglePage(0, '表 4（裏表紙）').ok, false);
});

// --- readPdfBoxes ---

const PDF_WITH_BOXES = Buffer.from(
  [
    '%PDF-1.7',
    '3 0 obj',
    '<< /Type /Page /MediaBox [0 0 532.9132 745.92 ] /TrimBox [8.50395 8.9119 524.4093 737.416 ] >>',
    'endobj',
    '4 0 obj',
    '<< /Type /Page /MediaBox [0 0 532.9132 745.92 ] /TrimBox [8.50395 8.9119 524.4093 737.416 ] >>',
    'endobj',
  ].join('\n'),
  'latin1'
);

test('readPdfBoxes: MediaBox と TrimBox を読み取る', () => {
  const boxes = readPdfBoxes(PDF_WITH_BOXES);
  assert.deepEqual(boxes.mediaBox, [[0, 0, 532.9132, 745.92]]);
  assert.deepEqual(boxes.trimBox, [[8.50395, 8.9119, 524.4093, 737.416]]);
});

test('readPdfBoxes: 同じ寸法のページを重ねて数えない', () => {
  assert.equal(readPdfBoxes(PDF_WITH_BOXES).mediaBox.length, 1);
});

test('readPdfBoxes: 寸法の違うページはそれぞれ返す', () => {
  const mixed = Buffer.from('<< /MediaBox [0 0 100 200 ] >> << /MediaBox [0 0 300 400 ] >>', 'latin1');
  assert.deepEqual(readPdfBoxes(mixed).mediaBox, [
    [0, 0, 100, 200],
    [0, 0, 300, 400],
  ]);
});

test('readPdfBoxes: 圧縮されたオブジェクトストリームの中も読む', () => {
  /* Vivliostyle の出力はページ辞書を /ObjStm へ入れる．
     平文だけを見ると矩形を 1 つも読めない */
  const inner = '<< /Type /Page /MediaBox [0 0 532.9132 745.92 ] /TrimBox [8.5 8.9 524.4 737.4 ] >>';
  const payload = zlib.deflateSync(Buffer.from(inner, 'latin1'));
  const pdf = Buffer.concat([
    Buffer.from(
      `%PDF-1.7\n5 0 obj\n<< /Type /ObjStm /N 1 /First 0 /Filter /FlateDecode /Length ${payload.length} >>\nstream\n`,
      'latin1'
    ),
    payload,
    Buffer.from('\nendstream\nendobj\n', 'latin1'),
  ]);

  const boxes = readPdfBoxes(pdf);
  assert.deepEqual(boxes.mediaBox, [[0, 0, 532.9132, 745.92]]);
  assert.deepEqual(boxes.trimBox, [[8.5, 8.9, 524.4, 737.4]]);
});

test('readPdfBoxes: 平文と圧縮側で同じ矩形を二重に数えない', () => {
  const inner = '<< /Type /Page /MediaBox [0 0 532.9132 745.92 ] >>';
  const payload = zlib.deflateSync(Buffer.from(inner, 'latin1'));
  const pdf = Buffer.concat([
    Buffer.from(
      `%PDF-1.7\n<< /MediaBox [0 0 532.9132 745.92 ] >>\n5 0 obj\n<< /Type /ObjStm /N 1 /First 0 /Filter /FlateDecode /Length ${payload.length} >>\nstream\n`,
      'latin1'
    ),
    payload,
    Buffer.from('\nendstream\nendobj\n', 'latin1'),
  ]);

  assert.equal(readPdfBoxes(pdf).mediaBox.length, 1);
});

test('readPdfBoxes: 該当が無ければ空の配列を返す', () => {
  const boxes = readPdfBoxes(Buffer.from('%PDF-1.7', 'latin1'));
  assert.deepEqual(boxes.mediaBox, []);
  assert.deepEqual(boxes.trimBox, []);
});

// --- boxSizeMm ---

test('boxSizeMm: ポイントの矩形をミリメートルの寸法へ直す', () => {
  const size = boxSizeMm([0, 0, 532.9132, 745.92]);
  assert.ok(Math.abs(size.width - 188) < 0.1, `width=${size.width}`);
  assert.ok(Math.abs(size.height - 263.1) < 0.1, `height=${size.height}`);
});

test('boxSizeMm: 原点がずれた矩形でも差分から寸法を求める', () => {
  const size = boxSizeMm([8.50395, 8.9119, 524.4093, 737.416]);
  assert.ok(Math.abs(size.width - 182) < 0.1, `width=${size.width}`);
  assert.ok(Math.abs(size.height - 257) < 0.1, `height=${size.height}`);
});

// --- verifyBleedSize ---

/* 塗り足し 3 mm を含む 188 x 263 mm と，仕上がり 182 x 257 mm の組み */
const BLED_BOXES = {
  mediaBox: [[0, 0, 532.9132, 745.92]],
  trimBox: [[8.50395, 8.9119, 524.4093, 737.416]],
};

test('verifyBleedSize: 仕上がりより塗り足し 2 つ分だけ大きければ成功する', () => {
  assert.equal(verifyBleedSize(BLED_BOXES, 3, '表 1（表紙）').ok, true);
});

test('verifyBleedSize: 塗り足しの量が違えば実測と想定を添えて失敗する', () => {
  const result = verifyBleedSize(BLED_BOXES, 5, '表 1（表紙）');
  assert.equal(result.ok, false);
  assert.match(result.message, /表 1（表紙）/);
  assert.match(result.message, /5/);
});

test('verifyBleedSize: 塗り足しが付いていなければ失敗する', () => {
  const noBleed = {
    mediaBox: [[0, 0, 515.9055, 728.5039]],
    trimBox: [[0, 0, 515.9055, 728.5039]],
  };
  assert.equal(verifyBleedSize(noBleed, 3, '表 4（裏表紙）').ok, false);
});

test('verifyBleedSize: 矩形が無ければ箱の名前を添えて失敗する', () => {
  const result = verifyBleedSize({ mediaBox: BLED_BOXES.mediaBox, trimBox: [] }, 3, '表 4（裏表紙）');
  assert.equal(result.ok, false);
  assert.match(result.message, /TrimBox/);
  assert.match(result.message, /表 4（裏表紙）/);
});

test('verifyBleedSize: 寸法の違う矩形が混ざれば失敗する', () => {
  const mixed = {
    mediaBox: [
      [0, 0, 532.9132, 745.92],
      [0, 0, 515.9055, 728.5039],
    ],
    trimBox: BLED_BOXES.trimBox,
  };
  const result = verifyBleedSize(mixed, 3, '表 1（表紙）');
  assert.equal(result.ok, false);
  assert.match(result.message, /MediaBox/);
});

test('verifyBleedSize: 許容の幅に収まるずれは通す', () => {
  /* Vivliostyle は小数の丸めで 0.1 mm ほどずれる */
  assert.ok(BOX_TOLERANCE_MM >= 0.5);
  const rounded = {
    mediaBox: [[0, 0, 533.2, 745.8]],
    trimBox: [[8.50395, 8.9119, 524.4093, 737.416]],
  };
  assert.equal(verifyBleedSize(rounded, 3, '表 1（表紙）').ok, true);
});

// --- verifyTrimSizeMatch ---

test('verifyTrimSizeMatch: 表 1 と表 4 の仕上がりがそろっていれば成功する', () => {
  const result = verifyTrimSizeMatch([
    { label: '表 1（表紙）', size: { width: 182, height: 257 } },
    { label: '表 4（裏表紙）', size: { width: 182, height: 257 } },
  ]);
  assert.equal(result.ok, true);
});

test('verifyTrimSizeMatch: 仕上がりが食い違えば対象と実測を添えて失敗する', () => {
  const result = verifyTrimSizeMatch([
    { label: '表 1（表紙）', size: { width: 182, height: 257 } },
    { label: '表 4（裏表紙）', size: { width: 148, height: 210 } },
  ]);
  assert.equal(result.ok, false);
  assert.match(result.message, /表 4（裏表紙）/);
  assert.match(result.message, /148/);
});

test('verifyTrimSizeMatch: 対象が 1 つだけなら比べる相手が無く成功する', () => {
  const result = verifyTrimSizeMatch([{ label: '表 1（表紙）', size: { width: 182, height: 257 } }]);
  assert.equal(result.ok, true);
});
