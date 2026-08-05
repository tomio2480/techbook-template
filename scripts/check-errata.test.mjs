import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateErrata, extractContext } from './check-errata.mjs';

/** 検証に通る初期状態（未出版）のデータを返す */
function initialData() {
  return {
    book: { slug: 'example-book', title: '書籍タイトル' },
    editions: [],
    errata: [],
  };
}

/** 検証に通る出版後のデータ（第 2 版まで刊行済み）を返す */
function publishedData() {
  return {
    book: { slug: 'example-book', title: '書籍タイトル' },
    editions: [
      { edition: 1, date: '2025-08-15', event: 'コミックマーケット106', release: 'v1.0.5' },
      { edition: 2, date: '2026-01-10', release: 'v2.0.0' },
    ],
    errata: [
      {
        page: 12,
        location: '3 行目',
        wrong: '誤りの記述',
        correct: '正しい記述',
        date: '2025-09-01',
        applies_to: [1],
        fixed_in: 2,
      },
    ],
  };
}

const initialContext = { packageMajor: 1, bookYamlMajor: 1, bookYamlTitle: '書籍タイトル' };
const publishedContext = { packageMajor: 2, bookYamlMajor: 2, bookYamlTitle: '書籍タイトル' };

describe('validateErrata: 正常系', () => {
  it('初期状態（editions・errata が空）はエラーなしで通る', () => {
    const { errors, warnings } = validateErrata(initialData(), initialContext);
    assert.deepEqual(errors, []);
    assert.deepEqual(warnings, []);
  });

  it('出版後の完全なデータはエラーなしで通る', () => {
    const { errors } = validateErrata(publishedData(), publishedContext);
    assert.deepEqual(errors, []);
  });

  it('page は文字列（範囲表記など）も許容する', () => {
    const data = publishedData();
    data.errata[0].page = '12-13';
    const { errors } = validateErrata(data, publishedContext);
    assert.deepEqual(errors, []);
  });
});

describe('validateErrata: book 節', () => {
  it('book 節がないとエラーになる', () => {
    const data = initialData();
    delete data.book;
    const { errors } = validateErrata(data, initialContext);
    assert.ok(errors.length > 0);
  });

  it('slug がないとエラーになる', () => {
    const data = initialData();
    delete data.book.slug;
    const { errors } = validateErrata(data, initialContext);
    assert.ok(errors.some((e) => e.includes('slug')));
  });

  it('slug に大文字や記号が含まれるとエラーになる', () => {
    const data = initialData();
    data.book.slug = 'Example_Book!';
    const { errors } = validateErrata(data, initialContext);
    assert.ok(errors.some((e) => e.includes('slug')));
  });

  it('title がないとエラーになる', () => {
    const data = initialData();
    delete data.book.title;
    const { errors } = validateErrata(data, initialContext);
    assert.ok(errors.some((e) => e.includes('title')));
  });

  it('title が book.yaml と一致しない場合は警告（エラーではない）になる', () => {
    const data = initialData();
    data.book.title = '別のタイトル';
    const { errors, warnings } = validateErrata(data, initialContext);
    assert.deepEqual(errors, []);
    assert.ok(warnings.some((w) => w.includes('title')));
  });
});

describe('validateErrata: editions 節', () => {
  it('editions が配列でないとエラーになる', () => {
    const data = initialData();
    data.editions = null;
    const { errors } = validateErrata(data, initialContext);
    assert.ok(errors.some((e) => e.includes('editions')));
  });

  it('版番号が 1 から連番でないとエラーになる', () => {
    const data = publishedData();
    data.editions[1].edition = 3;
    data.errata = [];
    const { errors } = validateErrata(data, { ...publishedContext, packageMajor: 3, bookYamlMajor: 3 });
    assert.ok(errors.some((e) => e.includes('連番')));
  });

  it('date が YYYY-MM-DD 形式でないとエラーになる', () => {
    const data = publishedData();
    data.editions[0].date = '2025/08/15';
    const { errors } = validateErrata(data, publishedContext);
    assert.ok(errors.some((e) => e.includes('date')));
  });

  it('形式は合うが実在しない日付（13 月・2 月 30 日）はエラーになる', () => {
    for (const bad of ['2025-13-45', '2025-02-30', '0000-00-00']) {
      const data = publishedData();
      data.editions[0].date = bad;
      const { errors } = validateErrata(data, publishedContext);
      assert.ok(errors.some((e) => e.includes('date')), `${bad} が通ってしまう`);
    }
  });

  it('release タグの先頭ゼロ（v01.0.0）はエラーになる', () => {
    const data = publishedData();
    data.editions[0].release = 'v01.0.5';
    const { errors } = validateErrata(data, publishedContext);
    assert.ok(errors.some((e) => e.includes('release')));
  });

  it('release タグの major が版番号と一致しないとエラーになる', () => {
    const data = publishedData();
    data.editions[1].release = 'v1.2.0';
    const { errors } = validateErrata(data, publishedContext);
    assert.ok(errors.some((e) => e.includes('release')));
  });

  it('release が vX.Y.Z 形式でないとエラーになる', () => {
    const data = publishedData();
    data.editions[0].release = '1.0.5';
    const { errors } = validateErrata(data, publishedContext);
    assert.ok(errors.some((e) => e.includes('release')));
  });
});

describe('validateErrata: 版番号と package.json の整合', () => {
  it('最新版番号が package.json の major と一致しないとエラーになる', () => {
    const { errors } = validateErrata(publishedData(), { ...publishedContext, packageMajor: 3 });
    assert.ok(errors.some((e) => e.includes('package.json')));
  });

  it('editions が空のとき package.json の major が 1 でないとエラーになる', () => {
    const { errors } = validateErrata(initialData(), { ...initialContext, packageMajor: 2 });
    assert.ok(errors.some((e) => e.includes('package.json')));
  });

  it('book.yaml の version の major が package.json と一致しないとエラーになる', () => {
    const { errors } = validateErrata(initialData(), { ...initialContext, bookYamlMajor: 2 });
    assert.ok(errors.some((e) => e.includes('book.yaml')));
  });
});

describe('validateErrata: errata 節', () => {
  it('必須キー（wrong）が欠けているとエラーになる', () => {
    const data = publishedData();
    delete data.errata[0].wrong;
    const { errors } = validateErrata(data, publishedContext);
    assert.ok(errors.some((e) => e.includes('wrong')));
  });

  it('applies_to が存在しない版を参照するとエラーになる', () => {
    const data = publishedData();
    data.errata[0].applies_to = [3];
    const { errors } = validateErrata(data, publishedContext);
    assert.ok(errors.some((e) => e.includes('applies_to')));
  });

  it('applies_to が空配列だとエラーになる', () => {
    const data = publishedData();
    data.errata[0].applies_to = [];
    const { errors } = validateErrata(data, publishedContext);
    assert.ok(errors.some((e) => e.includes('applies_to')));
  });

  it('fixed_in が存在しない版を参照するとエラーになる', () => {
    const data = publishedData();
    data.errata[0].fixed_in = 3;
    const { errors } = validateErrata(data, publishedContext);
    assert.ok(errors.some((e) => e.includes('fixed_in')));
  });

  it('fixed_in が applies_to の最大値以下だとエラーになる', () => {
    const data = publishedData();
    data.errata[0].applies_to = [1, 2];
    data.errata[0].fixed_in = 2;
    const { errors } = validateErrata(data, publishedContext);
    assert.ok(errors.some((e) => e.includes('fixed_in')));
  });

  it('fixed_in は省略できる', () => {
    const data = publishedData();
    delete data.errata[0].fixed_in;
    const { errors } = validateErrata(data, publishedContext);
    assert.deepEqual(errors, []);
  });

  it('applies_to に重複があるとエラーになる', () => {
    const data = publishedData();
    data.errata[0].applies_to = [1, 1];
    const { errors } = validateErrata(data, publishedContext);
    assert.ok(errors.some((e) => e.includes('applies_to')));
  });

  it('wrong が文字列でない（0 や false）とエラーになる', () => {
    for (const bad of [0, false]) {
      const data = publishedData();
      data.errata[0].wrong = bad;
      const { errors } = validateErrata(data, publishedContext);
      assert.ok(errors.some((e) => e.includes('wrong')), `wrong: ${bad} が通ってしまう`);
    }
  });

  it('editions が空なのに errata があるとエラーになる', () => {
    const data = initialData();
    data.errata = [
      {
        page: 1,
        location: '1 行目',
        wrong: '誤',
        correct: '正',
        date: '2025-09-01',
        applies_to: [1],
      },
    ];
    const { errors } = validateErrata(data, initialContext);
    assert.ok(errors.length > 0);
  });
});

describe('extractContext: version 情報の抽出', () => {
  it('通常の semver から major を抽出する', () => {
    const ctx = extractContext('1.0.5', { title: 'T', version: '1.0.0' });
    assert.equal(ctx.packageMajor, 1);
    assert.equal(ctx.bookYamlMajor, 1);
    assert.equal(ctx.bookYamlTitle, 'T');
    assert.deepEqual(ctx.warnings, []);
  });

  it('book.yaml の version が "2"（ドットなし）でも major を抽出する', () => {
    const ctx = extractContext('2.0.0', { version: '2' });
    assert.equal(ctx.bookYamlMajor, 2);
  });

  it('book.yaml の version が YAML 数値（2.0）でも major を抽出する', () => {
    const ctx = extractContext('2.0.0', { version: 2.0 });
    assert.equal(ctx.bookYamlMajor, 2);
  });

  it('book.yaml の version から抽出できない場合は警告を出す', () => {
    const ctx = extractContext('1.0.0', { version: 'unknown' });
    assert.equal(ctx.bookYamlMajor, undefined);
    assert.ok(ctx.warnings.length > 0);
  });

  it('package.json の version が不正なら packageMajor は null になる', () => {
    for (const bad of ['v1.0.0', undefined, '']) {
      const ctx = extractContext(bad, null);
      assert.equal(ctx.packageMajor, null, `${bad} で null にならない`);
    }
  });

  it('book.yaml が無い場合は突合情報なし・警告ありになる', () => {
    const ctx = extractContext('1.0.0', null);
    assert.equal(ctx.bookYamlMajor, undefined);
    assert.equal(ctx.bookYamlTitle, undefined);
    assert.ok(ctx.warnings.length > 0);
  });
});
