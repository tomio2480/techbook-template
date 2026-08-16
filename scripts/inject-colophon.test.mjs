import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAuthorsSection,
  buildErrataSection,
  buildCopyrightSection,
  injectColophonPlugin,
} from './inject-colophon.mjs';

/** hast の element ノードを組み立てるテスト用ヘルパー */
function el(tagName, children = [], properties = {}) {
  return { type: 'element', tagName, properties, children };
}

function textNode(value) {
  return { type: 'text', value };
}

function markerParagraph(marker) {
  return el('p', [textNode(marker)]);
}

/** ノード配下のテキストを連結して返す */
function textOf(node) {
  if (node.type === 'text') return node.value;
  return (node.children ?? []).map(textOf).join('');
}

/** ノード配下から className に一致する element をすべて集める */
function findByClass(node, className) {
  const found = [];
  const visit = (n) => {
    const classes = n.properties?.className ?? [];
    if (classes.includes(className)) found.push(n);
    (n.children ?? []).forEach(visit);
  };
  visit(node);
  return found;
}

const AUTHOR = {
  name: '著者名',
  sns: '@example',
  bio: '組込みと電子工作が好きな著者．',
  link: { title: 'Web サイト', url: 'https://example.com/' },
};

describe('buildAuthorsSection', () => {
  it('著者一覧から colophon-authors セクションを組み立てる', () => {
    const section = buildAuthorsSection([AUTHOR], () => {});
    assert.equal(section.tagName, 'section');
    assert.ok(section.properties.className.includes('colophon-authors'));
    const heading = section.children[0];
    assert.equal(heading.tagName, 'h2');
    assert.equal(textOf(heading), '著者紹介');
  });

  it('氏名と SNS ID を「氏名（ID）」の形で出力する', () => {
    const section = buildAuthorsSection([AUTHOR], () => {});
    const [name] = findByClass(section, 'colophon-author-name');
    assert.equal(textOf(name), '著者名（@example）');
  });

  it('SNS ID が無い著者は氏名のみを出力する', () => {
    const section = buildAuthorsSection([{ name: '著者名' }], () => {});
    const [name] = findByClass(section, 'colophon-author-name');
    assert.equal(textOf(name), '著者名');
  });

  it('紹介文を出力する', () => {
    const section = buildAuthorsSection([AUTHOR], () => {});
    const [bio] = findByClass(section, 'colophon-author-bio');
    assert.equal(textOf(bio), AUTHOR.bio);
  });

  it('リンクはタイトルと URL を並記し，URL をアンカーにする', () => {
    const section = buildAuthorsSection([AUTHOR], () => {});
    const [link] = findByClass(section, 'colophon-author-link');
    assert.equal(textOf(link), 'Web サイト：https://example.com/');
    const anchor = findAnchor(link);
    assert.equal(anchor.properties.href, 'https://example.com/');
  });

  it('bio やリンクが無い著者ではその行を出力しない', () => {
    const section = buildAuthorsSection([{ name: '著者名' }], () => {});
    assert.equal(findByClass(section, 'colophon-author-bio').length, 0);
    assert.equal(findByClass(section, 'colophon-author-link').length, 0);
  });

  it('リンクの title と url が揃わない場合は警告して行を省く', () => {
    const warnings = [];
    const section = buildAuthorsSection(
      [{ name: '著者名', link: { title: 'Web サイト' } }],
      (m) => warnings.push(m),
    );
    assert.equal(findByClass(section, 'colophon-author-link').length, 0);
    assert.equal(warnings.length, 1);
  });

  it('複数著者を順に出力する', () => {
    const section = buildAuthorsSection(
      [AUTHOR, { name: '二人目', sns: '@second' }],
      () => {},
    );
    assert.equal(findByClass(section, 'colophon-author').length, 2);
  });

  it('name の無い著者は警告して読み飛ばす', () => {
    const warnings = [];
    const section = buildAuthorsSection(
      [{ sns: '@no-name' }, AUTHOR],
      (m) => warnings.push(m),
    );
    assert.equal(findByClass(section, 'colophon-author').length, 1);
    assert.equal(warnings.length, 1);
  });

  it('authors が空・未定義なら警告して null を返す', () => {
    const warnings = [];
    assert.equal(buildAuthorsSection([], (m) => warnings.push(m)), null);
    assert.equal(buildAuthorsSection(undefined, (m) => warnings.push(m)), null);
    assert.equal(warnings.length, 2);
  });
});

describe('buildErrataSection', () => {
  const ERRATA = { url: 'https://example.github.io/errata/books/example-book/' };

  it('正誤表 URL から colophon-errata セクションを組み立てる', () => {
    const section = buildErrataSection(ERRATA, () => {});
    assert.equal(section.tagName, 'section');
    assert.ok(section.properties.className.includes('colophon-errata'));
    const anchor = findAnchor(section);
    assert.equal(anchor.properties.href, ERRATA.url);
    assert.equal(textOf(anchor), ERRATA.url);
  });

  it('案内文を出力する', () => {
    const section = buildErrataSection(ERRATA, () => {});
    assert.ok(textOf(section).includes('正誤表'));
  });

  it('案内文の句読点は原稿と同じ「．」「，」で，「。」「、」を含まない', () => {
    const section = buildErrataSection(ERRATA, () => {});
    const [label] = findByClass(section, 'colophon-errata-label');
    assert.match(textOf(label), /．$/);
    assert.doesNotMatch(textOf(label), /[。、]/);
  });

  it('url が無い・http(s) でない場合は警告して null を返す', () => {
    const warnings = [];
    assert.equal(buildErrataSection(undefined, (m) => warnings.push(m)), null);
    assert.equal(buildErrataSection({}, (m) => warnings.push(m)), null);
    assert.equal(
      buildErrataSection({ url: 'example.com' }, (m) => warnings.push(m)),
      null,
    );
    assert.equal(warnings.length, 3);
  });
});

describe('buildCopyrightSection', () => {
  const COPYRIGHT = { year: 2026, holder: '著者名' };

  it('著作権表記から colophon-copyright セクションを組み立てる', () => {
    const section = buildCopyrightSection(COPYRIGHT, undefined, () => {});
    assert.equal(section.tagName, 'section');
    assert.ok(section.properties.className.includes('colophon-copyright'));
  });

  it('© 行に year と holder を出力する', () => {
    const section = buildCopyrightSection(COPYRIGHT, undefined, () => {});
    const [line] = findByClass(section, 'colophon-copyright-line');
    assert.equal(textOf(line), '© 2026 著者名');
  });

  it('notice 未指定時は既定の禁止文言を出力する', () => {
    const section = buildCopyrightSection(COPYRIGHT, undefined, () => {});
    const [notice] = findByClass(section, 'colophon-copyright-notice');
    assert.ok(textOf(notice).includes('禁じます'));
  });

  it('既定の禁止文言の句読点は「．」「，」で，「。」「、」を含まない', () => {
    const section = buildCopyrightSection(COPYRIGHT, undefined, () => {});
    const [notice] = findByClass(section, 'colophon-copyright-notice');
    assert.match(textOf(notice), /．$/);
    assert.doesNotMatch(textOf(notice), /[。、]/);
  });

  it('notice を指定すると差し替わる', () => {
    const section = buildCopyrightSection(
      { ...COPYRIGHT, notice: '独自の文言．' },
      undefined,
      () => {},
    );
    const [notice] = findByClass(section, 'colophon-copyright-notice');
    assert.equal(textOf(notice), '独自の文言．');
  });

  it('holder 省略時は fallbackHolder（book.yaml の author）を使う', () => {
    const section = buildCopyrightSection({ year: 2026 }, 'フォールバック著者', () => {});
    const [line] = findByClass(section, 'colophon-copyright-line');
    assert.equal(textOf(line), '© 2026 フォールバック著者');
  });

  it('year が YYYY-YYYY 形式の文字列も受け付ける', () => {
    const section = buildCopyrightSection(
      { year: '2025-2026', holder: '著者名' },
      undefined,
      () => {},
    );
    const [line] = findByClass(section, 'colophon-copyright-line');
    assert.equal(textOf(line), '© 2025-2026 著者名');
  });

  it('year が未設定の場合は警告して null を返す', () => {
    const warnings = [];
    assert.equal(
      buildCopyrightSection({ holder: '著者名' }, undefined, (m) => warnings.push(m)),
      null,
    );
    assert.equal(warnings.length, 1);
  });

  it('year が形式違反（2 桁）の場合は警告して null を返す', () => {
    const warnings = [];
    assert.equal(
      buildCopyrightSection({ year: '26', holder: '著者名' }, undefined, (m) => warnings.push(m)),
      null,
    );
    assert.equal(warnings.length, 1);
  });

  it('holder も fallbackHolder も無い場合は警告して null を返す', () => {
    const warnings = [];
    assert.equal(
      buildCopyrightSection({ year: 2026 }, undefined, (m) => warnings.push(m)),
      null,
    );
    assert.equal(warnings.length, 1);
  });

  it('holder と fallbackHolder が両方ある場合は holder を優先する', () => {
    const section = buildCopyrightSection(
      { year: 2026, holder: '個別著者' },
      'フォールバック著者',
      () => {},
    );
    const [line] = findByClass(section, 'colophon-copyright-line');
    assert.equal(textOf(line), '© 2026 個別著者');
  });

  it('year が 0 の場合は警告して null を返す', () => {
    const warnings = [];
    assert.equal(
      buildCopyrightSection({ year: 0, holder: '著者名' }, undefined, (m) => warnings.push(m)),
      null,
    );
    assert.equal(warnings.length, 1);
  });

  it('year が null の場合は警告して null を返す', () => {
    const warnings = [];
    assert.equal(
      buildCopyrightSection({ year: null, holder: '著者名' }, undefined, (m) => warnings.push(m)),
      null,
    );
    assert.equal(warnings.length, 1);
  });

  it('copyright が未設定の場合は警告して null を返す', () => {
    const warnings = [];
    assert.equal(
      buildCopyrightSection(undefined, '著者名', (m) => warnings.push(m)),
      null,
    );
    assert.equal(warnings.length, 1);
  });
});

describe('injectColophonPlugin', () => {
  const OPTIONS = {
    authors: [AUTHOR],
    errata: { url: 'https://example.github.io/errata/books/example-book/' },
    copyright: { year: 2026, holder: '著者名' },
    fallbackAuthor: '著者名',
    warn: () => {},
  };

  function makeTree() {
    return {
      type: 'root',
      children: [
        el('section', [
          el('h1', [textNode('書籍タイトル')]),
          markerParagraph('{{authors}}'),
          el('p', [textNode('本文の段落')]),
          markerParagraph('{{errata}}'),
          markerParagraph('{{copyright}}'),
        ]),
      ],
    };
  }

  it('{{authors}} マーカーを著者紹介セクションへ置き換える', () => {
    const tree = makeTree();
    injectColophonPlugin(OPTIONS)(tree);
    assert.equal(findByClass(tree, 'colophon-authors').length, 1);
    assert.ok(!textOf(tree).includes('{{authors}}'));
  });

  it('{{errata}} マーカーを正誤表セクションへ置き換える', () => {
    const tree = makeTree();
    injectColophonPlugin(OPTIONS)(tree);
    assert.equal(findByClass(tree, 'colophon-errata').length, 1);
    assert.ok(!textOf(tree).includes('{{errata}}'));
  });

  it('{{copyright}} マーカーを著作権表記セクションへ置き換える', () => {
    const tree = makeTree();
    injectColophonPlugin(OPTIONS)(tree);
    assert.equal(findByClass(tree, 'colophon-copyright').length, 1);
    assert.ok(!textOf(tree).includes('{{copyright}}'));
  });

  it('マーカー以外の段落は変更しない', () => {
    const tree = makeTree();
    injectColophonPlugin(OPTIONS)(tree);
    assert.ok(textOf(tree).includes('本文の段落'));
  });

  it('データが無い場合はマーカーを取り除いて警告する', () => {
    const warnings = [];
    const tree = makeTree();
    injectColophonPlugin({ warn: (m) => warnings.push(m) })(tree);
    assert.ok(!textOf(tree).includes('{{authors}}'));
    assert.ok(!textOf(tree).includes('{{errata}}'));
    assert.ok(!textOf(tree).includes('{{copyright}}'));
    assert.equal(warnings.length, 3);
  });

  it('前後に空白があるマーカーも置き換える', () => {
    const tree = { type: 'root', children: [markerParagraph('  {{authors}}\n')] };
    injectColophonPlugin(OPTIONS)(tree);
    assert.equal(findByClass(tree, 'colophon-authors').length, 1);
  });

  it('文章に埋め込まれたマーカー文字列は置き換えない', () => {
    const tree = {
      type: 'root',
      children: [el('p', [textNode('本文中の {{authors}} は置換しない')])],
    };
    injectColophonPlugin(OPTIONS)(tree);
    assert.ok(textOf(tree).includes('{{authors}}'));
  });
});

/** ノード配下から最初の a 要素を探す */
function findAnchor(node) {
  if (node.type === 'element' && node.tagName === 'a') return node;
  for (const child of node.children ?? []) {
    const found = findAnchor(child);
    if (found) return found;
  }
  return null;
}
