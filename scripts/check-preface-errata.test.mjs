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

  it('複数行の HTML コメント内のマーカーは対象外（VFM が段落化せず注入されない）', () => {
    const content = [
      '# まえがき',
      '',
      '<!--',
      '{{errata}}',
      '-->',
      '',
    ].join('\n');
    assert.equal(hasErrataMarker(content), false);
  });

  it('同一行で閉じた HTML コメント内のマーカーは対象外', () => {
    const content = '# まえがき\n\n<!-- {{errata}} -->\n';
    assert.equal(hasErrataMarker(content), false);
  });

  it('コメント終了行に続けて書かれたマーカーは対象外（HTML ブロックは行末まで続く）', () => {
    const content = '# まえがき\n\n<!--\n注釈\n--> {{errata}}\n';
    assert.equal(hasErrataMarker(content), false);
  });

  it('HTML コメントの外にある本物のマーカーは検出する', () => {
    const content = [
      '# まえがき',
      '',
      '<!--',
      '{{errata}}',
      '-->',
      '',
      '{{errata}}',
      '',
    ].join('\n');
    assert.equal(hasErrataMarker(content), true);
  });

  it('コードフェンス内の <!-- はコメント開始とみなさない', () => {
    const content = [
      '# まえがき',
      '',
      '```markdown',
      '<!--',
      '```',
      '',
      '{{errata}}',
      '',
    ].join('\n');
    assert.equal(hasErrataMarker(content), true);
  });

  it('終了行で別のコメントが開いた場合，後続のマーカーは対象外', () => {
    const content = '# まえがき\n\n<!--\n注釈\n--> <!--\n{{errata}}\n-->\n';
    assert.equal(hasErrataMarker(content), false);
  });

  it('インラインコード内の <!-- はコメント開始とみなさない', () => {
    const content = '# まえがき\n\n`<!--` で注釈を書ける．\n\n{{errata}}\n';
    assert.equal(hasErrataMarker(content), true);
  });

  it('エスケープされた \\<!-- はコメント開始とみなさない', () => {
    const content = '# まえがき\n\n\\<!-- はそのまま表示される．\n\n{{errata}}\n';
    assert.equal(hasErrataMarker(content), true);
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
