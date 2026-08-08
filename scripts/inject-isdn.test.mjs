import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildIsdnSection,
  buildIsdnBarcodeSection,
  injectIsdnPlugin,
} from './inject-isdn.mjs';

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

/** ノード配下から最初の img 要素を探す */
function findImg(node) {
  if (node.type === 'element' && node.tagName === 'img') return node;
  for (const child of node.children ?? []) {
    const found = findImg(child);
    if (found) return found;
  }
  return null;
}

const VALID_NUMBER = 'ISDN278-4-123456-78-1';
const BARCODE = { src: '../assets/isdn-barcode.png', exists: true };

describe('buildIsdnSection', () => {
  it('番号を colophon-isdn の単独段落として出力する', () => {
    const section = buildIsdnSection(VALID_NUMBER, () => {});
    assert.equal(section.tagName, 'p');
    assert.ok(section.properties.className.includes('colophon-isdn'));
    assert.equal(textOf(section), VALID_NUMBER);
  });

  it('番号が空なら警告して null を返す', () => {
    const warnings = [];
    assert.equal(buildIsdnSection('', (m) => warnings.push(m)), null);
    assert.equal(buildIsdnSection(undefined, (m) => warnings.push(m)), null);
    assert.equal(warnings.length, 2);
  });

  it('不正な番号は警告して null を返す', () => {
    const warnings = [];
    const section = buildIsdnSection('ISDN278-4-123456-78-2', (m) => warnings.push(m));
    assert.equal(section, null);
    assert.equal(warnings.length, 1);
  });
});

describe('buildIsdnBarcodeSection', () => {
  it('バーコード画像を isdn-barcode ブロックとして出力する', () => {
    const section = buildIsdnBarcodeSection(VALID_NUMBER, BARCODE, {}, () => {});
    assert.ok(section.properties.className.includes('isdn-barcode'));
    const img = findImg(section);
    assert.equal(img.properties.src, BARCODE.src);
  });

  it('代替テキストへ番号を含める', () => {
    const section = buildIsdnBarcodeSection(VALID_NUMBER, BARCODE, {}, () => {});
    const img = findImg(section);
    assert.equal(img.properties.alt, `ISDN バーコード（${VALID_NUMBER}）`);
  });

  it('番号が無効でも画像があれば配置し，代替テキストは番号なしにする', () => {
    const section = buildIsdnBarcodeSection('', BARCODE, {}, () => {});
    const img = findImg(section);
    assert.equal(img.properties.alt, 'ISDN バーコード');
  });

  it('画像が無い場合は警告して null を返す', () => {
    const warnings = [];
    const section = buildIsdnBarcodeSection(
      VALID_NUMBER,
      { src: '../assets/isdn-barcode.png', exists: false },
      {},
      (m) => warnings.push(m),
    );
    assert.equal(section, null);
    assert.equal(warnings.length, 1);
  });
});

describe('buildIsdnBarcodeSection の情報ブロック', () => {
  const APPLICATION = { cCode: '0095', price: '1000', circle: 'サークル名' };

  it('番号・C コードと価格・発行サークル名の 3 行を出力する', () => {
    const section = buildIsdnBarcodeSection(VALID_NUMBER, BARCODE, APPLICATION, () => {});
    assert.equal(findByClass(section, 'isdn-info').length, 1);
    assert.equal(textOf(findByClass(section, 'isdn-info-number')[0]), VALID_NUMBER);
    assert.equal(textOf(findByClass(section, 'isdn-info-code')[0]), 'C0095 ¥1000E');
    assert.equal(textOf(findByClass(section, 'isdn-info-publisher')[0]), '発行 サークル名');
  });

  it('番号が無効なら番号行を出さない', () => {
    const section = buildIsdnBarcodeSection('', BARCODE, APPLICATION, () => {});
    assert.equal(findByClass(section, 'isdn-info-number').length, 0);
  });

  it('C コードだけ・価格だけでもコード行を出す', () => {
    const withCode = buildIsdnBarcodeSection(VALID_NUMBER, BARCODE, { cCode: '0095' }, () => {});
    assert.equal(textOf(findByClass(withCode, 'isdn-info-code')[0]), 'C0095');
    const withPrice = buildIsdnBarcodeSection(VALID_NUMBER, BARCODE, { price: '500' }, () => {});
    assert.equal(textOf(findByClass(withPrice, 'isdn-info-code')[0]), '¥500E');
  });

  it('C 接頭辞付きの C コードや数値の価格も整形する', () => {
    const section = buildIsdnBarcodeSection(
      VALID_NUMBER,
      BARCODE,
      { cCode: 'C0095', price: 1000 },
      () => {},
    );
    assert.equal(textOf(findByClass(section, 'isdn-info-code')[0]), 'C0095 ¥1000E');
  });

  it('小数・負数など不正な価格は警告してコード行から外す', () => {
    for (const price of ['1000.50', '-1000', '1000円']) {
      const warnings = [];
      const section = buildIsdnBarcodeSection(
        VALID_NUMBER,
        BARCODE,
        { price },
        (m) => warnings.push(m),
      );
      assert.equal(findByClass(section, 'isdn-info-code').length, 0, `price=${price}`);
      assert.equal(warnings.length, 1, `price=${price}`);
    }
  });

  it('桁区切りカンマ付きの価格は整数へ整えて出す', () => {
    const section = buildIsdnBarcodeSection(VALID_NUMBER, BARCODE, { price: '1,000' }, () => {});
    assert.equal(textOf(findByClass(section, 'isdn-info-code')[0]), '¥1000E');
  });

  it('4 桁でない C コードは警告してコード行から外す', () => {
    const warnings = [];
    const section = buildIsdnBarcodeSection(
      VALID_NUMBER,
      BARCODE,
      { cCode: '95' },
      (m) => warnings.push(m),
    );
    assert.equal(findByClass(section, 'isdn-info-code').length, 0);
    assert.equal(warnings.length, 1);
  });

  it('番号も付随情報も無ければ情報ブロック自体を出さない', () => {
    const section = buildIsdnBarcodeSection('', BARCODE, {}, () => {});
    assert.equal(findByClass(section, 'isdn-info').length, 0);
  });

  it('application 未指定でも番号行だけの情報ブロックを出す', () => {
    const section = buildIsdnBarcodeSection(VALID_NUMBER, BARCODE, undefined, () => {});
    assert.ok(findImg(section));
    assert.equal(findByClass(section, 'isdn-info-number').length, 1);
    assert.equal(findByClass(section, 'isdn-info-code').length, 0);
    assert.equal(findByClass(section, 'isdn-info-publisher').length, 0);
  });
});

describe('injectIsdnPlugin', () => {
  const OPTIONS = { number: VALID_NUMBER, barcode: BARCODE, warn: () => {} };

  function makeTree() {
    return {
      type: 'root',
      children: [
        el('section', [
          markerParagraph('{{isdn}}'),
          el('p', [textNode('本文の段落')]),
          markerParagraph('{{isdn-barcode}}'),
        ]),
      ],
    };
  }

  it('{{isdn}} マーカーを番号の段落へ置き換える', () => {
    const tree = makeTree();
    injectIsdnPlugin(OPTIONS)(tree);
    assert.equal(findByClass(tree, 'colophon-isdn').length, 1);
    assert.ok(!textOf(tree).includes('{{isdn}}'));
  });

  it('{{isdn-barcode}} マーカーをバーコードブロックへ置き換える', () => {
    const tree = makeTree();
    injectIsdnPlugin(OPTIONS)(tree);
    assert.equal(findByClass(tree, 'isdn-barcode').length, 1);
    assert.ok(!textOf(tree).includes('{{isdn-barcode}}'));
  });

  it('マーカー以外の段落は変更しない', () => {
    const tree = makeTree();
    injectIsdnPlugin(OPTIONS)(tree);
    assert.ok(textOf(tree).includes('本文の段落'));
  });

  it('データが無い場合はマーカーを取り除いて警告する', () => {
    const warnings = [];
    const tree = makeTree();
    injectIsdnPlugin({ warn: (m) => warnings.push(m) })(tree);
    assert.ok(!textOf(tree).includes('{{isdn}}'));
    assert.ok(!textOf(tree).includes('{{isdn-barcode}}'));
    assert.equal(warnings.length, 2);
  });

  it('前後に空白があるマーカーも置き換える', () => {
    const tree = { type: 'root', children: [markerParagraph('  {{isdn}}\n')] };
    injectIsdnPlugin(OPTIONS)(tree);
    assert.equal(findByClass(tree, 'colophon-isdn').length, 1);
  });

  it('文章に埋め込まれたマーカー文字列は置き換えない', () => {
    const tree = {
      type: 'root',
      children: [el('p', [textNode('本文中の {{isdn}} は置換しない')])],
    };
    injectIsdnPlugin(OPTIONS)(tree);
    assert.ok(textOf(tree).includes('{{isdn}}'));
  });
});
