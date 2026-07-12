import { test } from 'node:test';
import assert from 'node:assert/strict';
import { joinCjkLineBreaks, joinCjkLineBreaksPlugin } from './join-cjk-line-breaks.mjs';

// --- joinCjkLineBreaks ---

test('joinCjkLineBreaks: 全角文字どうしに挟まれた改行を詰める', () => {
  const input = 'これはテストです．\n改行の直後にも全角文字が続く場合の\n挙動を確認します．';
  const result = joinCjkLineBreaks(input);
  assert.equal(result, 'これはテストです．改行の直後にも全角文字が続く場合の挙動を確認します．');
});

test('joinCjkLineBreaks: 改行前後の半角インデント空白も一緒に除去する', () => {
  const input = 'あいうえお\n  かきくけこ';
  const result = joinCjkLineBreaks(input);
  assert.equal(result, 'あいうえおかきくけこ');
});

test('joinCjkLineBreaks: 半角英数字と全角文字の境界の改行は対象外', () => {
  const input = 'これは English\nテストです．';
  const result = joinCjkLineBreaks(input);
  assert.equal(result, input);
});

test('joinCjkLineBreaks: CJK 文字を含まない改行は対象外', () => {
  const input = 'hello\nworld';
  const result = joinCjkLineBreaks(input);
  assert.equal(result, input);
});

test('joinCjkLineBreaks: 同一文字列内の複数箇所の改行を1回のreplaceで詰められる', () => {
  const input = 'あい\nうえ\nお';
  const result = joinCjkLineBreaks(input);
  assert.equal(result, 'あいうえお');
});

test('joinCjkLineBreaks: CJK文字に挟まれない連続改行（空行）は対象外', () => {
  const input = 'あ\n\nい';
  const result = joinCjkLineBreaks(input);
  assert.equal(result, input);
});

test('joinCjkLineBreaks: サロゲートペア（CJK拡張B以降）の前後の改行も詰める', () => {
  const input = 'あいう𠮷\nかきくけこ';
  const result = joinCjkLineBreaks(input);
  assert.equal(result, 'あいう𠮷かきくけこ');
});

// --- joinCjkLineBreaksPlugin ---

function textNode(value) {
  return { type: 'text', value };
}

function element(tagName, properties, children) {
  return { type: 'element', tagName, properties: properties || {}, children: children || [] };
}

test('joinCjkLineBreaksPlugin: 通常のテキストノードは改行を詰める', () => {
  const tree = element('p', {}, [textNode('あいう\nえお')]);
  joinCjkLineBreaksPlugin()(tree);
  assert.equal(tree.children[0].value, 'あいうえお');
});

test('joinCjkLineBreaksPlugin: code/pre 要素の中身は書き換えない', () => {
  const codeTree = element('pre', {}, [element('code', {}, [textNode('あいう\nえお')])]);
  joinCjkLineBreaksPlugin()(codeTree);
  assert.equal(codeTree.children[0].children[0].value, 'あいう\nえお');
});

test('joinCjkLineBreaksPlugin: script/style 要素の中身は書き換えない', () => {
  const scriptTree = element('script', {}, [textNode('あいう\nえお')]);
  joinCjkLineBreaksPlugin()(scriptTree);
  assert.equal(scriptTree.children[0].value, 'あいう\nえお');

  const styleTree = element('style', {}, [textNode('かきく\nけこ')]);
  joinCjkLineBreaksPlugin()(styleTree);
  assert.equal(styleTree.children[0].value, 'かきく\nけこ');
});

test('joinCjkLineBreaksPlugin: children に null/undefined が混入していても例外を投げない', () => {
  const tree = element('div', {}, [textNode('あいう\nえお'), null, undefined]);
  assert.doesNotThrow(() => joinCjkLineBreaksPlugin()(tree));
  assert.equal(tree.children[0].value, 'あいうえお');
});

test('joinCjkLineBreaksPlugin: class="math ..." を持つ要素の中身は書き換えない', () => {
  const mathTree = element('span', { className: ['math', 'inline'] }, [textNode('あ\nい')]);
  joinCjkLineBreaksPlugin()(mathTree);
  assert.equal(mathTree.children[0].value, 'あ\nい');
});

test('joinCjkLineBreaksPlugin: className が文字列表現の場合も math を検出する', () => {
  const mathTree = element('span', { className: 'math display' }, [textNode('あ\nい')]);
  joinCjkLineBreaksPlugin()(mathTree);
  assert.equal(mathTree.children[0].value, 'あ\nい');
});

test('joinCjkLineBreaksPlugin: ネストした子要素も再帰的に処理する', () => {
  const tree = element('div', {}, [
    element('p', {}, [textNode('あいう\nえお')]),
    element('p', {}, [textNode('かきく\nけこ')]),
  ]);
  joinCjkLineBreaksPlugin()(tree);
  assert.equal(tree.children[0].children[0].value, 'あいうえお');
  assert.equal(tree.children[1].children[0].value, 'かきくけこ');
});
