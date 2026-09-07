import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { stripXmlComments, findUnreadableMarkup } from './svg-source.mjs';

const DIAGRAMS_DIR = fileURLToPath(new URL('../src/assets/diagrams', import.meta.url));

const kinds = svgText => findUnreadableMarkup(svgText).map(v => v.kind);

// --- stripXmlComments ---

test('stripXmlComments: コメントを取り除く', () => {
  assert.equal(stripXmlComments('<svg><!-- fill="#cc0000" --><g/></svg>'), '<svg><g/></svg>');
});

test('stripXmlComments: 除去の跡に生まれたコメントも取り残さない', () => {
  /* 1 回の置換では <!-- --> を消した跡に <! と -- a --> が連結し，
     新たなコメントが生まれる．CodeQL js/incomplete-multi-character-sanitization
     への対応として，変化がなくなるまで繰り返す． */
  assert.equal(stripXmlComments('<svg><!<!-- -->-- a --></svg>'), '<svg></svg>');
});

test('stripXmlComments: 入れ子に見えるコメントの外側は文字列として残る', () => {
  /* XML のコメントは最初の --> で閉じる．残りはテキストノードであり，
     除去では消えない．この形は findUnreadableMarkup が違反として捕まえる． */
  assert.equal(stripXmlComments('<svg><!-- a <!-- b --> c --></svg>'), '<svg> c --></svg>');
});

test('stripXmlComments: コメントが無ければそのまま返す', () => {
  const svgText = '<svg><g/></svg>';
  assert.equal(stripXmlComments(svgText), svgText);
});

// --- findUnreadableMarkup: 読み取れる入力 ---

test('findUnreadableMarkup: 素直な SVG は違反を返さない', () => {
  assert.deepEqual(
    findUnreadableMarkup('<svg><style>.l { fill: #cc0000; }</style><text class="l">あ</text></svg>'),
    []
  );
});

test('findUnreadableMarkup: 属性値の中の > とテキストの中の > を壊れと見なさない', () => {
  assert.deepEqual(kinds('<svg><desc>a > b</desc><path d="M0 0" aria-label="x > y"/></svg>'), []);
});

test('findUnreadableMarkup: テキストの中のアポストロフィを引用符と見なさない', () => {
  assert.deepEqual(kinds("<svg><desc>it's a diagram</desc></svg>"), []);
});

test('findUnreadableMarkup: 宣言・コメント・CDATA を含む SVG を通す', () => {
  const svgText =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<svg xmlns="http://www.w3.org/2000/svg"><!-- 注記 -->' +
    '<style><![CDATA[.l { fill: #cc0000; }]]></style></svg>';
  assert.deepEqual(kinds(svgText), []);
});

test('findUnreadableMarkup: 自己完結タグの style を閉じ忘れと見なさない', () => {
  assert.deepEqual(kinds('<svg><style/><text>あ</text></svg>'), []);
});

test('findUnreadableMarkup: 大文字の STYLE も対応する閉じタグとして数える', () => {
  assert.deepEqual(kinds('<svg><STYLE>.l { fill: #cc0000; }</STYLE></svg>'), []);
});

test('findUnreadableMarkup: 終了タグの対応が崩れていても違反にしない', () => {
  /* 走査の範囲は確定できるため，検査が空振りする形ではない．
     本部品は XML の整形式そのものを判定しない． */
  assert.deepEqual(kinds('<svg><g><text>あ</g></text></svg>'), []);
  assert.deepEqual(kinds('<svg><g></svg>'), []);
});

// --- findUnreadableMarkup: 読み取れない入力 ---

test('findUnreadableMarkup: <style> の閉じ忘れを違反にする', () => {
  /* STYLE_ELEMENT が非マッチとなり，中の宣言がまとめて走査から外れる． */
  assert.deepEqual(kinds('<svg font-family="A"><style>.l { font-family: serif; }</svg>'), [
    'unclosed-style',
  ]);
});

test('findUnreadableMarkup: 開始タグの閉じ忘れを違反にする', () => {
  /* そのタグの属性が走査から外れる． */
  assert.deepEqual(kinds('<svg font-family="A"><text font-family="serif"'), ['unclosed-tag']);
});

test('findUnreadableMarkup: タグの中の引用符の対応崩れを違反にする', () => {
  /* 引用符の対応が崩れ，同じタグの正当な属性まで巻き添えで外れる． */
  assert.deepEqual(kinds('<svg><text y=2" font-family="serif">あ</text></svg>'), [
    'unbalanced-quote',
  ]);
});

test('findUnreadableMarkup: コメントの閉じ忘れを違反にする', () => {
  /* 以降の全体がコメントとして捨てられる． */
  assert.deepEqual(kinds('<svg><!-- 書きかけ <text fill="#cc0000">あ</text></svg>'), [
    'unclosed-comment',
  ]);
});

test('findUnreadableMarkup: コメントの中の <!-- を違反にする', () => {
  /* 入れ子のコメントに見える記述．XML のコメントは入れ子にならず，
     最初の --> で閉じるため，残りはテキストノードとして扱われる． */
  assert.deepEqual(kinds('<svg><!-- a <!-- b --> fill="#cc0000" --></svg>'), [
    'nested-comment-marker',
  ]);
});

test('findUnreadableMarkup: コメントの中の -- だけでは違反にしない', () => {
  /* XML はコメントの中の -- を禁じるが，本部品は範囲の確定だけを見る．
     CSS 変数名を説明するコメントで正当に現れるため，落とさない． */
  assert.deepEqual(kinds('<svg><!-- theme.css の --font-gothic を継承させる --><g/></svg>'), []);
});

test('findUnreadableMarkup: CDATA の閉じ忘れを違反にする', () => {
  assert.deepEqual(kinds('<svg><style><![CDATA[.l { fill: #cc0000; }</style></svg>'), [
    'unclosed-cdata',
  ]);
});

test('findUnreadableMarkup: 違反は壊れた位置と説明を持つ', () => {
  const [violation] = findUnreadableMarkup('<svg><text font-family="serif"');
  assert.equal(violation.kind, 'unclosed-tag');
  assert.equal(violation.index, 5);
  assert.match(violation.message, /閉じ/);
});

test('findUnreadableMarkup: 壊れ方が複数あればすべて返す', () => {
  assert.deepEqual(kinds('<svg><!-- a <!-- b --><style>.l { fill: #cc0000; }</svg>'), [
    'nested-comment-marker',
    'unclosed-style',
  ]);
});

// --- 実際の図版 ---

test('findUnreadableMarkup: 実際の図版 SVG はすべて読み取れる', () => {
  if (!fs.existsSync(DIAGRAMS_DIR)) {
    return;
  }
  for (const name of fs.readdirSync(DIAGRAMS_DIR).filter(n => n.endsWith('.svg'))) {
    const svgText = fs.readFileSync(path.join(DIAGRAMS_DIR, name), 'utf-8');
    assert.deepEqual(findUnreadableMarkup(svgText), [], `${name} が読み取れない入力とされた`);
  }
});
