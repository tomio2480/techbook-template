#!/usr/bin/env node
/**
 * errata/errata.yml（正誤表の原本）のスキーマ・整合性検査
 *
 * 版管理ルール（docs/spec/edition-errata.md）に基づき，以下を検査する．
 * - book 節: slug の形式・title の存在（book.yaml の title との不一致は警告）
 * - editions 節: 版番号の 1 起点連番・日付形式・release タグと版番号の整合
 * - 版番号と package.json の major の一致（editions が空なら major は 1）
 * - book.yaml の version と package.json の major の一致
 * - errata 節: 必須キー・applies_to / fixed_in と editions の参照整合
 */

import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { parse } from 'yaml';

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{2,62}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const RELEASE_PATTERN = /^v(\d+)\.\d+\.\d+$/;
const ERRATUM_REQUIRED_KEYS = ['page', 'location', 'wrong', 'correct', 'date', 'applies_to'];

/**
 * 値が空でない文字列かどうかを判定する．
 * @param {unknown} value
 * @returns {boolean}
 */
function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * 値が正の整数かどうかを判定する．
 * @param {unknown} value
 * @returns {boolean}
 */
function isPositiveInteger(value) {
  return Number.isInteger(value) && value >= 1;
}

/**
 * book 節を検査する．
 * @param {Record<string, unknown> | undefined} book
 * @param {{ bookYamlTitle?: string }} context
 * @param {string[]} errors
 * @param {string[]} warnings
 */
function validateBook(book, context, errors, warnings) {
  if (!book || typeof book !== 'object') {
    errors.push('book: 節がない．slug と title を持つ book 節が必要');
    return;
  }
  if (!isNonEmptyString(book.slug) || !SLUG_PATTERN.test(book.slug)) {
    errors.push('book.slug: 英小文字・数字・ハイフンのみ 3〜63 字で必須．リポジトリ名から推測できない名前にする');
  }
  if (!isNonEmptyString(book.title)) {
    errors.push('book.title: 公開表示用の書名が必須');
  } else if (context.bookYamlTitle !== undefined && book.title !== context.bookYamlTitle) {
    warnings.push(`book.title: config/book.yaml の title と一致しない（errata: "${book.title}" / book.yaml: "${context.bookYamlTitle}"）`);
  }
}

/**
 * editions 節を検査し，有効な版番号の集合を返す．
 * @param {unknown} editions
 * @param {string[]} errors
 * @returns {number[]} 版番号の一覧（editions が不正な場合は空）
 */
function validateEditions(editions, errors) {
  if (!Array.isArray(editions)) {
    errors.push('editions: 配列が必須（未出版なら空配列 [] とする）');
    return [];
  }
  const numbers = [];
  editions.forEach((entry, index) => {
    const label = `editions[${index}]`;
    if (!entry || typeof entry !== 'object') {
      errors.push(`${label}: edition・date・release を持つオブジェクトが必要`);
      return;
    }
    if (!isPositiveInteger(entry.edition)) {
      errors.push(`${label}.edition: 1 以上の整数が必須`);
    } else {
      numbers.push(entry.edition);
    }
    if (!isNonEmptyString(entry.date) || !DATE_PATTERN.test(entry.date)) {
      errors.push(`${label}.date: YYYY-MM-DD 形式の頒布日が必須`);
    }
    const releaseMatch = isNonEmptyString(entry.release) ? entry.release.match(RELEASE_PATTERN) : null;
    if (!releaseMatch) {
      errors.push(`${label}.release: vX.Y.Z 形式の Release タグが必須`);
    } else if (isPositiveInteger(entry.edition) && Number(releaseMatch[1]) !== entry.edition) {
      errors.push(`${label}.release: タグの major（${releaseMatch[1]}）が版番号（${entry.edition}）と一致しない`);
    }
  });
  const sorted = [...numbers].sort((a, b) => a - b);
  const isConsecutiveFromOne = sorted.every((n, i) => n === i + 1);
  if (numbers.length !== editions.length || !isConsecutiveFromOne) {
    errors.push('editions: 版番号は 1 から始まる連番でなければならない');
  }
  return numbers;
}

/**
 * 版番号と package.json / book.yaml の version の整合を検査する．
 * @param {number[]} editionNumbers
 * @param {{ packageMajor: number, bookYamlMajor?: number }} context
 * @param {string[]} errors
 */
function validateVersionConsistency(editionNumbers, context, errors) {
  const latest = editionNumbers.length > 0 ? Math.max(...editionNumbers) : null;
  if (latest !== null && latest !== context.packageMajor) {
    errors.push(`editions: 最新版番号（${latest}）が package.json の major（${context.packageMajor}）と一致しない`);
  }
  if (latest === null && context.packageMajor !== 1) {
    errors.push(`editions: 未出版（editions が空）の間は package.json の major は 1 でなければならない（現在 ${context.packageMajor}）`);
  }
  if (context.bookYamlMajor !== undefined && context.bookYamlMajor !== context.packageMajor) {
    errors.push(`config/book.yaml: version の major（${context.bookYamlMajor}）が package.json の major（${context.packageMajor}）と一致しない`);
  }
}

/**
 * errata 節を検査する．
 * @param {unknown} errata
 * @param {number[]} editionNumbers
 * @param {string[]} errors
 */
function validateErrataEntries(errata, editionNumbers, errors) {
  if (!Array.isArray(errata)) {
    errors.push('errata: 配列が必須（正誤がなければ空配列 [] とする）');
    return;
  }
  const editionSet = new Set(editionNumbers);
  errata.forEach((entry, index) => {
    const label = `errata[${index}]`;
    if (!entry || typeof entry !== 'object') {
      errors.push(`${label}: オブジェクトが必要`);
      return;
    }
    for (const key of ERRATUM_REQUIRED_KEYS) {
      if (entry[key] === undefined || entry[key] === null || entry[key] === '') {
        errors.push(`${label}.${key}: 必須キーが欠けている`);
      }
    }
    if (entry.page !== undefined && !isPositiveInteger(entry.page) && !isNonEmptyString(entry.page)) {
      errors.push(`${label}.page: 1 以上の整数または文字列（範囲表記など）が必要`);
    }
    if (isNonEmptyString(entry.date) && !DATE_PATTERN.test(entry.date)) {
      errors.push(`${label}.date: YYYY-MM-DD 形式が必要`);
    }
    if (entry.applies_to !== undefined) {
      if (!Array.isArray(entry.applies_to) || entry.applies_to.length === 0) {
        errors.push(`${label}.applies_to: 該当する版番号を 1 つ以上含む配列が必要`);
      } else if (!entry.applies_to.every((n) => editionSet.has(n))) {
        errors.push(`${label}.applies_to: editions に存在しない版番号を参照している`);
      }
    }
    if (entry.fixed_in !== undefined) {
      if (!editionSet.has(entry.fixed_in)) {
        errors.push(`${label}.fixed_in: editions に存在しない版番号を参照している`);
      } else if (Array.isArray(entry.applies_to) && entry.applies_to.length > 0
        && entry.fixed_in <= Math.max(...entry.applies_to)) {
        errors.push(`${label}.fixed_in: 修正を反映した版は applies_to の最大値より後でなければならない`);
      }
    }
  });
}

/**
 * 正誤表の原本データを検査する．
 * @param {Record<string, unknown>} data errata.yml をパースしたオブジェクト
 * @param {{ packageMajor: number, bookYamlMajor?: number, bookYamlTitle?: string }} context
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateErrata(data, context) {
  const errors = [];
  const warnings = [];
  if (!data || typeof data !== 'object') {
    errors.push('errata.yml: book・editions・errata を持つオブジェクトが必要');
    return { errors, warnings };
  }
  validateBook(data.book, context, errors, warnings);
  const editionNumbers = validateEditions(data.editions, errors);
  validateVersionConsistency(editionNumbers, context, errors);
  validateErrataEntries(data.errata, editionNumbers, errors);
  return { errors, warnings };
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const root = new URL('..', import.meta.url);
  const errataPath = fileURLToPath(new URL('errata/errata.yml', root));
  if (!fs.existsSync(errataPath)) {
    console.error('NG errata/errata.yml が存在しない．docs/spec/edition-errata.md を参照して作成する');
    process.exit(1);
  }
  const data = parse(fs.readFileSync(errataPath, 'utf-8'));
  const pkg = JSON.parse(fs.readFileSync(fileURLToPath(new URL('package.json', root)), 'utf-8'));
  const bookYaml = parse(fs.readFileSync(fileURLToPath(new URL('config/book.yaml', root)), 'utf-8'));
  const bookYamlVersion = typeof bookYaml?.version === 'string' ? bookYaml.version.match(/^(\d+)\./) : null;
  const context = {
    packageMajor: Number(pkg.version.split('.')[0]),
    bookYamlMajor: bookYamlVersion ? Number(bookYamlVersion[1]) : undefined,
    bookYamlTitle: typeof bookYaml?.title === 'string' ? bookYaml.title : undefined,
  };
  const { errors, warnings } = validateErrata(data, context);
  for (const warning of warnings) {
    console.warn(`警告 ${warning}`);
  }
  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`NG ${error}`);
    }
    console.error(`正誤表の検査で ${errors.length} 件のエラーがある`);
    process.exit(1);
  }
  console.log('ok 正誤表（errata/errata.yml）の検査に合格した');
}
