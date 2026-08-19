import { test } from 'node:test';
import assert from 'node:assert';
import zlib from 'node:zlib';
import { countPdfPages } from './count-pdf-pages.mjs';

// 実際の PDF は巨大なため、ページツリーの記述部分だけを模した文字列で検証する。
// Vivliostyle CLI が出力する PDF ではページオブジェクトが平文で現れることを
// dist/book.pdf で確認済み（オブジェクトストリームには入らない）。
function fakePdf({ pageObjects, rootCount, extra = '' }) {
  const pages = Array.from(
    { length: pageObjects },
    (_, i) => `${i + 1} 0 obj << /Type /Page /Parent 100 0 R >> endobj`
  ).join('\n');
  const root =
    rootCount === null
      ? ''
      : `100 0 obj << /Type /Pages /Count ${rootCount} /Kids [1 0 R] >> endobj`;
  return Buffer.from(`%PDF-1.7\n${pages}\n${root}\n${extra}\n%%EOF`, 'latin1');
}

test('ページオブジェクトの個数をページ数として返す', () => {
  assert.strictEqual(countPdfPages(fakePdf({ pageObjects: 29, rootCount: 29 })), 29);
});

test('ルートのページツリーが無くてもページオブジェクトから数える', () => {
  assert.strictEqual(countPdfPages(fakePdf({ pageObjects: 4, rootCount: null })), 4);
});

test('/Pages・/PageLabels をページオブジェクトと誤認しない', () => {
  const pdf = fakePdf({
    pageObjects: 2,
    rootCount: 2,
    extra: '200 0 obj << /Type /PageLabels /Nums [] >> endobj',
  });
  assert.strictEqual(countPdfPages(pdf), 2);
});

test('キーの間に改行があっても数えられる', () => {
  const pdf = Buffer.from(
    '%PDF-1.7\n1 0 obj << /Type\n/Page /Parent 100 0 R >> endobj\n%%EOF',
    'latin1'
  );
  assert.strictEqual(countPdfPages(pdf), 1);
});

// Vivliostyle CLI が出力した直後の PDF は、ページオブジェクトを圧縮された
// オブジェクトストリーム（/ObjStm）へ格納する。タグ付け後の PDF は平文になる
function fakePdfWithObjectStream({ pageObjects, rootCount }) {
  const objects = Array.from(
    { length: pageObjects },
    () => '<< /Type /Page /Parent 100 0 R >>'
  ).join('\n');
  const compressed = zlib.deflateSync(
    Buffer.from(`${objects}\n<< /Type /Pages /Count ${rootCount} /Kids [] >>`, 'latin1')
  );
  return Buffer.concat([
    Buffer.from('%PDF-1.7\n10 0 obj << /Type /ObjStm /Filter /FlateDecode >>\nstream\n', 'latin1'),
    compressed,
    Buffer.from('\nendstream endobj\n%%EOF', 'latin1'),
  ]);
}

test('圧縮されたオブジェクトストリーム内のページも数える', () => {
  assert.strictEqual(countPdfPages(fakePdfWithObjectStream({ pageObjects: 32, rootCount: 32 })), 32);
});

test('平文と圧縮側の両方にページ定義があっても二重に数えない', () => {
  // タグ付け（scripts/tag-pdf.mjs）を通した PDF は，平文のページ定義に加えて
  // 圧縮された写しを残すことがある
  const plain = fakePdf({ pageObjects: 3, rootCount: 3 });
  const compressed = fakePdfWithObjectStream({ pageObjects: 3, rootCount: 3 });
  assert.strictEqual(countPdfPages(Buffer.concat([plain, compressed])), 3);
});

test('オブジェクトストリーム以外の圧縮ストリームは展開しない', () => {
  // 本文の内容ストリームに現れる文字列でページ数を誤らないことを確かめる
  const content = zlib.deflateSync(Buffer.from('BT (/Type /Page) Tj ET', 'latin1'));
  const pdf = Buffer.concat([
    Buffer.from('%PDF-1.7\n1 0 obj << /Type /Page /Parent 100 0 R >> endobj\n', 'latin1'),
    Buffer.from('2 0 obj << /Filter /FlateDecode >>\nstream\n', 'latin1'),
    content,
    Buffer.from('\nendstream endobj\n%%EOF', 'latin1'),
  ]);
  assert.strictEqual(countPdfPages(pdf), 1);
});

test('ページオブジェクトが 1 つも無ければ例外を投げる', () => {
  const pdf = Buffer.from('%PDF-1.7\n%%EOF', 'latin1');
  assert.throws(() => countPdfPages(pdf), /ページ数を読み取れませんでした/);
});

test('ページ定義が平文と圧縮側へ分かれていてもルートの宣言を返す', () => {
  // Vivliostyle の出力では 1 つの PDF に両形式が混在することがある
  const plain = fakePdf({ pageObjects: 29, rootCount: null });
  const compressed = fakePdfWithObjectStream({ pageObjects: 7, rootCount: 36 });
  assert.strictEqual(countPdfPages(Buffer.concat([plain, compressed])), 36);
});

// 圧縮結果の末尾が CR（0x0d）になる中身を作る。zlib の末尾 4 バイトは adler32 で
// あり、中身を 1 文字ずつ増やせば末尾のバイトは一巡する。
// 詰め物に空白（0x20）を使うと 32 の倍数しか動かず 0x0d へ届かない
function deflateEndingWithCarriageReturn(content) {
  for (let padding = 0; padding < 512; padding += 1) {
    const compressed = zlib.deflateSync(
      Buffer.from(`${content}\n%${'a'.repeat(padding)}`, 'latin1')
    );
    if (compressed[compressed.length - 1] === 0x0d) return compressed;
  }
  throw new Error('末尾が CR になる圧縮結果を作れなかった');
}

// 圧縮データの最後のバイトが CR で、その後ろに改行 1 つを挟んで endstream が続く形。
// Vivliostyle が出した PDF の最後のオブジェクトストリームがこの形だった
function fakePdfWithCarriageReturnTail({ plainPages, streamPages, rootCount }) {
  const plain = Array.from(
    { length: plainPages },
    (_, i) => `${i + 1} 0 obj << /Type /Page /Parent 100 0 R >> endobj`
  ).join('\n');
  const objects = Array.from(
    { length: streamPages },
    () => '<< /Type /Page /Parent 100 0 R >>'
  ).join('\n');
  const compressed = deflateEndingWithCarriageReturn(
    `${objects}\n<< /Type /Pages /Count ${rootCount} /Kids [] >>`
  );
  return Buffer.concat([
    Buffer.from(
      `%PDF-1.7\n${plain}\n200 0 obj\n` +
        `<< /Type /ObjStm /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n`,
      'latin1'
    ),
    compressed,
    Buffer.from('\nendstream\nendobj\n%%EOF', 'latin1'),
  ]);
}

test('圧縮データの末尾が CR でもオブジェクトストリームを取り逃さない', () => {
  // endstream の直前の改行を削るとき CRLF とみなすと、データの最後の 1 バイトまで
  // 削れて展開に失敗する。取り逃した中にページツリーのルートが入ると、平文の
  // ページだけを数えて実際より少ない値を返す（Issue #145）
  const pdf = fakePdfWithCarriageReturnTail({ plainPages: 4, streamPages: 2, rootCount: 6 });
  assert.strictEqual(countPdfPages(pdf), 6);
});

test('辞書が入れ子を含むオブジェクトストリームも展開する', () => {
  // /DecodeParms のように値が辞書のキーがあり、その位置は決まっていない。
  // 最初の >> を辞書の終わりとみなすと /ObjStm を見落とす
  const content = '<< /Type /Page /Parent 100 0 R >>\n<< /Type /Pages /Count 7 /Kids [] >>';
  const compressed = zlib.deflateSync(Buffer.from(content, 'latin1'));
  const pdf = Buffer.concat([
    Buffer.from(
      '%PDF-1.7\n200 0 obj\n<< /Filter /FlateDecode /DecodeParms << /Predictor 1 >> ' +
        `/Type /ObjStm /N 2 /First 34 /Length ${compressed.length} >>\nstream\n`,
      'latin1'
    ),
    compressed,
    Buffer.from('\nendstream\nendobj\n%%EOF', 'latin1'),
  ]);
  assert.strictEqual(countPdfPages(pdf), 7);
});

test('入れ子の辞書にある /Length をストリームの長さと取り違えない', () => {
  // 外側の /Length より前に入れ子の /Length があると、そちらを拾って
  // 1 バイトだけを展開しようとし、オブジェクトストリームごと落とす
  const content = '<< /Type /Page /Parent 100 0 R >>\n<< /Type /Pages /Count 9 /Kids [] >>';
  const compressed = zlib.deflateSync(Buffer.from(content, 'latin1'));
  const pdf = Buffer.concat([
    Buffer.from(
      '%PDF-1.7\n200 0 obj\n<< /Filter /FlateDecode /DecodeParms << /Length 1 >> ' +
        `/Type /ObjStm /N 2 /First 34 /Length ${compressed.length} >>\nstream\n`,
      'latin1'
    ),
    compressed,
    Buffer.from('\nendstream\nendobj\n%%EOF', 'latin1'),
  ]);
  assert.strictEqual(countPdfPages(pdf), 9);
});

test('辞書の中の文字列をオブジェクトの見出しと取り違えない', () => {
  // (12 0 obj) のような文字列があると、そこを次のオブジェクトの始まりとみなし、
  // 本物のオブジェクトの辞書が途中で切れる
  const content = '<< /Type /Page /Parent 100 0 R >>\n<< /Type /Pages /Count 5 /Kids [] >>';
  const compressed = zlib.deflateSync(Buffer.from(content, 'latin1'));
  const pdf = Buffer.concat([
    Buffer.from(
      '%PDF-1.7\n200 0 obj\n<< /Note (12 0 obj) /Type /ObjStm /N 2 /First 34 ' +
        `/Length ${compressed.length} >>\nstream\n`,
      'latin1'
    ),
    compressed,
    Buffer.from('\nendstream\nendobj\n%%EOF', 'latin1'),
  ]);
  assert.strictEqual(countPdfPages(pdf), 5);
});

test('文字列の中の >> を辞書の終わりと取り違えない', () => {
  // PDF の文字列リテラルには >> をそのまま書ける。区切りとして数えると
  // 外側の辞書が早く閉じ、/ObjStm を見落とす
  const content = '<< /Type /Page /Parent 100 0 R >>\n<< /Type /Pages /Count 3 /Kids [] >>';
  const compressed = zlib.deflateSync(Buffer.from(content, 'latin1'));
  const pdf = Buffer.concat([
    Buffer.from(
      '%PDF-1.7\n200 0 obj\n<< /Note (harmless >> text) /Type /ObjStm /N 2 /First 34 ' +
        `/Length ${compressed.length} >>\nstream\n`,
      'latin1'
    ),
    compressed,
    Buffer.from('\nendstream\nendobj\n%%EOF', 'latin1'),
  ]);
  assert.strictEqual(countPdfPages(pdf), 3);
});

test('見出しと辞書の間にコメントがあっても読める', () => {
  // PDF は % から行末までをコメントとし、空白と同じ扱いで書ける
  const content = '<< /Type /Page /Parent 100 0 R >>\n<< /Type /Pages /Count 8 /Kids [] >>';
  const compressed = zlib.deflateSync(Buffer.from(content, 'latin1'));
  const pdf = Buffer.concat([
    Buffer.from(
      '%PDF-1.7\n200 0 obj\n% 生成器が書いた注記\n<< /Type /ObjStm /N 2 /First 34 ' +
        `/Length ${compressed.length} >>\nstream\n`,
      'latin1'
    ),
    compressed,
    Buffer.from('\nendstream\nendobj\n%%EOF', 'latin1'),
  ]);
  assert.strictEqual(countPdfPages(pdf), 8);
});

// 辞書のまわりに書ける構文（コメント・文字列）を変えながら同じ中身を組み立てる
function fakePdfWithDictionary(dictionaryBody, rootCount, { beforeStream = '' } = {}) {
  const content = `<< /Type /Page /Parent 100 0 R >>\n<< /Type /Pages /Count ${rootCount} /Kids [] >>`;
  const compressed = zlib.deflateSync(Buffer.from(content, 'latin1'));
  return Buffer.concat([
    Buffer.from(
      `%PDF-1.7\n200 0 obj\n<< ${dictionaryBody} /Length ${compressed.length} >>` +
        `${beforeStream}\nstream\n`,
      'latin1'
    ),
    compressed,
    Buffer.from('\nendstream\nendobj\n%%EOF', 'latin1'),
  ]);
}

test('辞書の中のコメントに >> があっても終わりと取り違えない', () => {
  const pdf = fakePdfWithDictionary('% harmless >>\n /Type /ObjStm /N 2 /First 34', 4);
  assert.strictEqual(countPdfPages(pdf), 4);
});

test('文字列の中の /Length をストリームの長さと取り違えない', () => {
  const pdf = fakePdfWithDictionary('/Note (/Length 1) /Type /ObjStm /N 2 /First 34', 6);
  assert.strictEqual(countPdfPages(pdf), 6);
});

test('辞書と stream の間にコメントがあっても読める', () => {
  const pdf = fakePdfWithDictionary('/Type /ObjStm /N 2 /First 34', 7, {
    beforeStream: ' % 生成器が書いた注記',
  });
  assert.strictEqual(countPdfPages(pdf), 7);
});

test('見出しの数値の間にコメントがあっても読める', () => {
  // PDF はトークンの区切りにコメントを書ける。見出しも例外ではない
  const content = '<< /Type /Page /Parent 100 0 R >>\n<< /Type /Pages /Count 2 /Kids [] >>';
  const compressed = zlib.deflateSync(Buffer.from(content, 'latin1'));
  const pdf = Buffer.concat([
    Buffer.from(
      '%PDF-1.7\n200 % 生成器が書いた注記\n0 obj\n<< /Type /ObjStm /N 2 /First 34 ' +
        `/Length ${compressed.length} >>\nstream\n`,
      'latin1'
    ),
    compressed,
    Buffer.from('\nendstream\nendobj\n%%EOF', 'latin1'),
  ]);
  assert.strictEqual(countPdfPages(pdf), 2);
});

test('配列の中の /Length をストリームの長さと取り違えない', () => {
  const pdf = fakePdfWithDictionary('/Note [ /Length 1 ] /Type /ObjStm /N 2 /First 34', 5);
  assert.strictEqual(countPdfPages(pdf), 5);
});

test('配列の中の辞書と文字列をまたいで閉じを見つける', () => {
  // << の 2 文字目を 16 進文字列の開始とみなすと、文字列の中の > で走査が再開し、
  // その先の ] を配列の閉じと取り違える
  const pdf = fakePdfWithDictionary('/Note [ << /Text (> ]) >> ] /Type /ObjStm /N 2 /First 34', 3);
  assert.strictEqual(countPdfPages(pdf), 3);
});

test('NUL を空白として扱う', () => {
  // PDF の空白には NUL（0x00）が含まれる。JavaScript の \s は NUL を含まない
  const content = '<< /Type /Page /Parent 100 0 R >>\n<< /Type /Pages /Count 4 /Kids [] >>';
  const compressed = zlib.deflateSync(Buffer.from(content, 'latin1'));
  const pdf = Buffer.concat([
    Buffer.from(
      '%PDF-1.7\n200 0 obj\x00<< /Type /ObjStm /N 2 /First 34 ' +
        `/Length ${compressed.length} >>\x00stream\n`,
      'latin1'
    ),
    compressed,
    Buffer.from('\nendstream\nendobj\n%%EOF', 'latin1'),
  ]);
  assert.strictEqual(countPdfPages(pdf), 4);
});

test('/Length が間接参照で圧縮データの末尾が CR でも展開できる', () => {
  // 間接参照ではデータの終わりを断定できない。CR で終わるデータと CRLF の
  // 区切りを見分けられないため、確からしい順に試す
  const compressed = deflateEndingWithCarriageReturn(
    '<< /Type /Page /Parent 100 0 R >>\n<< /Type /Pages /Count 6 /Kids [] >>'
  );
  const pdf = Buffer.concat([
    Buffer.from(
      '%PDF-1.7\n200 0 obj\n<< /Type /ObjStm /N 2 /First 34 /Length 9 0 R >>\nstream\n',
      'latin1'
    ),
    compressed,
    Buffer.from('\nendstream\nendobj\n%%EOF', 'latin1'),
  ]);
  assert.strictEqual(countPdfPages(pdf), 6);
});

test('/Length が間接参照でも endstream からストリームの終わりを決める', () => {
  const content = '<< /Type /Page /Parent 100 0 R >>\n<< /Type /Pages /Count 1 /Kids [] >>';
  const compressed = zlib.deflateSync(Buffer.from(content, 'latin1'));
  const pdf = Buffer.concat([
    Buffer.from('%PDF-1.7\n200 0 obj\n<< /Type /ObjStm /Filter /FlateDecode /Length 9 0 R >>\nstream\n', 'latin1'),
    compressed,
    Buffer.from('\nendstream\nendobj\n%%EOF', 'latin1'),
  ]);
  assert.strictEqual(countPdfPages(pdf), 1);
});

test('総ページ数の宣言が複数あれば例外を投げる', () => {
  const a = fakePdf({ pageObjects: 3, rootCount: 3 });
  const b = fakePdf({ pageObjects: 5, rootCount: 5 });
  assert.throws(() => countPdfPages(Buffer.concat([a, b])), /複数の総ページ数/);
});
