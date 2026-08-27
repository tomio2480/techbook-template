import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { labelFiguresPlugin } from './label-figures.mjs';

/** hast の element ノードを組み立てるテスト用ヘルパー */
function el(tagName, children = [], properties = {}) {
  return { type: 'element', tagName, properties, children };
}

function textNode(value) {
  return { type: 'text', value };
}

function img(properties) {
  return el('img', [], properties);
}

function figcaption(children) {
  return el('figcaption', children);
}

/** 最初に見つかった tagName の要素を返す */
function find(node, tagName) {
  if (node.type === 'element' && node.tagName === tagName) return node;
  for (const child of node.children ?? []) {
    const found = find(child, tagName);
    if (found) return found;
  }
  return undefined;
}

describe('labelFiguresPlugin', () => {
  it('figcaption の文字列を figure の aria-label へ写す', () => {
    const tree = {
      type: 'root',
      children: [
        el('figure', [
          img({ src: 'a.svg', alt: '回路図の説明' }),
          figcaption([textNode('LED 点滅回路の接続')]),
        ]),
      ],
    };
    labelFiguresPlugin({ warn: () => {} })(tree);
    assert.equal(find(tree, 'figure').properties.ariaLabel, 'LED 点滅回路の接続');
  });

  it('figcaption が入れ子要素を含む場合は連結した文字列を使う', () => {
    const tree = {
      type: 'root',
      children: [
        el('figure', [
          img({ src: 'a.svg', alt: '説明' }),
          figcaption([textNode('LED '), el('code', [textNode('blink')]), textNode(' 回路')]),
        ]),
      ],
    };
    labelFiguresPlugin({ warn: () => {} })(tree);
    assert.equal(find(tree, 'figure').properties.ariaLabel, 'LED blink 回路');
  });

  it('figcaption が無ければ子孫 img の alt を使う', () => {
    const tree = {
      type: 'root',
      children: [el('figure', [el('div', [img({ src: 'a.svg', alt: '回路図の説明' })])])],
    };
    labelFiguresPlugin({ warn: () => {} })(tree);
    assert.equal(find(tree, 'figure').properties.ariaLabel, '回路図の説明');
  });

  it('既に aria-label を持つ figure は変更しない', () => {
    const tree = {
      type: 'root',
      children: [
        el('figure', [img({ src: 'a.svg', alt: '別の説明' })], { ariaLabel: '手書きのラベル' }),
      ],
    };
    labelFiguresPlugin({ warn: () => {} })(tree);
    assert.equal(find(tree, 'figure').properties.ariaLabel, '手書きのラベル');
  });

  it('role="presentation" の figure はラベルを付けず警告もしない', () => {
    const warnings = [];
    const tree = {
      type: 'root',
      children: [
        el(
          'figure',
          [img({ src: 'a.svg', alt: '説明' }), figcaption([textNode('キャプション')])],
          { role: 'presentation' }
        ),
      ],
    };
    labelFiguresPlugin({ warn: (m) => warnings.push(m) })(tree);
    assert.equal(find(tree, 'figure').properties.ariaLabel, undefined);
    assert.equal(warnings.length, 0);
  });

  it('role="none" の figure もラベルを付けない', () => {
    const tree = {
      type: 'root',
      children: [el('figure', [img({ src: 'a.svg', alt: '説明' })], { role: 'none' })],
    };
    labelFiguresPlugin({ warn: () => {} })(tree);
    assert.equal(find(tree, 'figure').properties.ariaLabel, undefined);
  });

  it('figure 以外の役割（group 等）を明示した figure はラベルを付けない', () => {
    const tree = {
      type: 'root',
      children: [el('figure', [img({ src: 'a.svg', alt: '説明' })], { role: 'group' })],
    };
    labelFiguresPlugin({ warn: () => {} })(tree);
    assert.equal(find(tree, 'figure').properties.ariaLabel, undefined);
  });

  it('role="figure" の明示は暗黙の役割と同じでありラベルを補う', () => {
    const tree = {
      type: 'root',
      children: [el('figure', [img({ src: 'a.svg', alt: '説明' })], { role: 'figure' })],
    };
    labelFiguresPlugin({ warn: () => {} })(tree);
    assert.equal(find(tree, 'figure').properties.ariaLabel, '説明');
  });

  it('空白だけの aria-label は明示と見なさず補う', () => {
    const tree = {
      type: 'root',
      children: [
        el('figure', [img({ src: 'a.svg', alt: '回路図の説明' })], { ariaLabel: '  ' }),
      ],
    };
    labelFiguresPlugin({ warn: () => {} })(tree);
    assert.equal(find(tree, 'figure').properties.ariaLabel, '回路図の説明');
  });

  it('ラベルの出所が無い figure は変更せず警告する', () => {
    const warnings = [];
    const tree = {
      type: 'root',
      children: [el('figure', [el('pre', [textNode('code')])])],
    };
    labelFiguresPlugin({ warn: (m) => warnings.push(m) })(tree);
    assert.equal(find(tree, 'figure').properties.ariaLabel, undefined);
    assert.equal(warnings.length, 1);
  });

  it('空白だけの figcaption はラベルの出所にせず img の alt へ回る', () => {
    const tree = {
      type: 'root',
      children: [
        el('figure', [img({ src: 'a.svg', alt: '回路図の説明' }), figcaption([textNode('  ')])]),
      ],
    };
    labelFiguresPlugin({ warn: () => {} })(tree);
    assert.equal(find(tree, 'figure').properties.ariaLabel, '回路図の説明');
  });

  it('空 alt の img へ role="presentation" を付ける', () => {
    const tree = {
      type: 'root',
      children: [img({ src: 'cover.svg', alt: '' })],
    };
    labelFiguresPlugin({ warn: () => {} })(tree);
    assert.equal(find(tree, 'img').properties.role, 'presentation');
  });

  it('role を持つ空 alt の img は書き換えない', () => {
    const tree = {
      type: 'root',
      children: [img({ src: 'cover.svg', alt: '', role: 'img' })],
    };
    labelFiguresPlugin({ warn: () => {} })(tree);
    assert.equal(find(tree, 'img').properties.role, 'img');
  });

  it('alt 属性そのものが無い img は変更せず警告する', () => {
    const warnings = [];
    const tree = {
      type: 'root',
      children: [img({ src: 'a.svg' })],
    };
    labelFiguresPlugin({ warn: (m) => warnings.push(m) })(tree);
    assert.equal(find(tree, 'img').properties.role, undefined);
    assert.equal(warnings.length, 1);
  });

  it('空 alt の img はラベルの出所にしない', () => {
    const warnings = [];
    const tree = {
      type: 'root',
      children: [el('figure', [img({ src: 'a.svg', alt: '' })])],
    };
    labelFiguresPlugin({ warn: (m) => warnings.push(m) })(tree);
    assert.equal(find(tree, 'figure').properties.ariaLabel, undefined);
  });

  it('figure ごとに独立してラベルを与える', () => {
    const tree = {
      type: 'root',
      children: [
        el('figure', [img({ src: 'a.svg', alt: '1 枚目' })]),
        el('figure', [img({ src: 'b.svg', alt: '2 枚目' })]),
      ],
    };
    labelFiguresPlugin({ warn: () => {} })(tree);
    const labels = [];
    const collect = (node) => {
      if (node.type === 'element' && node.tagName === 'figure') {
        labels.push(node.properties.ariaLabel);
      }
      (node.children ?? []).forEach(collect);
    };
    collect(tree);
    assert.deepEqual(labels, ['1 枚目', '2 枚目']);
  });
});
