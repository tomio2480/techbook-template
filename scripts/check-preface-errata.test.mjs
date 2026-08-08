import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hasErrataMarker } from './check-preface-errata.mjs';

describe('hasErrataMarker: 正常系', () => {
  it('{{errata}} が単独行にあれば true を返す', () => {
    const content = [
      '# まえがき',
      '',
      '本文．',
      '',
      '{{errata}}',
      '',
    ].join('\n');
    assert.equal(hasErrataMarker(content), true);
  });

  it('前後に空白があっても単独行として認識する', () => {
    const content = '# まえがき\n\n  {{errata}}  \n';
    assert.equal(hasErrataMarker(content), true);
  });
});

describe('hasErrataMarker: 異常系', () => {
  it('マーカーが無ければ false を返す', () => {
    const content = '# まえがき\n\n本文のみ．\n';
    assert.equal(hasErrataMarker(content), false);
  });

  it('文中に埋め込まれた同じ文字列は単独行と認識しない', () => {
    const content = '# まえがき\n\n本文中の {{errata}} は対象外．\n';
    assert.equal(hasErrataMarker(content), false);
  });

  it('空文字列は false を返す', () => {
    assert.equal(hasErrataMarker(''), false);
  });

  it('文字列以外の入力は false を返す', () => {
    assert.equal(hasErrataMarker(undefined), false);
    assert.equal(hasErrataMarker(null), false);
  });

  it('フェンスドコードブロック内のマーカーは対象外（VFM は <pre><code> になり注入されない）', () => {
    const content = [
      '# まえがき',
      '',
      '```markdown',
      '{{errata}}',
      '```',
      '',
    ].join('\n');
    assert.equal(hasErrataMarker(content), false);
  });

  it('4 スペースインデントのコードブロック内のマーカーは対象外', () => {
    const content = '# まえがき\n\n    {{errata}}\n';
    assert.equal(hasErrataMarker(content), false);
  });

  it('コードブロックの外にある本物のマーカーは検出する（ブロック混在時）', () => {
    const content = [
      '# まえがき',
      '',
      '```markdown',
      '{{errata}}',
      '```',
      '',
      '{{errata}}',
      '',
    ].join('\n');
    assert.equal(hasErrataMarker(content), true);
  });
});
