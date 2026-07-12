import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseListItems, mergeTocTrees, serializeTocTree, writeBuildMarker, stripHtmlTags } from './add-line-numbers.mjs';

// --- stripHtmlTags ---

test('stripHtmlTags: 単純なタグを除去する', () => {
  assert.equal(stripHtmlTags('<b>太字</b>のテキスト'), '太字のテキスト');
});

test('stripHtmlTags: 単発の置換では残ってしまうネスト状の入力でも、タグを一切残さない', () => {
  const nasty = '<a<b>>script<c>>';
  const result = stripHtmlTags(nasty);
  // 単発置換（.replace(/<[^>]*>/g, '')を1回だけ適用）だとタグ断片が
  // 結合して残ることがあるため、結果に <...> が一切含まれないことを
  // 不変条件として確認する
  assert.doesNotMatch(result, /<[^>]*>/);
});

// --- writeBuildMarker ---

test('writeBuildMarker: dist ディレクトリが存在しない場合は作成した上で marker を書き込む', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'add-line-numbers-test-'));
  const distDir = path.join(tmpRoot, 'dist');
  try {
    assert.equal(fs.existsSync(distDir), false);
    writeBuildMarker(distDir);
    const markerPath = path.join(distDir, '.build-marker');
    assert.equal(fs.existsSync(markerPath), true);
    assert.match(fs.readFileSync(markerPath, 'utf-8'), /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

// --- parseListItems ---

test('parseListItems: ネストした ol を再帰的に解析できる', () => {
  const html = `
    <ol>
      <li data-section-level="1">
        <a href="00-preface.html">まえがき</a>
        <ol>
          <li data-section-level="2">
            <a href="00-preface.html">本書の構成</a>
          </li>
        </ol>
      </li>
    </ol>
  `;
  const tree = parseListItems(html);
  assert.equal(tree.length, 1);
  assert.equal(tree[0].href, '00-preface.html');
  assert.equal(tree[0].level, 1);
  assert.equal(tree[0].text, 'まえがき');
  assert.equal(tree[0].children.length, 1);
  assert.equal(tree[0].children[0].href, '00-preface.html');
  assert.equal(tree[0].children[0].level, 2);
  assert.equal(tree[0].children[0].text, '本書の構成');
});

test('parseListItems: シングルクォーテーションの href も取得できる', () => {
  const html = `
    <ol>
      <li data-section-level="1">
        <a href='00-preface.html'>まえがき</a>
      </li>
    </ol>
  `;
  const tree = parseListItems(html);
  assert.equal(tree.length, 1);
  assert.equal(tree[0].href, '00-preface.html');
});

test('parseListItems: 複数行にまたがる <a> タグからも href とテキストを取得できる', () => {
  const html = `
    <ol>
      <li data-section-level="1">
        <a
          href="01-introduction.html"
          >はじめに</a
        >
      </li>
    </ol>
  `;
  const tree = parseListItems(html);
  assert.equal(tree.length, 1);
  assert.equal(tree[0].href, '01-introduction.html');
  assert.equal(tree[0].text, 'はじめに');
});

test('parseListItems: <a> タグがない <li>（リンクなし見出し）でもテキストを取得できる', () => {
  const html = `
    <ol>
      <li data-section-level="1">リンクなし見出し</li>
    </ol>
  `;
  const tree = parseListItems(html);
  assert.equal(tree.length, 1);
  assert.equal(tree[0].href, null);
  assert.equal(tree[0].text, 'リンクなし見出し');
});

test('parseListItems: <a> タグがない <li> でも子 <ol> はテキストに含めない', () => {
  const html = `
    <ol>
      <li data-section-level="1">リンクなし見出し
        <ol>
          <li data-section-level="2"><a href="00-preface.html">子見出し</a></li>
        </ol>
      </li>
    </ol>
  `;
  const tree = parseListItems(html);
  assert.equal(tree.length, 1);
  assert.equal(tree[0].text, 'リンクなし見出し');
  assert.equal(tree[0].children.length, 1);
  assert.equal(tree[0].children[0].text, '子見出し');
});

test('parseListItems: </ol> が不足した不正な HTML では空配列を返す（部分的な文字列を誤ってパースしない）', () => {
  const html = `
    <ol>
      <li data-section-level="1"><a href="00-preface.html">まえがき</a>
  `;
  const tree = parseListItems(html);
  assert.deepEqual(tree, []);
});

// --- mergeTocTrees ---

test('mergeTocTrees: 位置が一致する場合は旧テキストを保持しつつ auto 側の構造を採用する', () => {
  const autoTree = [
    { href: '01-introduction.html', level: 1, text: 'はじめに（自動生成）', children: [], rawOuterHtml: null },
  ];
  const oldTree = [
    { href: '01-introduction.html', level: 1, text: 'はじめに（手動編集済み）', children: [], rawOuterHtml: '<li data-section-level="1"><a href="01-introduction.html">はじめに（手動編集済み）</a></li>' },
  ];
  const merged = mergeTocTrees(autoTree, oldTree);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].href, '01-introduction.html');
  assert.equal(merged[0].text, 'はじめに（手動編集済み）');
});

test('mergeTocTrees: auto 側に新規見出しが追加された場合は auto のテキストを使う', () => {
  const autoTree = [
    { href: '01-introduction.html', level: 1, text: 'はじめに', children: [], rawOuterHtml: null },
    { href: '02-advanced.html', level: 1, text: '応用編', children: [], rawOuterHtml: null },
  ];
  const oldTree = [
    { href: '01-introduction.html', level: 1, text: 'はじめに', children: [], rawOuterHtml: '<li data-section-level="1"><a href="01-introduction.html">はじめに</a></li>' },
  ];
  const merged = mergeTocTrees(autoTree, oldTree);
  assert.equal(merged.length, 2);
  assert.equal(merged[1].href, '02-advanced.html');
  assert.equal(merged[1].text, '応用編');
});

test('mergeTocTrees: auto 側から消えた見出しは old 側に未消費のまま残り、手動追加項目として末尾に保持される', () => {
  const autoTree = [
    { href: '01-introduction.html', level: 1, text: 'はじめに', children: [], rawOuterHtml: null },
  ];
  const removedRaw = '<li data-section-level="1"><a href="00-preface.html">まえがき</a></li>';
  const oldTree = [
    { href: '00-preface.html', level: 1, text: 'まえがき', children: [], rawOuterHtml: removedRaw },
    { href: '01-introduction.html', level: 1, text: 'はじめに', children: [], rawOuterHtml: '<li data-section-level="1"><a href="01-introduction.html">はじめに</a></li>' },
  ];
  const merged = mergeTocTrees(autoTree, oldTree);
  const hrefs = merged.map(n => n.href);
  assert.deepEqual(hrefs, ['01-introduction.html', '00-preface.html']);
  assert.equal(merged[1].isManual, true);
  assert.equal(merged[1].rawOuterHtml, removedRaw);
});

test('mergeTocTrees: old 側にのみ存在する手動追加項目は末尾に rawOuterHtml のまま保持される', () => {
  const autoTree = [
    { href: '01-introduction.html', level: 1, text: 'はじめに', children: [], rawOuterHtml: null },
  ];
  const manualRaw = '<li data-section-level="1"><a href="manual-note.html">手動追加コラム</a></li>';
  const oldTree = [
    { href: '01-introduction.html', level: 1, text: 'はじめに', children: [], rawOuterHtml: '<li data-section-level="1"><a href="01-introduction.html">はじめに</a></li>' },
    { href: 'manual-note.html', level: 1, text: '手動追加コラム', children: [], rawOuterHtml: manualRaw },
  ];
  const merged = mergeTocTrees(autoTree, oldTree);
  assert.equal(merged.length, 2);
  assert.equal(merged[1].isManual, true);
  assert.equal(merged[1].rawOuterHtml, manualRaw);
});

test('mergeTocTrees: 位置がずれていても href が一致すれば旧テキストを引き継ぐ（フォールバック）', () => {
  const autoTree = [
    { href: '00-preface.html', level: 1, text: 'まえがき', children: [], rawOuterHtml: null },
    { href: '01-introduction.html', level: 1, text: 'はじめに（自動）', children: [], rawOuterHtml: null },
  ];
  // old 側は先頭に手動追加の見出しが挿入され、位置がずれている
  const oldTree = [
    { href: 'manual-intro.html', level: 1, text: '手動挿入見出し', children: [], rawOuterHtml: '<li data-section-level="1"><a href="manual-intro.html">手動挿入見出し</a></li>' },
    { href: '00-preface.html', level: 1, text: 'まえがき', children: [], rawOuterHtml: '<li data-section-level="1"><a href="00-preface.html">まえがき</a></li>' },
    { href: '01-introduction.html', level: 1, text: 'はじめに（手動編集済み）', children: [], rawOuterHtml: '<li data-section-level="1"><a href="01-introduction.html">はじめに（手動編集済み）</a></li>' },
  ];
  const merged = mergeTocTrees(autoTree, oldTree);
  // auto 側 2 件 + 手動追加 1 件 = 3 件
  assert.equal(merged.length, 3);
  assert.equal(merged[0].text, 'まえがき');
  assert.equal(merged[1].text, 'はじめに（手動編集済み）');
  assert.equal(merged[2].isManual, true);
  assert.equal(merged[2].href, 'manual-intro.html');
});

test('mergeTocTrees: 同一ファイル内で新規見出しが挿入されても、未編集の既存見出しのテキストが誤って上書きされない', () => {
  const autoTree = [
    { href: '01-intro.html', level: 1, text: 'まえがき', children: [], rawOuterHtml: null },
    { href: '01-intro.html', level: 1, text: '新規セクション', children: [], rawOuterHtml: null },
    { href: '01-intro.html', level: 1, text: 'はじめに', children: [], rawOuterHtml: null },
  ];
  const oldTree = [
    { href: '01-intro.html', level: 1, text: 'まえがき', children: [], rawOuterHtml: '<li>まえがき</li>' },
    { href: '01-intro.html', level: 1, text: 'はじめに', children: [], rawOuterHtml: '<li>はじめに</li>' },
  ];
  const merged = mergeTocTrees(autoTree, oldTree);
  assert.equal(merged.length, 3);
  assert.equal(merged[0].text, 'まえがき');
  assert.equal(merged[1].text, '新規セクション');
  assert.equal(merged[2].text, 'はじめに');
});

test('mergeTocTrees: children についても同じロジックを再帰適用する', () => {
  const autoTree = [
    {
      href: '01-introduction.html',
      level: 1,
      text: 'はじめに',
      rawOuterHtml: null,
      children: [
        { href: '01-introduction.html', level: 2, text: '節A（自動）', children: [], rawOuterHtml: null },
      ],
    },
  ];
  const oldTree = [
    {
      href: '01-introduction.html',
      level: 1,
      text: 'はじめに',
      rawOuterHtml: '<li data-section-level="1"><a href="01-introduction.html">はじめに</a></li>',
      children: [
        { href: '01-introduction.html', level: 2, text: '節A（手動編集済み）', children: [], rawOuterHtml: '<li data-section-level="2"><a href="01-introduction.html">節A（手動編集済み）</a></li>' },
      ],
    },
  ];
  const merged = mergeTocTrees(autoTree, oldTree);
  assert.equal(merged[0].children[0].text, '節A（手動編集済み）');
});

test('mergeTocTrees: auto 側の href が null の場合、old 側の別の null href ノードと誤ってマッチしない', () => {
  const autoTree = [
    { href: null, level: 1, text: 'リンクなし見出し（自動）', children: [], rawOuterHtml: null },
  ];
  const oldTree = [
    { href: null, level: 1, text: '無関係な旧ノード', children: [], rawOuterHtml: '<li data-section-level="1">無関係な旧ノード</li>' },
  ];
  const merged = mergeTocTrees(autoTree, oldTree);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].text, 'リンクなし見出し（自動）');
  assert.equal(merged[1].isManual, true);
});

// --- serializeTocTree ---

test('serializeTocTree: level・href が null のノードは不正な属性を出力しない', () => {
  const tree = [
    { href: null, level: null, text: 'リンクなし見出し', children: [], rawOuterHtml: null },
  ];
  const html = serializeTocTree(tree);
  assert.doesNotMatch(html, /data-section-level="null"/);
  assert.doesNotMatch(html, /href="null"/);
  assert.match(html, /<li>リンクなし見出し<\/li>/);
});

test('serializeTocTree: 木構造を <ol> HTML に戻せる', () => {
  const tree = [
    {
      href: '00-preface.html',
      level: 1,
      text: 'まえがき',
      rawOuterHtml: null,
      children: [
        { href: '00-preface.html', level: 2, text: '本書の構成', children: [], rawOuterHtml: null },
      ],
    },
  ];
  const html = serializeTocTree(tree);
  assert.match(html, /<ol>/);
  assert.match(html, /<li data-section-level="1"><a href="00-preface\.html">まえがき<\/a>/);
  assert.match(html, /<li data-section-level="2"><a href="00-preface\.html">本書の構成<\/a><\/li>/);
  assert.match(html, /<\/ol>/);
});

test('serializeTocTree: 手動追加ノードは rawOuterHtml をそのまま出力する', () => {
  const manualRaw = '<li data-section-level="1"><a href="manual.html">手動</a></li>';
  const tree = [
    { href: 'manual.html', level: 1, text: '手動', children: [], rawOuterHtml: manualRaw, isManual: true },
  ];
  const html = serializeTocTree(tree);
  assert.match(html, new RegExp(manualRaw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
