import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  INDEX_CLASS,
  frontmatterClasses,
  collectAnchors,
  collectReferences,
  parseReferenceHref,
  crossCheck,
  checkIndex,
} from './check-index.mjs';

/* 一時ディレクトリへ本 1 冊分の原稿を書き出す．戻り値は repoRoot */
function writeBook(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-index-'));
  for (const [rel, content] of Object.entries(files)) {
    const dest = path.join(root, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content, 'utf-8');
  }
  return root;
}

describe('frontmatterClasses', () => {
  it('frontmatter の class を配列で返す', () => {
    assert.deepEqual(frontmatterClasses('---\nclass: index\n---\n\n# 索引\n'), ['index']);
  });

  it('空白区切りの複数指定を分ける', () => {
    assert.deepEqual(
      frontmatterClasses('---\nclass: index indent-western\n---\n'),
      ['index', 'indent-western'],
    );
  });

  it('frontmatter が無い原稿では空配列を返す', () => {
    assert.deepEqual(frontmatterClasses('# 索引\n'), []);
  });

  it('class を持たない frontmatter では空配列を返す', () => {
    assert.deepEqual(frontmatterClasses('---\ntitle: あとがき\n---\n'), []);
  });

  it('壊れた frontmatter でも例外を投げない', () => {
    assert.deepEqual(frontmatterClasses('---\nclass: [\n---\n'), []);
  });

  it('文字列でない入力では空配列を返す', () => {
    assert.deepEqual(frontmatterClasses(null), []);
  });
});

describe('collectAnchors', () => {
  it('見出し語と読みを持つアンカーを拾う', async () => {
    const anchors = await collectAnchors(
      '<a id="idx-arduino-1" data-index="Arduino" data-yomi="あるでゅいーの"></a>本文．\n',
    );
    assert.deepEqual(anchors, [{ id: 'idx-arduino-1', term: 'Arduino', yomi: 'あるでゅいーの' }]);
  });

  it('見出し語と読みが無くても id を拾う', async () => {
    const anchors = await collectAnchors('<a id="idx-plain-1"></a>本文．\n');
    assert.deepEqual(anchors, [{ id: 'idx-plain-1', term: null, yomi: null }]);
  });

  it('接頭辞 idx- を持たない id は拾わない', async () => {
    const anchors = await collectAnchors('<a id="section-1"></a>本文．\n');
    assert.deepEqual(anchors, []);
  });

  it('コードフェンスの中のアンカーは拾わない', async () => {
    const anchors = await collectAnchors('```html\n<a id="idx-fence-1"></a>\n```\n');
    assert.deepEqual(anchors, []);
  });

  it('インラインコードの中のアンカーは拾わない', async () => {
    const anchors = await collectAnchors('例は `<a id="idx-inline-1"></a>` である．\n');
    assert.deepEqual(anchors, []);
  });

  it('HTML コメントの中のアンカーは拾わない', async () => {
    const anchors = await collectAnchors('<!-- <a id="idx-comment-1"></a> -->\n\n本文．\n');
    assert.deepEqual(anchors, []);
  });

  it('本文での出現順に並べる', async () => {
    const anchors = await collectAnchors(
      '<a id="idx-b-1"></a>あ．\n\n<a id="idx-a-1"></a>い．\n',
    );
    assert.deepEqual(anchors.map((a) => a.id), ['idx-b-1', 'idx-a-1']);
  });
});

describe('collectReferences', () => {
  const INDEX_MD = [
    '---',
    'class: index',
    '---',
    '',
    '# 索引',
    '',
    '<ul class="index-list">',
    '<li><span class="index-term">Arduino</span><a class="index-page"'
      + ' href="01-introduction.html#idx-arduino-1"></a></li>',
    '</ul>',
    '',
  ].join('\n');

  it('index-page の href を拾う', async () => {
    const refs = await collectReferences(INDEX_MD);
    assert.deepEqual(refs, [
      { href: '01-introduction.html#idx-arduino-1', file: '01-introduction.html', id: 'idx-arduino-1' },
    ]);
  });

  it('index-page 以外のリンクは拾わない', async () => {
    const refs = await collectReferences('[目次](toc.html)\n');
    assert.deepEqual(refs, []);
  });

  it('コードフェンスの中の参照は拾わない', async () => {
    const refs = await collectReferences(
      '```html\n<a class="index-page" href="01-introduction.html#idx-a-1"></a>\n```\n',
    );
    assert.deepEqual(refs, []);
  });
});

describe('parseReferenceHref', () => {
  it('ファイル名とアンカーへ分ける', () => {
    assert.deepEqual(parseReferenceHref('01-introduction.html#idx-a-1'), {
      file: '01-introduction.html',
      id: 'idx-a-1',
    });
  });

  it('アンカーを持たない参照では id を null にする', () => {
    assert.deepEqual(parseReferenceHref('01-introduction.html'), {
      file: '01-introduction.html',
      id: null,
    });
  });

  it('ファイル名を持たない参照では file を null にする', () => {
    assert.deepEqual(parseReferenceHref('#idx-a-1'), { file: null, id: 'idx-a-1' });
  });

  it('ディレクトリを含む参照では file を null にする', () => {
    assert.deepEqual(parseReferenceHref('../other/01.html#idx-a-1'), { file: null, id: 'idx-a-1' });
  });

  it('百分率符号化された参照を原稿の綴りへ戻す', () => {
    assert.deepEqual(parseReferenceHref('01-introduction.html#idx-%E6%95%B0%E5%BC%8F'), {
      file: '01-introduction.html',
      id: 'idx-数式',
    });
  });

  it('壊れた符号化はそのままの文字列として扱う', () => {
    assert.deepEqual(parseReferenceHref('01-introduction.html#idx-%E6'), {
      file: '01-introduction.html',
      id: 'idx-%E6',
    });
  });
});

describe('crossCheck', () => {
  const base = () => ({
    anchorsByEntry: new Map([
      ['src/chapters/01-introduction.md', [{ id: 'idx-arduino-1', term: 'Arduino', yomi: null }]],
    ]),
    entryByHtmlName: new Map([
      ['01-introduction.html', 'src/chapters/01-introduction.md'],
      ['99-index.html', 'src/chapters/99-index.md'],
    ]),
    references: [
      { href: '01-introduction.html#idx-arduino-1', file: '01-introduction.html', id: 'idx-arduino-1' },
    ],
    indexEntry: 'src/chapters/99-index.md',
  });

  it('参照とアンカーが一致していればエラーを出さない', () => {
    assert.deepEqual(crossCheck(base()), []);
  });

  it('参照先の原稿が本に無いときにエラーを出す', () => {
    const input = base();
    input.references = [
      { href: '77-missing.html#idx-arduino-1', file: '77-missing.html', id: 'idx-arduino-1' },
    ];
    const errors = crossCheck(input);
    assert.equal(errors.length, 2);
    assert.ok(errors[0].includes('77-missing.html'));
    assert.ok(errors[0].includes('本に無い'));
  });

  it('参照先のアンカーが原稿に無いときにエラーを出す', () => {
    const input = base();
    input.references = [
      { href: '01-introduction.html#idx-typo-1', file: '01-introduction.html', id: 'idx-typo-1' },
    ];
    const errors = crossCheck(input);
    assert.ok(errors.some((e) => e.includes('idx-typo-1') && e.includes('アンカーが無い')));
  });

  it('索引から参照されていないアンカーにエラーを出す', () => {
    const input = base();
    input.references = [];
    const errors = crossCheck(input);
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes('idx-arduino-1'));
    assert.ok(errors[0].includes('参照されていない'));
  });

  it('形の壊れた参照にエラーを出す', () => {
    const input = base();
    input.references = [{ href: '01-introduction.html', file: '01-introduction.html', id: null }];
    const errors = crossCheck(input);
    assert.ok(errors.some((e) => e.includes('アンカーを指していない')));
  });

  it('id が本の中で重複しているときにエラーを出す', () => {
    const input = base();
    input.anchorsByEntry = new Map([
      ['src/chapters/01-introduction.md', [{ id: 'idx-arduino-1', term: 'Arduino', yomi: null }]],
      ['src/chapters/02-advanced.md', [{ id: 'idx-arduino-1', term: 'Arduino', yomi: null }]],
    ]);
    input.entryByHtmlName.set('02-advanced.html', 'src/chapters/02-advanced.md');
    const errors = crossCheck(input);
    assert.ok(errors.some((e) => e.includes('重複') && e.includes('idx-arduino-1')));
  });

  it('同じ原稿の中の重複も見つける', () => {
    const input = base();
    input.anchorsByEntry = new Map([
      [
        'src/chapters/01-introduction.md',
        [
          { id: 'idx-arduino-1', term: 'Arduino', yomi: null },
          { id: 'idx-arduino-1', term: 'Arduino', yomi: null },
        ],
      ],
    ]);
    const errors = crossCheck(input);
    assert.ok(errors.some((e) => e.includes('重複')));
  });
});

describe('checkIndex', () => {
  const CHAPTER = '# はじめに\n\n<a id="idx-arduino-1" data-index="Arduino"'
    + ' data-yomi="あるでゅいーの"></a>Arduino は…\n';
  const INDEX = [
    '---',
    'class: index',
    '---',
    '',
    '# 索引',
    '',
    '<ul class="index-list">',
    '<li><span class="index-term">Arduino</span><a class="index-page"'
      + ' href="01-introduction.html#idx-arduino-1"></a></li>',
    '</ul>',
    '',
  ].join('\n');

  it('参照が揃っていれば成功する', async () => {
    const root = writeBook({
      'src/chapters/01-introduction.md': CHAPTER,
      'src/chapters/99-index.md': INDEX,
    });
    const result = await checkIndex({
      repoRoot: root,
      entries: ['src/chapters/01-introduction.md', 'src/chapters/99-index.md'],
    });
    assert.equal(result.skipped, false);
    assert.deepEqual(result.errors, []);
    assert.equal(result.anchorCount, 1);
    assert.equal(result.referenceCount, 1);
  });

  it('索引の原稿が無い本では何も調べずに成功する', async () => {
    const root = writeBook({ 'src/chapters/01-introduction.md': CHAPTER });
    const result = await checkIndex({
      repoRoot: root,
      entries: ['src/chapters/01-introduction.md'],
    });
    assert.equal(result.skipped, true);
    assert.deepEqual(result.errors, []);
  });

  it('参照が食い違えばエラーを返す', async () => {
    const root = writeBook({
      'src/chapters/01-introduction.md': CHAPTER,
      'src/chapters/99-index.md': INDEX.replace('idx-arduino-1"><', 'idx-arduino-2"><'),
    });
    const result = await checkIndex({
      repoRoot: root,
      entries: ['src/chapters/01-introduction.md', 'src/chapters/99-index.md'],
    });
    assert.ok(result.errors.length > 0);
  });

  it('Markdown を持たない entry（toc.html）を走査の対象から外す', async () => {
    const root = writeBook({
      'src/chapters/01-introduction.md': CHAPTER,
      'src/chapters/toc.html': '<html><body><a id="idx-noise-1"></a></body></html>',
      'src/chapters/99-index.md': INDEX,
    });
    const result = await checkIndex({
      repoRoot: root,
      entries: [
        'src/chapters/01-introduction.md',
        'src/chapters/toc.html',
        'src/chapters/99-index.md',
      ],
    });
    assert.deepEqual(result.errors, []);
  });

  it('索引の原稿は class で見分ける', async () => {
    const root = writeBook({
      'src/chapters/01-introduction.md': CHAPTER,
      'src/chapters/zz-any-name.md': INDEX,
    });
    const result = await checkIndex({
      repoRoot: root,
      entries: ['src/chapters/01-introduction.md', 'src/chapters/zz-any-name.md'],
    });
    assert.equal(result.indexEntry, 'src/chapters/zz-any-name.md');
    assert.deepEqual(result.errors, []);
  });

  it('索引の原稿が 2 つあるときはエラーを返す', async () => {
    const root = writeBook({
      'src/chapters/01-introduction.md': CHAPTER,
      'src/chapters/98-index.md': INDEX,
      'src/chapters/99-index.md': INDEX,
    });
    const result = await checkIndex({
      repoRoot: root,
      entries: [
        'src/chapters/01-introduction.md',
        'src/chapters/98-index.md',
        'src/chapters/99-index.md',
      ],
    });
    assert.ok(result.errors.some((e) => e.includes(INDEX_CLASS)));
  });
});
