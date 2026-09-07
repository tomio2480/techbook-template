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

test('findUnreadableMarkup: アポストロフィを引用符の開始と取り違えない', () => {
  /* タグの外（テキストノード）は引用符を見ない．
     二重引用符の中のアポストロフィも，開いている引用符とだけ照合する． */
  assert.deepEqual(kinds("<svg><desc>it's a diagram</desc></svg>"), []);
  assert.deepEqual(kinds(`<svg><text aria-label="it's here">あ</text></svg>`), []);
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

test('findUnreadableMarkup: 終了タグの対応崩れを違反にする', () => {
  /* Chromium は SVG を XML として読み，Opening and ending tag mismatch を出す．
     図が描画されないまま，どの検査も違反 0 件で通る形である． */
  assert.deepEqual(kinds('<svg><g><text>あ</g></text></svg>'), ['mismatched-end-tag']);
  assert.deepEqual(kinds('<svg><g></svg>'), ['mismatched-end-tag']);
});

test('findUnreadableMarkup: 要素の閉じ忘れを違反にする', () => {
  assert.deepEqual(kinds('<svg><g><rect width="10" height="10"/></g>'), ['unclosed-element']);
});

// --- findUnreadableMarkup: 読み取れない入力 ---

test('findUnreadableMarkup: <style> の閉じ忘れを違反にする', () => {
  /* STYLE_ELEMENT が非マッチとなり，中の宣言がまとめて走査から外れる．
     開いたままの <style> を </svg> が閉じにくるため，対応崩れとして現れる． */
  assert.deepEqual(kinds('<svg font-family="A"><style>.l { font-family: serif; }</svg>'), [
    'mismatched-end-tag',
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

test('findUnreadableMarkup: コメントの中の -- を違反にする', () => {
  /* 走査の範囲は確定できるが，Chromium は Comment must not contain '--' を出し，
     図が描画されない．CSS 変数名をコメントで説明すると踏む形である． */
  assert.deepEqual(kinds('<svg><!-- theme.css の --font-gothic を継承させる --><g/></svg>'), [
    'double-hyphen-in-comment',
  ]);
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
    'mismatched-end-tag',
  ]);
});

// --- 実際の図版 ---

test('findUnreadableMarkup: 実際の図版 SVG はすべて読み取れる', () => {
  if (!fs.existsSync(DIAGRAMS_DIR)) {
    return;
  }
  const names = fs.readdirSync(DIAGRAMS_DIR).filter(n => n.endsWith('.svg'));
  /* 図版が 1 件も無ければループが空になり，何も検証せずに通る．
     テンプレートは同梱サンプルを必ず持つため，件数を先に確かめる． */
  assert.ok(names.length > 0, '図版 SVG が 1 件も見つからない');
  for (const name of names) {
    const svgText = fs.readFileSync(path.join(DIAGRAMS_DIR, name), 'utf-8');
    assert.deepEqual(findUnreadableMarkup(svgText), [], `${name} が読み取れない入力とされた`);
  }
});

// --- レビュー指摘で足した壊れ方 ---

test('findUnreadableMarkup: 属性値の中の生の < を違反にする', () => {
  /* Chromium は Unescaped '<' not allowed in attributes values を出す．
     属性値の中の > は XML で許されるため，そちらは違反にしない． */
  assert.deepEqual(kinds('<svg><path aria-label="a < b" d="M0 0"/></svg>'), [
    'unescaped-lt-in-attribute',
  ]);
  assert.deepEqual(kinds("<svg><path aria-label='a < b' d='M0 0'/></svg>"), [
    'unescaped-lt-in-attribute',
  ]);
  assert.deepEqual(kinds('<svg><path aria-label="a &lt; b" d="M0 0"/></svg>'), []);
});

test('findUnreadableMarkup: 属性値の中の生の < は走査を打ち切らない', () => {
  /* タグは閉じており走査の範囲は確定できる．描画されない形ではあるが，
     位置の確定できる壊れ方は，コメントの -- と同じく走査を続ける． */
  assert.deepEqual(kinds('<svg><path aria-label="a < b"/><g></svg>'), [
    'unescaped-lt-in-attribute',
    'mismatched-end-tag',
  ]);
});

test('findUnreadableMarkup: 処理命令は ?> まで一体として読む', () => {
  /* 最初の > で切ると，中の要素らしき文字列を実要素として数えてしまう． */
  assert.deepEqual(kinds('<?tool x > <fake> ?><svg/>'), []);
});

test('findUnreadableMarkup: 閉じていない処理命令を違反にする', () => {
  /* Chromium は PI tail never end を出す． */
  assert.deepEqual(kinds('<?tool unterminated><svg/>'), ['unclosed-processing-instruction']);
});

test('findUnreadableMarkup: DOCTYPE の内部サブセットを ]> まで読む', () => {
  assert.deepEqual(kinds('<!DOCTYPE svg [ <!ENTITY nb "&#160;"> ]><svg><g/></svg>'), []);
  assert.deepEqual(
    kinds('<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "svg11.dtd"><svg><g/></svg>'),
    []
  );
  assert.deepEqual(
    kinds("<!DOCTYPE svg PUBLIC '-//W3C//DTD SVG 1.1//EN' 'svg11.dtd'><svg><g/></svg>"),
    []
  );
});

test('findUnreadableMarkup: 閉じていない内部サブセットを違反にする', () => {
  /* Chromium は Content error in the internal subset を出す．
     ]> を閉じ忘れると，以降の要素を走査しても違反の有無を保証できない． */
  assert.deepEqual(kinds('<!DOCTYPE svg [<!ELEMENT svg ANY>><svg/>'), ['unclosed-doctype']);
});

test('findUnreadableMarkup: コメント本文の末尾のハイフンを違反にする', () => {
  /* <!-- a ---> は本文が「a -」となり -- を含まないが，
     Chromium は Double hyphen within comment を出す． */
  assert.deepEqual(kinds('<svg><!-- a ---><g/></svg>'), ['double-hyphen-in-comment']);
});

// --- 作図ツールが書き出す記法（陰性対照） ---

test('findUnreadableMarkup: 作図ツールの記法を違反にしない', () => {
  const notations = {
    '名前空間付きの要素名': '<svg><inkscape:group><rect width="1" height="1"/></inkscape:group></svg>',
    'xml:space と xml:lang': '<svg xml:space="preserve" xml:lang="ja"><text>あ</text></svg>',
    'CDATA の中の <': '<svg><style><![CDATA[text { fill: #000; } /* a < b */]]></style></svg>',
    'style の中の > セレクタ': '<svg><style>g > text { fill: #000; }</style><g><text>a</text></g></svg>',
    '属性値の中のもう一方の引用符': `<svg><text font-family='"MS Mincho", serif'>あ</text></svg>`,
    '属性値の中の > と /': '<svg><path d="M0 0 L1 1" aria-label="a > b / c"/></svg>',
    'foreignObject の中の HTML':
      '<svg><foreignObject width="1" height="1"><div xmlns="http://www.w3.org/1999/xhtml"><p>a</p></div></foreignObject></svg>',
    '大文字小文字の混在した要素名':
      '<svg><linearGradient id="g"><stop offset="0"/></linearGradient></svg>',
    'コメントの中のタグ': '<svg><!-- <rect width="1"/> --><g/></svg>',
    'コメントの中の未閉じ引用符': '<svg><!-- fill=" --><g/></svg>',
  };
  for (const [label, svgText] of Object.entries(notations)) {
    assert.deepEqual(findUnreadableMarkup(svgText), [], `${label} を違反にした`);
  }
});
