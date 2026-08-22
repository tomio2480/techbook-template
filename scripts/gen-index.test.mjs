import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  GROUP_UNCLASSIFIED,
  fallbackTerm,
  groupOf,
  buildIndexEntries,
  renderSkeleton,
  generateIndex,
} from './gen-index.mjs';
import { collectReferences, crossCheck } from './check-index.mjs';

function writeBook(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-index-'));
  for (const [rel, content] of Object.entries(files)) {
    const dest = path.join(root, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content, 'utf-8');
  }
  return root;
}

describe('fallbackTerm', () => {
  it('接頭辞と末尾の連番を取り除く', () => {
    assert.equal(fallbackTerm('idx-forward-voltage-1'), 'forward-voltage');
  });

  it('連番が無い id でも接頭辞だけを取り除く', () => {
    assert.equal(fallbackTerm('idx-arduino'), 'arduino');
  });

  it('取り除くと空になる id はそのまま返す', () => {
    assert.equal(fallbackTerm('idx-'), 'idx-');
  });

  it('接頭辞を持たない id はそのまま返す', () => {
    assert.equal(fallbackTerm('section-1'), 'section-1');
  });
});

describe('groupOf', () => {
  it('英字で始まる見出し語を英字へ入れる', () => {
    assert.equal(groupOf({ term: 'Arduino', yomi: null }), '英字');
  });

  it('数字で始まる見出し語を数字へ入れる', () => {
    assert.equal(groupOf({ term: '5V 系', yomi: null }), '数字');
  });

  it('読みの頭で行を決める', () => {
    assert.equal(groupOf({ term: '順方向電圧', yomi: 'じゅんほうこうでんあつ' }), 'さ行');
  });

  it('濁点を清音の行として扱う', () => {
    assert.equal(groupOf({ term: '抵抗', yomi: 'ていこう' }), 'た行');
    assert.equal(groupOf({ term: '電圧', yomi: 'でんあつ' }), 'た行');
  });

  it('半濁点を は行 として扱う', () => {
    assert.equal(groupOf({ term: 'パスコン', yomi: 'ぱすこん' }), 'は行');
  });

  it('小書きの仮名を大書きの行として扱う', () => {
    assert.equal(groupOf({ term: 'ャ止め', yomi: 'ゃどめ' }), 'や行');
  });

  it('片仮名の読みを平仮名として扱う', () => {
    assert.equal(groupOf({ term: '抵抗', yomi: 'テイコウ' }), 'た行');
  });

  it('ん を わ行 へ入れる', () => {
    assert.equal(groupOf({ term: 'ん', yomi: 'ん' }), 'わ行');
  });

  it('読みが無い和文の語を未分類へ入れる', () => {
    assert.equal(groupOf({ term: '順方向電圧', yomi: null }), GROUP_UNCLASSIFIED);
  });

  it('読みが仮名で始まらない語を未分類へ入れる', () => {
    assert.equal(groupOf({ term: '順方向電圧', yomi: '順方向' }), GROUP_UNCLASSIFIED);
  });
});

describe('buildIndexEntries', () => {
  const anchors = [
    { id: 'idx-arduino-1', term: 'Arduino', yomi: null, href: '01-introduction.html#idx-arduino-1' },
    { id: 'idx-teikou-1', term: '抵抗', yomi: 'ていこう', href: '01-introduction.html#idx-teikou-1' },
    { id: 'idx-arduino-2', term: 'Arduino', yomi: null, href: '02-advanced.html#idx-arduino-2' },
  ];

  it('同じ見出し語の参照をまとめる', () => {
    const groups = buildIndexEntries(anchors);
    const alpha = groups.find((group) => group.name === '英字');
    assert.equal(alpha.items.length, 1);
    assert.deepEqual(alpha.items[0].hrefs, [
      '01-introduction.html#idx-arduino-1',
      '02-advanced.html#idx-arduino-2',
    ]);
  });

  it('区分を既定の順に並べる', () => {
    const groups = buildIndexEntries(anchors);
    assert.deepEqual(groups.map((group) => group.name), ['英字', 'た行']);
  });

  it('区分の中を読みの順に並べる', () => {
    const groups = buildIndexEntries([
      { id: 'idx-b-1', term: '電圧', yomi: 'でんあつ', href: 'a.html#idx-b-1' },
      { id: 'idx-a-1', term: '抵抗', yomi: 'ていこう', href: 'a.html#idx-a-1' },
    ]);
    assert.deepEqual(groups[0].items.map((item) => item.term), ['抵抗', '電圧']);
  });

  it('見出し語が無いアンカーへ目印を付ける', () => {
    const groups = buildIndexEntries([
      { id: 'idx-plain-1', term: null, yomi: null, href: 'a.html#idx-plain-1' },
    ]);
    const item = groups[0].items[0];
    assert.equal(item.term, 'plain');
    assert.equal(item.provisionalTerm, true);
  });

  it('読みが無い和文の語へ目印を付ける', () => {
    const groups = buildIndexEntries([
      { id: 'idx-teikou-1', term: '抵抗', yomi: null, href: 'a.html#idx-teikou-1' },
    ]);
    assert.equal(groups[0].name, GROUP_UNCLASSIFIED);
    assert.equal(groups[0].items[0].missingYomi, true);
  });

  it('英字の見出し語には読みを求めない', () => {
    const groups = buildIndexEntries([
      { id: 'idx-arduino-1', term: 'Arduino', yomi: null, href: 'a.html#idx-arduino-1' },
    ]);
    assert.equal(groups[0].items[0].missingYomi, false);
  });
});

describe('renderSkeleton', () => {
  const groups = buildIndexEntries([
    { id: 'idx-arduino-1', term: 'Arduino', yomi: null, href: '01-introduction.html#idx-arduino-1' },
    { id: 'idx-arduino-2', term: 'Arduino', yomi: null, href: '02-advanced.html#idx-arduino-2' },
    { id: 'idx-teikou-1', term: '抵抗', yomi: 'ていこう', href: '01-introduction.html#idx-teikou-1' },
  ]);

  it('区分の見出しと一覧を組み立てる', () => {
    const skeleton = renderSkeleton(groups);
    assert.ok(skeleton.includes('<div class="index-body">'));
    assert.ok(skeleton.includes('<p class="index-group">英字</p>'));
    assert.ok(skeleton.includes('<span class="index-term">Arduino</span>'));
    assert.ok(skeleton.includes('href="02-advanced.html#idx-arduino-2"'));
  });

  it('ページ番号を書かない', () => {
    assert.ok(!/>\s*\d+\s*</.test(renderSkeleton(groups)));
  });

  it('目印の要る項目へ HTML コメントを添える', () => {
    const skeleton = renderSkeleton(buildIndexEntries([
      { id: 'idx-teikou-1', term: '抵抗', yomi: null, href: 'a.html#idx-teikou-1' },
    ]));
    assert.ok(skeleton.includes('<!--'));
    assert.ok(skeleton.includes('data-yomi'));
  });

  it('組み立てた骨組みが検査を通る参照になる', async () => {
    const references = await collectReferences(renderSkeleton(groups));
    assert.equal(references.length, 3);
    const errors = crossCheck({
      anchorsByEntry: new Map([
        ['src/chapters/01-introduction.md', [{ id: 'idx-arduino-1' }, { id: 'idx-teikou-1' }]],
        ['src/chapters/02-advanced.md', [{ id: 'idx-arduino-2' }]],
      ]),
      references,
      entryByHtmlName: new Map([
        ['01-introduction.html', 'src/chapters/01-introduction.md'],
        ['02-advanced.html', 'src/chapters/02-advanced.md'],
      ]),
      indexEntry: 'src/chapters/99-index.md',
    });
    assert.deepEqual(errors, []);
  });
});

describe('generateIndex', () => {
  const CHAPTER = '# はじめに\n\n<a id="idx-arduino-1" data-index="Arduino"></a>Arduino は…\n';
  const INDEX = '---\nclass: index\n---\n\n# 索引\n';

  it('本文のアンカーから骨組みを作る', async () => {
    const root = writeBook({
      'src/chapters/01-introduction.md': CHAPTER,
      'src/chapters/99-index.md': INDEX,
    });
    const result = await generateIndex({
      repoRoot: root,
      entries: ['src/chapters/01-introduction.md', 'src/chapters/99-index.md'],
    });
    assert.equal(result.anchorCount, 1);
    assert.ok(result.skeleton.includes('01-introduction.html#idx-arduino-1'));
  });

  it('索引の原稿そのものは走査しない', async () => {
    const root = writeBook({
      'src/chapters/01-introduction.md': CHAPTER,
      'src/chapters/99-index.md': `${INDEX}\n<a id="idx-noise-1"></a>\n`,
    });
    const result = await generateIndex({
      repoRoot: root,
      entries: ['src/chapters/01-introduction.md', 'src/chapters/99-index.md'],
    });
    assert.ok(!result.skeleton.includes('idx-noise-1'));
  });

  it('索引の原稿が無くても骨組みを作る', async () => {
    const root = writeBook({ 'src/chapters/01-introduction.md': CHAPTER });
    const result = await generateIndex({
      repoRoot: root,
      entries: ['src/chapters/01-introduction.md'],
    });
    assert.equal(result.anchorCount, 1);
  });

  it('アンカーが無ければ空の骨組みと知らせを返す', async () => {
    const root = writeBook({ 'src/chapters/01-introduction.md': '# はじめに\n\n本文．\n' });
    const result = await generateIndex({
      repoRoot: root,
      entries: ['src/chapters/01-introduction.md'],
    });
    assert.equal(result.anchorCount, 0);
    assert.ok(result.warnings.some((message) => message.includes('アンカー')));
  });

  it('要確認の項目を warnings へ挙げる', async () => {
    const root = writeBook({
      'src/chapters/01-introduction.md':
        '# はじめに\n\n<a id="idx-teikou-1" data-index="抵抗"></a>抵抗は…\n',
    });
    const result = await generateIndex({
      repoRoot: root,
      entries: ['src/chapters/01-introduction.md'],
    });
    assert.ok(result.warnings.some((message) => message.includes('抵抗')));
  });
});
