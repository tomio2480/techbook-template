import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { validateIsdnNumber, validateIsdn } from './check-isdn.mjs';

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
