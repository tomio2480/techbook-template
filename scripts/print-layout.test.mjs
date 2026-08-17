import { test } from 'node:test';
import assert from 'node:assert';
import {
  DOC_START_MARKER,
  MEMO_FILE_PATTERN,
  calcFillerPages,
  extractChapterLabel,
  hasChapterOpening,
  injectHtmlClass,
  injectTabMark,
  parseDocumentStartPages,
  planPrintLayout,
  renderMemoHtml,
  renderTabMark,
  renderTabStylesheet,
  resolveFillerBefore,
  resolvePageMultiple,
  resolveSectionSides,
  sideClassName,
  sideForEntry,
  tabClassName,
  toDocumentPageCounts,
} from './print-layout.mjs';

const SIDES = resolveSectionSides({});

// --- calcFillerPages ---

test('不足ページ数は倍数までの差を返す', () => {
  assert.strictEqual(calcFillerPages(29, 4), 3);
  assert.strictEqual(calcFillerPages(30, 4), 2);
  assert.strictEqual(calcFillerPages(31, 4), 1);
});

test('既に倍数のときは 0 を返す', () => {
  assert.strictEqual(calcFillerPages(32, 4), 0);
  assert.strictEqual(calcFillerPages(30, 2), 0);
});

test('倍数が正の整数でなければ例外を投げる', () => {
  assert.throws(() => calcFillerPages(29, 0), /1 以上の整数/);
  assert.throws(() => calcFillerPages(29, 2.5), /1 以上の整数/);
});

// --- resolvePageMultiple ---

test('面付けの倍数は book.yaml から読み，既定は 4 とする', () => {
  assert.strictEqual(resolvePageMultiple({ print: { page_multiple: 8 } }), 8);
  assert.strictEqual(resolvePageMultiple({}), 4);
  assert.strictEqual(resolvePageMultiple(null), 4);
});

test('面付けの倍数が不正なら例外を投げる', () => {
  assert.throws(() => resolvePageMultiple({ print: { page_multiple: 0 } }), /1 以上の整数/);
  assert.throws(() => resolvePageMultiple({ print: { page_multiple: 'four' } }), /1 以上の整数/);
});

// --- resolveSectionSides・sideForEntry ---

test('既定の改丁指定はまえがき・あとがきが recto，目次・奥付が verso', () => {
  assert.strictEqual(sideForEntry('src/chapters/00-preface.md', '', SIDES), 'recto');
  assert.strictEqual(sideForEntry('src/chapters/98-afterword.md', '', SIDES), 'recto');
  assert.strictEqual(sideForEntry('src/chapters/toc.html', '', SIDES), 'verso');
  assert.strictEqual(sideForEntry('src/chapters/99-colophon.md', '', SIDES), 'verso');
});

test('章扉を持つ原稿は章の開始面を使う', () => {
  const source = '<section class="chapter-opening">…</section>';
  assert.strictEqual(sideForEntry('src/chapters/01-introduction.md', source, SIDES), 'recto');
});

test('指定の無い区分は面を問わない', () => {
  assert.strictEqual(sideForEntry('src/chapters/96-answers.md', '本文', SIDES), null);
  assert.strictEqual(sideForEntry('src/chapters/cover.md', '', SIDES), null);
});

test('改丁指定は book.yaml で上書きできる', () => {
  const sides = resolveSectionSides({
    print: { section_start: { '00-preface': 'verso' }, chapter_start: 'verso' },
  });
  assert.strictEqual(sideForEntry('src/chapters/00-preface.md', '', sides), 'verso');
  assert.strictEqual(sideForEntry('src/chapters/toc.html', '', sides), null);
  assert.strictEqual(sideForEntry('src/chapters/01-introduction.md', 'chapter-opening', sides), 'verso');
});

test('recto・verso 以外の面を指定したら例外を投げる', () => {
  assert.throws(
    () => resolveSectionSides({ print: { section_start: { toc: 'left' } } }),
    /recto または verso/
  );
  assert.throws(
    () => resolveSectionSides({ print: { chapter_start: 'odd' } }),
    /recto または verso/
  );
});

// --- planPrintLayout ---

function plan({ entries, pageCounts, sources, pageMultiple = 4, sides = SIDES, fillerBefore }) {
  return planPrintLayout({ entries, pageCounts, sources, sides, pageMultiple, fillerBefore });
}

test('面がずれる区分の前へ MEMO ページを差し込む', () => {
  // 表紙 1 + 本扉 1 = 2 ページの後、まえがきは 3 ページ目（recto）から始まるため調整は不要。
  // まえがきが 2 ページなので目次は 5 ページ目（recto）に来てしまい、verso へ寄せる 1 ページが要る
  const result = plan({
    entries: [
      'src/chapters/cover.md',
      'src/chapters/title-page.md',
      'src/chapters/00-preface.md',
      'src/chapters/toc.html',
    ],
    pageCounts: [1, 1, 2, 2],
    sources: ['', '', '', ''],
    pageMultiple: 2,
  });

  assert.deepStrictEqual(result.entry.slice(0, 5), [
    'src/chapters/cover.md',
    'src/chapters/title-page.md',
    'src/chapters/00-preface.md',
    'src/chapters/print-memo-1.html',
    'src/chapters/toc.html',
  ]);
  assert.deepStrictEqual(result.memoDocuments[0], {
    fileName: 'print-memo-1.html',
    entry: 'src/chapters/print-memo-1.html',
    pages: 1,
  });
  /* 目次は 6 ページ目（verso）から始まり、本文は 7 ページまで伸びる */
  assert.strictEqual(result.totalPages % 2, 0);
});

test('面が合っていれば MEMO ページを差し込まない', () => {
  const result = plan({
    entries: ['src/chapters/cover.md', 'src/chapters/title-page.md', 'src/chapters/00-preface.md'],
    pageCounts: [1, 1, 2],
    sources: ['', '', ''],
    pageMultiple: 2,
  });

  assert.deepStrictEqual(result.entry, [
    'src/chapters/cover.md',
    'src/chapters/title-page.md',
    'src/chapters/00-preface.md',
  ]);
  assert.deepStrictEqual(result.memoDocuments, []);
  assert.strictEqual(result.totalPages, 4);
});

test('調整ページは奥付の直前へ寄せ，端数の 1 ページだけを奥付の後ろへ残す', () => {
  // 表紙 1 + あとがき 1 + 奥付 1 + 裏表紙 1 = 4 ページ．あとがきを recto へ寄せる
  // 1 ページが入って 5 ページとなり，8 の倍数まで 3 ページ足りない
  const result = plan({
    entries: [
      'src/chapters/cover.md',
      'src/chapters/98-afterword.md',
      'src/chapters/99-colophon.md',
      'src/chapters/back-cover.md',
    ],
    pageCounts: [1, 1, 1, 1],
    sources: ['', '', '', ''],
    pageMultiple: 8,
  });

  assert.deepStrictEqual(result.entry, [
    'src/chapters/cover.md',
    'src/chapters/print-memo-1.html', // あとがきを奇数ページへ寄せる
    'src/chapters/98-afterword.md',
    'src/chapters/print-memo-2.html', // 調整ページのうち偶数分
    'src/chapters/99-colophon.md',
    'src/chapters/print-memo-3.html', // 端数の 1 ページ
    'src/chapters/back-cover.md',
  ]);
  assert.deepStrictEqual(
    result.memoDocuments.map(memo => memo.pages),
    [1, 2, 1]
  );
  assert.strictEqual(result.totalPages, 8);
});

test('端数が無ければ調整ページはすべて奥付の前へ入る', () => {
  /* 表紙 1 + 奥付 1 + 裏表紙 2 = 4 ページ．8 の倍数まで 4 ページ（偶数）足りない */
  const result = plan({
    entries: [
      'src/chapters/cover.md',
      'src/chapters/99-colophon.md',
      'src/chapters/back-cover.md',
    ],
    pageCounts: [1, 1, 2],
    sources: ['', '', ''],
    pageMultiple: 8,
  });

  assert.deepStrictEqual(result.entry, [
    'src/chapters/cover.md',
    'src/chapters/print-memo-1.html',
    'src/chapters/99-colophon.md',
    'src/chapters/back-cover.md',
  ]);
  assert.strictEqual(result.memoDocuments[0].pages, 4);
  assert.strictEqual(result.totalPages, 8);
});

test('寄せ先を指定しなければ調整ページは裏表紙の直前へまとめる', () => {
  const result = plan({
    entries: ['src/chapters/cover.md', 'src/chapters/99-colophon.md', 'src/chapters/back-cover.md'],
    pageCounts: [1, 1, 1],
    sources: ['', '', ''],
    pageMultiple: 8,
    fillerBefore: '',
  });

  assert.deepStrictEqual(result.entry, [
    'src/chapters/cover.md',
    'src/chapters/99-colophon.md',
    'src/chapters/print-memo-1.html',
    'src/chapters/back-cover.md',
  ]);
  assert.strictEqual(result.memoDocuments[0].pages, 5);
  assert.strictEqual(result.totalPages, 8);
});

test('寄せ先は book.yaml で変えられる', () => {
  assert.strictEqual(resolveFillerBefore({}), '99-colophon');
  assert.strictEqual(resolveFillerBefore({ print: { filler_before: '98-afterword' } }), '98-afterword');
  assert.throws(
    () => resolveFillerBefore({ print: { filler_before: 3 } }),
    /文字列で指定/
  );
});

test('総ページ数を倍数へ揃える調整ページは裏表紙の直前へ入れる', () => {
  const result = plan({
    entries: ['src/chapters/cover.md', 'src/chapters/01-introduction.md', 'src/chapters/back-cover.md'],
    pageCounts: [1, 1, 1],
    sources: ['', '', ''],
  });

  assert.deepStrictEqual(result.entry, [
    'src/chapters/cover.md',
    'src/chapters/01-introduction.md',
    'src/chapters/print-memo-1.html',
    'src/chapters/back-cover.md',
  ]);
  assert.strictEqual(result.memoDocuments.at(-1).pages, 1);
  assert.strictEqual(result.totalPages, 4);
});

test('裏表紙が無い構成では調整ページを末尾へ足す', () => {
  const result = plan({
    entries: ['src/chapters/cover.md'],
    pageCounts: [1],
    sources: [''],
  });

  assert.deepStrictEqual(result.entry, ['src/chapters/cover.md', 'src/chapters/print-memo-1.html']);
  assert.strictEqual(result.totalPages, 4);
  assert.strictEqual(result.memoDocuments[0].pages, 3);
});

test('改丁と面付けの両方が要る構成でも総ページ数が倍数へ揃う', () => {
  const result = plan({
    entries: [
      'src/chapters/cover.md',
      'src/chapters/00-preface.md',
      'src/chapters/01-introduction.md',
      'src/chapters/back-cover.md',
    ],
    pageCounts: [1, 2, 3, 1],
    sources: ['', '', '<section class="chapter-opening">', ''],
  });

  assert.strictEqual(result.totalPages % 4, 0);
  assert.strictEqual(result.entry.length, 4 + result.memoDocuments.length);
  assert.strictEqual(result.entry.at(-1), 'src/chapters/back-cover.md');
});

test('件数が食い違う入力は例外を投げる', () => {
  assert.throws(
    () => plan({ entries: ['a.md'], pageCounts: [1, 2], sources: [''] }),
    /件数が一致しません/
  );
});

// --- renderMemoHtml ---

test('MEMO ページの原稿は指定した枚数分のページを持つ', () => {
  const html = renderMemoHtml(3);
  assert.strictEqual((html.match(/class="memo-page"/g) ?? []).length, 3);
  assert.match(html, /<body class="memo-pages">/);
  assert.match(html, /theme\.css/);
  assert.match(html, /<html lang="ja"/);
});

test('MEMO ページを 1 枚以上求めない呼び出しは例外を投げる', () => {
  assert.throws(() => renderMemoHtml(0), /1 以上/);
});

// --- injectTabClass・renderTabStylesheet ---

test('クラスを html 要素の既存クラスへ足す', () => {
  const html = '<!doctype html><html lang="ja" class="chapter"><head></head><body></body></html>';
  assert.match(
    injectHtmlClass(html, tabClassName(3)),
    /<html lang="ja" class="chapter print-tab-3">/
  );
});

test('クラス属性が無い html 要素にも足せる', () => {
  const html = '<!doctype html><html lang="ja"><head></head><body></body></html>';
  assert.match(injectHtmlClass(html, tabClassName(1)), /<html class="print-tab-1" lang="ja">/);
});

test('開始面のクラスとつめのクラスを重ねて足せる', () => {
  const html = '<!doctype html><html lang="ja" class="preface"><head></head><body></body></html>';
  const result = injectHtmlClass(injectHtmlClass(html, sideClassName('verso')), tabClassName(2));
  assert.match(result, /class="preface print-side-verso print-tab-2"/);
});

test('本文中の html という語をクラス挿入の対象にしない', () => {
  const html = '<!doctype html><html lang="ja"><body><p>html の話</p></body></html>';
  const result = injectHtmlClass(html, tabClassName(2));
  assert.strictEqual((result.match(/print-tab-2/g) ?? []).length, 1);
  assert.match(result, /<p>html の話<\/p>/);
});

test('html 要素が無ければ例外を投げる', () => {
  assert.throws(() => injectHtmlClass('<div></div>', 'print-tab-1'), /html 要素が見つかりません/);
});

test('すでに同じクラスがあれば足さない', () => {
  const html = '<!doctype html><html class="print-side-verso" lang="ja"><body></body></html>';
  const result = injectHtmlClass(html, sideClassName('verso'));
  assert.strictEqual((result.match(/print-side-verso/g) ?? []).length, 1);
});

test('前方一致するだけの別クラスは同じものと見なさない', () => {
  const html = '<!doctype html><html class="print-tab-1" lang="ja"><body></body></html>';
  assert.match(injectHtmlClass(html, tabClassName(12)), /class="print-tab-1 print-tab-12"/);
});

test('開始面のクラス名は recto・verso のみ受け付ける', () => {
  assert.strictEqual(sideClassName('recto'), 'print-side-recto');
  assert.strictEqual(sideClassName('verso'), 'print-side-verso');
  assert.throws(() => sideClassName('left'), /recto または verso/);
});

test('MEMO ページの後始末は連番の HTML だけを対象にする', () => {
  // 前置きが同じだけの利用者のファイルを巻き込まないこと
  assert.strictEqual(MEMO_FILE_PATTERN.test('print-memo-1.html'), true);
  assert.strictEqual(MEMO_FILE_PATTERN.test('print-memo-12.html'), true);
  assert.strictEqual(MEMO_FILE_PATTERN.test('print-memo-notes.md'), false);
  assert.strictEqual(MEMO_FILE_PATTERN.test('print-memo-notes.html'), false);
  assert.strictEqual(MEMO_FILE_PATTERN.test('my-print-memo-1.html'), false);
});

test('つめの位置は章の順に等間隔で下がる', () => {
  const css = renderTabStylesheet(4);
  assert.match(css, /html\.print-tab-1 \{[\s\S]*?\* 0 \/ 3\)/);
  assert.match(css, /html\.print-tab-4 \{[\s\S]*?\* 3 \/ 3\)/);
  assert.strictEqual((css.match(/html\.print-tab-/g) ?? []).length, 4);
});

test('章が 1 つだけなら範囲の中央へ置く', () => {
  assert.match(renderTabStylesheet(1), /\* 1 \/ 2\)/);
});

test('章が無ければ位置の指定を持たない CSS を返す', () => {
  const css = renderTabStylesheet(0);
  assert.doesNotMatch(css, /html\.print-tab-/);
  assert.match(css, /@charset "UTF-8";/);
});

// --- extractChapterLabel・renderTabMark・injectTabMark ---

const CHAPTER_HTML = `<!doctype html><html lang="ja"><body>
<section class="chapter-opening">
<p class="chapter-number">2</p>
<p class="chapter-title">応用編</p>
</section>
<section class="level1"><h1 id="応用編">応用編</h1></section>
</body></html>`;

test('章番号と章タイトルを扉の記述から取り出す', () => {
  assert.deepStrictEqual(extractChapterLabel(CHAPTER_HTML), { number: '2', title: '応用編' });
});

test('入れ子のタグを含む章タイトルからタグを取り除く', () => {
  const html = '<html><body><p class="chapter-title">応<b>用</b>編</p></body></html>';
  assert.strictEqual(extractChapterLabel(html).title, '応用編');
});

test('タグが再構成される並びでもタグを残さない', () => {
  // 単発の置換では断片が結合して新たなタグになりうる（CodeQL の指摘）
  const html = '<html><body><p class="chapter-title">応<scr<b>ipt>用編</p></body></html>';
  assert.doesNotMatch(extractChapterLabel(html).title, /<[a-z]/i);
});

test('扉にタイトルが無ければ h1 から補う', () => {
  const html = '<html><body><h1 id="x">解答</h1></body></html>';
  assert.deepStrictEqual(extractChapterLabel(html), { number: '', title: '解答' });
});

test('つめには章番号とタイトルを並べる', () => {
  const markup = renderTabMark({ number: '2', title: '応用編' });
  assert.match(markup, /class="print-tab-mark-number is-numbered">2</);
  assert.match(markup, /class="print-tab-mark-title">応用編</);
  assert.match(markup, /aria-hidden="true"/);
});

test('数字でない章番号には「第」「章」を添えない', () => {
  const markup = renderTabMark({ number: 'A', title: '付録: 参考資料' });
  assert.doesNotMatch(markup, /is-numbered/);
  assert.match(markup, /class="print-tab-mark-number">A</);
});

test('番号もタイトルも無ければつめを作らない', () => {
  assert.strictEqual(renderTabMark({ number: '', title: '' }), '');
});

test('章の扉があるときは扉の直後へ入れる', () => {
  const result = injectTabMark(CHAPTER_HTML, renderTabMark({ number: '2', title: '応用編' }));
  assert.match(result, /<\/section>\n<aside class="print-tab-mark"/);
  // 扉より前へ置くと，扉のページが body から始まった扱いになり，
  // page: chapter-opening が効かなくなる（扉にもつめが出る）
  assert.doesNotMatch(result, /<body>\n<aside class="print-tab-mark"/);
  assert.ok(result.indexOf('print-tab-mark') > result.indexOf('chapter-title'));
});

test('入れ子の要素を持つ扉でも閉じタグを取り違えない', () => {
  const html = `<html><body>
<section class="chapter-opening">
<p class="chapter-number">2</p>
<section class="chapter-topics"><p>この章で学ぶこと</p></section>
</section>
<section class="level1"><h1>応用編</h1></section>
</body></html>`;
  const result = injectTabMark(html, '<aside class="print-tab-mark"></aside>');
  assert.match(result, /<\/section>\n<aside class="print-tab-mark"><\/aside>\n<section class="level1">/);
});

test('扉を持たない原稿では body の直後へ入れる', () => {
  const html = '<html><body>\n<section class="level1"><h1>付録</h1></section>\n</body></html>';
  const result = injectTabMark(html, '<aside class="print-tab-mark"></aside>');
  assert.match(result, /<body>\n<aside class="print-tab-mark"/);
});

test('扉の閉じタグが無ければ例外を投げる', () => {
  const html = '<html><body><section class="chapter-opening"><p>扉</p></body></html>';
  assert.throws(
    () => injectTabMark(html, '<aside></aside>'),
    /章の扉.*閉じタグが見つかりません/
  );
});

test('つめが空なら HTML を変えない', () => {
  assert.strictEqual(injectTabMark(CHAPTER_HTML, ''), CHAPTER_HTML);
});

test('body 要素が無ければ例外を投げる', () => {
  assert.throws(() => injectTabMark('<div></div>', '<aside></aside>'), /body 要素が見つかりません/);
});

// --- hasChapterOpening ---

test('章かどうかは扉の有無で判定する', () => {
  assert.strictEqual(hasChapterOpening('<section class="chapter-opening">'), true);
  assert.strictEqual(hasChapterOpening('<h1>まえがき</h1>'), false);
});

// --- parseDocumentStartPages・toDocumentPageCounts ---

const EXTRACTED = [
  '@@@PAGE 1',
  '表紙',
  DOC_START_MARKER,
  '@@@PAGE 2',
  '本文',
  '@@@PAGE 3',
  `${DOC_START_MARKER} まえがき`,
  '@@@PAGE 4',
  '',
].join('\n');

test('目印のあるページ番号を原稿の開始ページとして拾う', () => {
  assert.deepStrictEqual(parseDocumentStartPages(EXTRACTED), [1, 3]);
});

test('同じページに目印が複数あっても 1 度だけ数える', () => {
  const text = `@@@PAGE 1\n${DOC_START_MARKER}\n${DOC_START_MARKER}\n`;
  assert.deepStrictEqual(parseDocumentStartPages(text), [1]);
});

test('開始ページと総ページ数から原稿ごとのページ数を求める', () => {
  assert.deepStrictEqual(toDocumentPageCounts([1, 3], 4), [2, 2]);
  assert.deepStrictEqual(toDocumentPageCounts([1, 3, 6], 7), [2, 3, 2]);
});

test('目印が 1 つも無ければ例外を投げる', () => {
  assert.throws(() => toDocumentPageCounts([], 10), /区切りを読み取れませんでした/);
});

test('先頭ページに目印が無ければ例外を投げる', () => {
  assert.throws(() => toDocumentPageCounts([2, 4], 6), /1 ページ目が原稿の先頭ではありません/);
});
