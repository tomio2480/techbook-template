import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  validateIsdnNumber,
  validateCCode,
  validatePrice,
  validateIsdn,
  isRegularFile,
  isSampleBarcode,
  SAMPLE_ISDN_NUMBER,
} from './check-isdn.mjs';

/* チェックディジットはモジュラス 10 ウェイト 3・1 で計算した実在しうる値 */
const VALID_NUMBER = 'ISDN278-4-123456-78-1';
const VALID_NUMBER_279 = '279-4-123456-78-0';

describe('validateIsdnNumber', () => {
  it('正しい番号（ISDN 接頭辞あり）を受け入れる', () => {
    assert.deepEqual(validateIsdnNumber(VALID_NUMBER), []);
  });

  it('正しい番号（接頭辞なし・プレフィックス 279）を受け入れる', () => {
    assert.deepEqual(validateIsdnNumber(VALID_NUMBER_279), []);
  });

  it('13 桁でない番号を拒否する', () => {
    const errors = validateIsdnNumber('ISDN278-4-12345-78-1');
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes('13'));
  });

  it('プレフィックスが 278・279 以外の番号を拒否する', () => {
    const errors = validateIsdnNumber('280-4-123456-78-8');
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes('278'));
  });

  it('チェックディジットが合わない番号を拒否する', () => {
    const errors = validateIsdnNumber('ISDN278-4-123456-78-2');
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes('チェックディジット'));
  });

  it('数字とハイフン以外を含む番号を拒否する', () => {
    assert.ok(validateIsdnNumber('ISDN278-4-12345X-78-1').length >= 1);
  });

  it('YAML の数値として書かれた番号も文字列として検査する', () => {
    assert.deepEqual(validateIsdnNumber(2784123456781), []);
  });
});

describe('validateCCode', () => {
  it('4 桁の C コード（C 接頭辞の有無を問わず）を受け入れる', () => {
    assert.deepEqual(validateCCode('0095'), []);
    assert.deepEqual(validateCCode('C0095'), []);
  });

  it('4 桁でない C コードへ問題を返す', () => {
    assert.equal(validateCCode('95').length, 1);
    assert.equal(validateCCode('00950').length, 1);
    assert.equal(validateCCode('009X').length, 1);
  });

  it('YAML の数値として書かれ先頭ゼロが落ちた値は問題として知らせる', () => {
    assert.equal(validateCCode(95).length, 1);
  });
});

describe('validateIsdn のサンプル番号検査', () => {
  it('テンプレートのサンプル番号のままなら警告を出す', () => {
    const { errors, warnings } = validateIsdn(
      { issued: { number: SAMPLE_ISDN_NUMBER } },
      { barcodeExists: true },
    );
    assert.equal(errors.length, 0);
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].includes('サンプル'));
  });

  it('サンプル以外の正しい番号には警告を出さない', () => {
    const { warnings } = validateIsdn(
      { issued: { number: VALID_NUMBER_279 } },
      { barcodeExists: true },
    );
    assert.equal(warnings.length, 0);
  });
});

describe('validatePrice', () => {
  it('円単位の整数（文字列・数値・桁区切りカンマ付き）を受け入れる', () => {
    assert.deepEqual(validatePrice('1000'), []);
    assert.deepEqual(validatePrice(1000), []);
    assert.deepEqual(validatePrice('1,000'), []);
    assert.deepEqual(validatePrice('0'), []);
  });

  it('正しく 3 桁区切りされた価格を受け入れる', () => {
    assert.deepEqual(validatePrice('1,234,567'), []);
    assert.deepEqual(validatePrice('999'), []);
  });

  it('区切り位置が誤ったカンマへ問題を返す', () => {
    assert.equal(validatePrice('1,,000').length, 1);
    assert.equal(validatePrice('10,00').length, 1);
    assert.equal(validatePrice('1,0000').length, 1);
    assert.equal(validatePrice(',1000').length, 1);
    assert.equal(validatePrice('1000,').length, 1);
    assert.equal(validatePrice('1,234,56').length, 1);
  });

  it('小数・負数・数字以外を含む価格へ問題を返す', () => {
    assert.equal(validatePrice('1000.50').length, 1);
    assert.equal(validatePrice('-1000').length, 1);
    assert.equal(validatePrice(1000.5).length, 1);
    assert.equal(validatePrice(-1000).length, 1);
    assert.equal(validatePrice('1000円').length, 1);
  });
});

describe('isSampleBarcode', () => {
  it('テンプレート同梱のダミー画像を検出する', () => {
    const dummy = new URL('../src/assets/isdn-barcode.png', import.meta.url);
    assert.equal(isSampleBarcode(dummy), true);
  });

  it('別内容の画像や存在しないパスは検出しない', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'isdn-barcode-test-'));
    try {
      const file = path.join(dir, 'barcode.png');
      fs.writeFileSync(file, 'not the dummy');
      assert.equal(isSampleBarcode(file), false);
      assert.equal(isSampleBarcode(path.join(dir, 'missing.png')), false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('validateIsdn のダミーバーコード検査', () => {
  it('ダミー画像のままなら警告を出す', () => {
    const { errors, warnings } = validateIsdn(
      { issued: { number: VALID_NUMBER_279 } },
      { barcodeExists: true, barcodeIsSample: true },
    );
    assert.equal(errors.length, 0);
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].includes('ダミー'));
  });

  it('差し替え済みの画像には警告を出さない', () => {
    const { warnings } = validateIsdn(
      { issued: { number: VALID_NUMBER_279 } },
      { barcodeExists: true, barcodeIsSample: false },
    );
    assert.equal(warnings.length, 0);
  });
});

describe('validateIsdn の C コード検査', () => {
  it('4 桁でない application.c_code へ警告を出す', () => {
    const { errors, warnings } = validateIsdn(
      { application: { c_code: '95' }, issued: { number: '' } },
      { barcodeExists: false },
    );
    assert.equal(errors.length, 0);
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].includes('c_code'));
  });

  it('未設定の application.c_code は正常として扱う', () => {
    const { warnings } = validateIsdn(
      { application: { c_code: '' }, issued: { number: '' } },
      { barcodeExists: false },
    );
    assert.equal(warnings.length, 0);
  });
});

describe('isRegularFile', () => {
  it('通常ファイルなら true を返す', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'isdn-test-'));
    try {
      const file = path.join(dir, 'barcode.png');
      fs.writeFileSync(file, 'dummy');
      assert.equal(isRegularFile(file), true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('ディレクトリなら false を返す（img の src へ渡して静かに壊れる事故を防ぐ）', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'isdn-test-'));
    try {
      assert.equal(isRegularFile(dir), false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('存在しないパスなら false を返す', () => {
    assert.equal(isRegularFile(path.join(os.tmpdir(), 'isdn-test-not-exist', 'x.png')), false);
  });
});

describe('validateIsdn', () => {
  const issuedWith = (number) => ({ issued: { number, barcode: 'src/assets/isdn-barcode.png' } });

  it('番号とバーコードが揃っていれば合格する', () => {
    const { errors, warnings } = validateIsdn(issuedWith(VALID_NUMBER), { barcodeExists: true });
    assert.deepEqual(errors, []);
    assert.deepEqual(warnings, []);
  });

  it('番号未発行（空値）は正常として扱う', () => {
    const { errors, warnings } = validateIsdn(issuedWith(''), { barcodeExists: false });
    assert.deepEqual(errors, []);
    assert.deepEqual(warnings, []);
  });

  it('不正な番号はエラーにする', () => {
    const { errors } = validateIsdn(issuedWith('ISDN278-4-123456-78-2'), { barcodeExists: true });
    assert.equal(errors.length, 1);
  });

  it('番号があるのにバーコード画像が無い場合は警告する', () => {
    const { errors, warnings } = validateIsdn(issuedWith(VALID_NUMBER), { barcodeExists: false });
    assert.deepEqual(errors, []);
    assert.equal(warnings.length, 1);
  });

  it('バーコード画像があるのに番号が無い場合は警告する', () => {
    const { errors, warnings } = validateIsdn(issuedWith(''), { barcodeExists: true });
    assert.deepEqual(errors, []);
    assert.equal(warnings.length, 1);
  });

  it('isdn.yaml が読めない場合は警告して検査を省略する', () => {
    const { errors, warnings } = validateIsdn(null, { barcodeExists: false });
    assert.deepEqual(errors, []);
    assert.equal(warnings.length, 1);
  });

  it('issued 節が無い場合は番号未発行と同じ扱いにする', () => {
    const { errors, warnings } = validateIsdn({}, { barcodeExists: false });
    assert.deepEqual(errors, []);
    assert.deepEqual(warnings, []);
  });
});
