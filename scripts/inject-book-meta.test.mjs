import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { injectBookMetaPlugin } from './inject-book-meta.mjs';

/** hast の element ノードを組み立てるテスト用ヘルパー */
function el(tagName, children = [], properties = {}) {
  return { type: 'element', tagName, properties, children };
}

function textNode(value) {
  return { type: 'text', value };
}

/** ノード配下のテキストを連結して返す */
function textOf(node) {
  if (node.type === 'text') return node.value;
  return (node.children ?? []).map(textOf).join('');
}

const META = { title: '実際のタイトル', author: '実際の著者' };

describe('injectBookMetaPlugin', () => {
  it('見出し内の {{book-title}} を書名へ置き換える', () => {
    const tree = { type: 'root', children: [el('h1', [textNode('{{book-title}}')])] };
    injectBookMetaPlugin({ ...META, warn: () => {} })(tree);
    assert.equal(textOf(tree), '実際のタイトル');
  });

  it('段落内の {{book-author}} を著者名へ置き換える', () => {
    const tree = { type: 'root', children: [el('p', [textNode('{{book-author}}')])] };
    injectBookMetaPlugin({ ...META, warn: () => {} })(tree);
    assert.equal(textOf(tree), '実際の著者');
  });

  it('head の title 要素内のマーカーも置き換える', () => {
    const tree = {
      type: 'root',
      children: [el('head', [el('title', [textNode('{{book-title}}')])])],
    };
    injectBookMetaPlugin({ ...META, warn: () => {} })(tree);
    assert.equal(textOf(tree), '実際のタイトル');
  });

  it('文中に混在する複数マーカーをまとめて置き換える', () => {
    const tree = {
      type: 'root',
      children: [el('p', [textNode('{{book-title}}（{{book-author}} 著）')])],
    };
    injectBookMetaPlugin({ ...META, warn: () => {} })(tree);
    assert.equal(textOf(tree), '実際のタイトル（実際の著者 著）');
  });

  it('データが無い場合はマーカーを取り除いて警告する', () => {
    const warnings = [];
    const tree = {
      type: 'root',
      children: [
        el('h1', [textNode('{{book-title}}')]),
        el('p', [textNode('{{book-author}}')]),
      ],
    };
    injectBookMetaPlugin({ warn: (m) => warnings.push(m) })(tree);
    assert.equal(textOf(tree), '');
    assert.equal(warnings.length, 2);
  });

  it('同じマーカーが複数回現れても警告は 1 回にまとめる', () => {
    const warnings = [];
    const tree = {
      type: 'root',
      children: [
        el('h1', [textNode('{{book-title}}')]),
        el('title', [textNode('{{book-title}}')]),
      ],
    };
    injectBookMetaPlugin({ warn: (m) => warnings.push(m) })(tree);
    assert.equal(warnings.length, 1);
  });

  it('マーカーを含まないテキストは変更しない', () => {
    const tree = { type: 'root', children: [el('p', [textNode('ふつうの本文')])] };
    injectBookMetaPlugin({ ...META, warn: () => {} })(tree);
    assert.equal(textOf(tree), 'ふつうの本文');
  });
});
