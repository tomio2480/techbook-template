#!/usr/bin/env node
/**
 * config/isdn.yaml（ISDN 申請情報・発行情報）の整合性検査
 *
 * ISDN 対応の要求要件（docs/spec/isdn.md）に基づき，以下を検査する．
 * - issued.number: 13 桁・プレフィックス 278/279・チェックディジット
 * - issued.number とバーコード画像の存在の整合（片方だけは警告）
 *
 * 番号未発行（空値）は正常として扱う．申請前のリポジトリを壊さないため．
 */

import crypto from 'crypto';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { parse } from 'yaml';

const ISDN_PREFIXES = ['278', '279'];
const ISDN_DIGITS = 13;

/* issued.barcode 未指定時の既定パス．vivliostyle.config.js と共有する */
export const DEFAULT_BARCODE_PATH = 'src/assets/isdn-barcode.png';

/* テンプレート同梱のサンプル番号．config/isdn.yaml の初期値と揃える．
   このままの出版を防ぐため，検査で差し替え忘れを警告する */
export const SAMPLE_ISDN_NUMBER = 'ISDN278-4-876543-21-9';

/* テンプレート同梱のダミーバーコード画像の SHA-256．
   番号だけ差し替えて画像を忘れる事故を，画像自体の一致で検出する */
export const SAMPLE_BARCODE_SHA256 =
  'aebdbd2ff5d7837ee40e0f746ed211906fc3a015f92bdab4a417c24ba961428e';

/**
 * パスの内容がテンプレート同梱のダミーバーコードかどうかを判定する．
 * 読めないパスは「ダミーでない」として扱う（存在検査は別で行う）．
 * @param {string | URL} filePath
 * @returns {boolean}
 */
export function isSampleBarcode(filePath) {
  try {
    const digest = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
    return digest === SAMPLE_BARCODE_SHA256;
  } catch {
    return false;
  }
}

/**
 * 値が空でない文字列かどうかを判定する．
 * @param {unknown} value
 * @returns {boolean}
 */
function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * パスが通常ファイルを指すかどうかを判定する．
 * existsSync はディレクトリでも true を返し，img の src へ渡すと
 * 静かに壊れた参照になるため，ファイル種別まで確認する．
 * @param {string | URL} filePath
 * @returns {boolean}
 */
export function isRegularFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    /* 存在しない・アクセス不能は「ファイルでない」として扱う */
    return false;
  }
}

/**
 * issued.number の生値を検査用の文字列へ整える．
 * YAML で引用符なしに書かれた番号は数値として読まれるため文字列へ寄せる．
 * @param {unknown} value
 * @returns {string}
 */
function normalizeNumber(value) {
  return String(value ?? '').trim().replace(/^ISDN/, '');
}

/**
 * ISDN 番号を検査し，問題点の一覧を返す．空配列なら合格である．
 * 「ISDN」接頭辞とハイフンの有無は問わない．
 * @param {unknown} value
 * @returns {string[]}
 */
export function validateIsdnNumber(value) {
  const body = normalizeNumber(value);
  if (!/^[\d-]+$/.test(body)) {
    return [`issued.number: 数字とハイフン以外の文字を含む（${body}）`];
  }
  const digits = body.replace(/-/g, '');
  if (digits.length !== ISDN_DIGITS) {
    return [`issued.number: ハイフンを除いて ${ISDN_DIGITS} 桁の数字が必要（現在 ${digits.length} 桁）`];
  }
  const prefix = digits.slice(0, 3);
  if (!ISDN_PREFIXES.includes(prefix)) {
    return [`issued.number: プレフィックスは 278 または 279 が必要（現在 ${prefix}）`];
  }
  /* チェックディジットはモジュラス 10 ウェイト 3・1（EAN-13 と同方式） */
  const sum = digits
    .slice(0, -1)
    .split('')
    .reduce((acc, digit, index) => acc + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  const expected = (10 - (sum % 10)) % 10;
  if (Number(digits.at(-1)) !== expected) {
    return [`issued.number: チェックディジットが合わない（期待値 ${expected}）`];
  }
  return [];
}

/**
 * C コード（application.c_code）を検査し，問題点の一覧を返す．
 * 「C」接頭辞の有無は問わない．先頭ゼロ落ち（YAML の数値扱い）も検出する．
 * @param {unknown} value
 * @returns {string[]}
 */
export function validateCCode(value) {
  const body = String(value ?? '').trim().replace(/^C/i, '');
  if (!/^\d{4}$/.test(body)) {
    return [
      `application.c_code: C コードは 4 桁の数字を引用符付きで書く（現在 ${body}）`,
    ];
  }
  return [];
}

/**
 * 価格（application.price）を検査し，問題点の一覧を返す．
 * 出版物のコード行へそのまま載るため，円単位の 0 以上の整数に限る．
 * 桁区切りのカンマは許容する．小数・負数・単位付きは受け付けない．
 * @param {unknown} value
 * @returns {string[]}
 */
export function validatePrice(value) {
  const problem = [
    `application.price: 価格は円単位の 0 以上の整数で書く（現在 ${String(value).trim()}）`,
  ];
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 0 ? [] : problem;
  }
  const body = String(value ?? '').trim().replace(/,/g, '');
  return /^\d+$/.test(body) ? [] : problem;
}

/**
 * 価格をコード行用の数字列へ整える．検査合格が前提である．
 * @param {unknown} value
 * @returns {string}
 */
export function normalizePrice(value) {
  return String(value ?? '').trim().replace(/,/g, '');
}

/**
 * isdn.yaml の内容を検査する．
 * @param {unknown} data isdn.yaml をパースしたオブジェクト
 * @param {{ barcodeExists: boolean, barcodeIsSample?: boolean }} context
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateIsdn(data, context) {
  const errors = [];
  const warnings = [];
  if (data === null || data === undefined || typeof data !== 'object') {
    warnings.push('config/isdn.yaml が読めないため検査を省略する');
    return { errors, warnings };
  }
  const number = data.issued && typeof data.issued === 'object' ? data.issued.number : undefined;
  const hasNumber = normalizeNumber(number) !== '';
  if (hasNumber) {
    errors.push(...validateIsdnNumber(number));
    if (errors.length === 0 && !context.barcodeExists) {
      warnings.push('issued.number があるのにバーコード画像が無い．受領した画像を issued.barcode のパスへ置く');
    }
    if (normalizeNumber(number) === normalizeNumber(SAMPLE_ISDN_NUMBER)) {
      warnings.push('issued.number がテンプレートのサンプル番号のままである．発行された番号へ差し替える');
    }
  } else if (context.barcodeExists) {
    warnings.push('バーコード画像があるのに issued.number が無い．発行された番号を記入する');
  }
  if (context.barcodeExists && context.barcodeIsSample === true) {
    warnings.push('バーコード画像がテンプレートのダミーのままである．運営から受領した画像へ差し替える');
  }
  /* C コード・価格は裏表紙の情報ブロックへ流し込むため，形式崩れを警告で知らせる */
  const application =
    data.application && typeof data.application === 'object' ? data.application : {};
  const cCode = application.c_code;
  if (isNonEmptyString(cCode) || typeof cCode === 'number') {
    warnings.push(...validateCCode(cCode));
  }
  const price = application.price;
  if (isNonEmptyString(price) || typeof price === 'number') {
    warnings.push(...validatePrice(price));
  }
  return { errors, warnings };
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const root = new URL('..', import.meta.url);
  const isdnPath = fileURLToPath(new URL('config/isdn.yaml', root));
  if (!fs.existsSync(isdnPath)) {
    console.warn('警告 config/isdn.yaml が存在しないため ISDN の検査を省略する');
    process.exit(0);
  }
  const data = parse(fs.readFileSync(isdnPath, 'utf-8'));
  const barcodePath = isNonEmptyString(data?.issued?.barcode)
    ? data.issued.barcode
    : DEFAULT_BARCODE_PATH;
  const barcodeFileUrl = new URL(barcodePath, root);
  const barcodeExists = isRegularFile(fileURLToPath(barcodeFileUrl));
  const barcodeIsSample = barcodeExists && isSampleBarcode(fileURLToPath(barcodeFileUrl));
  const { errors, warnings } = validateIsdn(data, { barcodeExists, barcodeIsSample });
  for (const warning of warnings) {
    console.warn(`警告 ${warning}`);
  }
  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`NG ${error}`);
    }
    console.error(`ISDN の検査で ${errors.length} 件のエラーがある`);
    process.exit(1);
  }
  console.log('ok ISDN（config/isdn.yaml）の検査に合格した');
}
