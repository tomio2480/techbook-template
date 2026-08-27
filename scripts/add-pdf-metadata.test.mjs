import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, PDFName } from 'pdf-lib';

import {
  buildXmpPacket,
  embedXmpMetadata,
  verifyPdfMetadata,
} from './add-pdf-metadata.mjs';

/** テスト用の最小 PDF（1 ページ・メタデータ無し）を作る */
async function createPlainPdf() {
  const doc = await PDFDocument.create();
  doc.addPage([100, 100]);
  return Buffer.from(await doc.save());
}

describe('buildXmpPacket', () => {
  it('書名・著者・言語を XMP の各要素へ書く', () => {
    const xmp = buildXmpPacket({ title: '実際の書名', author: '実際の著者', language: 'ja' });
    assert.ok(xmp.includes('<dc:title>'));
    assert.ok(xmp.includes('実際の書名'));
    assert.ok(xmp.includes('<dc:creator>'));
    assert.ok(xmp.includes('実際の著者'));
    assert.ok(xmp.includes('<dc:language>'));
    assert.ok(xmp.includes('>ja<'));
  });

  it('XML の特殊文字をエスケープする', () => {
    const xmp = buildXmpPacket({ title: 'A < B & C', author: 'x', language: 'ja' });
    assert.ok(xmp.includes('A &lt; B &amp; C'));
    assert.ok(!xmp.includes('A < B'));
  });

  it('PDF/UA の適合宣言（pdfuaid）を書かない', () => {
    const xmp = buildXmpPacket({ title: 't', author: 'a', language: 'ja' });
    assert.ok(!xmp.includes('pdfuaid'));
  });

  it('書名が無いときは dc:title を書かず警告する', () => {
    const warnings = [];
    const xmp = buildXmpPacket({ author: 'a', language: 'ja', warn: (m) => warnings.push(m) });
    assert.ok(!xmp.includes('<dc:title>'));
    assert.equal(warnings.length, 1);
  });

  it('著者が無いときは dc:creator を書かず警告する', () => {
    const warnings = [];
    const xmp = buildXmpPacket({ title: 't', language: 'ja', warn: (m) => warnings.push(m) });
    assert.ok(!xmp.includes('<dc:creator>'));
    assert.equal(warnings.length, 1);
  });
});

describe('embedXmpMetadata', () => {
  it('Catalog の Metadata 鍵として XMP ストリームを埋める', async () => {
    const plain = await createPlainPdf();
    const xmp = buildXmpPacket({ title: '書名', author: '著者', language: 'ja' });
    const embedded = Buffer.from(await embedXmpMetadata(plain, xmp));

    const doc = await PDFDocument.load(embedded, { updateMetadata: false });
    const ref = doc.catalog.get(PDFName.of('Metadata'));
    assert.ok(ref, 'Catalog に Metadata 鍵が無い');
    const stream = doc.context.lookup(ref);
    const content = Buffer.from(stream.contents).toString('utf8');
    assert.ok(content.includes('書名'));
  });
});

describe('verifyPdfMetadata', () => {
  it('Metadata を持つ PDF を合格させる', async () => {
    const plain = await createPlainPdf();
    const xmp = buildXmpPacket({ title: '書名', author: '著者', language: 'ja' });
    const embedded = Buffer.from(await embedXmpMetadata(plain, xmp));
    assert.equal(verifyPdfMetadata(embedded).ok, true);
  });

  it('Metadata の無い PDF を理由つきで不合格にする', async () => {
    const plain = await createPlainPdf();
    const result = verifyPdfMetadata(plain, 'テスト対象');
    assert.equal(result.ok, false);
    assert.ok(result.message.includes('テスト対象'));
  });
});
