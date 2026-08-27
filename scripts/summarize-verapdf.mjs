#!/usr/bin/env node
/**
 * veraPDF JSON レポートの要約
 *
 * CI で実行した veraPDF（--format json）の検証レポートを読み，
 * GitHub Actions の job summary へ貼れる Markdown を標準出力へ書く
 * （Issue #189）．検証の合否はビルドを止めないため，本スクリプトは
 * 非準拠を成功として扱う．失敗させるのはレポート自体を読めないときに限る．
 *
 * 読む構造は veraPDF 1.30.2 の実出力から採った．
 * report.jobs[].validationResult[].details に集計と ruleSummaries が入る．
 * 構造が想定と異なる場合は，どこが違うかを示して例外を投げる．
 *
 * 外部依存は増やさない．
 */

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

/** 表に載せる失敗ルールの上限．超過分は件数だけ知らせる */
const MAX_RULE_ROWS = 20;

/** 表の内容列の上限文字数．超過分は省略記号で切り詰める */
const MAX_DESCRIPTION_LENGTH = 120;

/**
 * 構造の欠落を報告する．
 * @param {string} location 欠けていた場所
 * @returns {never} 常に例外を投げる
 */
function reportMalformed(location) {
  throw new Error(`veraPDF レポートの形式が想定と異なる: ${location}`);
}

/**
 * 集計値が数値であることを確かめて返す．
 * @param {object} details 集計の辞書
 * @param {string} key 集計の鍵
 * @returns {number} 集計値
 */
function readCount(details, key) {
  const value = details[key];
  if (typeof value !== 'number') {
    reportMalformed(`details.${key} が数値でない`);
  }
  return value;
}

/**
 * 表のセルに収まる 1 行へ整える．改行を空白に畳み，区切りを外し，
 * 長すぎる内容を切り詰める．
 * @param {string} text セルへ入れる文字列
 * @returns {string} 整えた文字列
 */
function toTableCell(text) {
  const singleLine = String(text).replace(/\r\n|[\r\n]/g, ' ').replace(/\|/g, '\\|');
  if (singleLine.length <= MAX_DESCRIPTION_LENGTH) {
    return singleLine;
  }
  return `${singleLine.slice(0, MAX_DESCRIPTION_LENGTH)}…`;
}

/**
 * 1 つの検証結果を Markdown の節へ整形する．
 * @param {string} fileName 検証対象のファイル名
 * @param {object} result validationResult の 1 要素
 * @returns {string} Markdown の節
 */
function formatValidationResult(fileName, result) {
  const details = result.details;
  if (!details || typeof details !== 'object') {
    reportMalformed('validationResult.details が無い');
  }
  const passedRules = readCount(details, 'passedRules');
  const failedRules = readCount(details, 'failedRules');
  const passedChecks = readCount(details, 'passedChecks');
  const failedChecks = readCount(details, 'failedChecks');
  const ruleSummaries = Array.isArray(details.ruleSummaries) ? details.ruleSummaries : [];

  const lines = [
    `- 対象: ${fileName}`,
    `- プロファイル: ${result.profileName ?? '(不明)'}`,
    `- 準拠: ${result.compliant ? 'はい' : 'いいえ'}`,
    `- ルール: 合格 ${passedRules} ／ 失敗 ${failedRules}`,
    `- チェック: 合格 ${passedChecks} ／ 失敗 ${failedChecks}`,
  ];

  if (ruleSummaries.length > 0) {
    const sorted = [...ruleSummaries].sort((a, b) => (b.failedChecks ?? 0) - (a.failedChecks ?? 0));
    const shown = sorted.slice(0, MAX_RULE_ROWS);
    lines.push('', '| 条項 | テスト | 失敗数 | 内容 |', '|---|---|---|---|');
    for (const rule of shown) {
      lines.push(
        `| ${toTableCell(rule.clause ?? '')} | ${toTableCell(rule.testNumber ?? '')} | ` +
          `${toTableCell(rule.failedChecks ?? '')} | ${toTableCell(rule.description ?? '')} |`
      );
    }
    if (sorted.length > shown.length) {
      lines.push('', `表示は上位 ${MAX_RULE_ROWS} 件．他 ${sorted.length - shown.length} 件は artifact のレポートを参照．`);
    }
  }

  return lines.join('\n');
}

/**
 * veraPDF の JSON レポートを job summary 用の Markdown へ要約する．
 * @param {object} reportRoot JSON レポート全体（パース済み）
 * @returns {string} Markdown
 */
export function summarizeVerapdfReport(reportRoot) {
  const report = reportRoot?.report;
  if (!report || typeof report !== 'object') {
    reportMalformed('report が無い');
  }
  const jobs = report.jobs;
  if (!Array.isArray(jobs) || jobs.length === 0) {
    reportMalformed('jobs が空');
  }

  const sections = ['## veraPDF 検証レポート'];
  for (const job of jobs) {
    /* CI ランナーの内部パスを晒さないため，表示はファイル名だけにする．
       Windows 区切りのパスも読めるよう両方の区切りで名前を切り出す */
    const rawName = job.itemDetails?.name ?? '(不明)';
    const fileName = rawName.split(/[\\/]/).pop() || rawName;
    const results = job.validationResult;
    if (!Array.isArray(results) || results.length === 0) {
      reportMalformed('validationResult が無い');
    }
    for (const result of results) {
      sections.push(formatValidationResult(fileName, result));
    }
  }
  return `${sections.join('\n\n')}\n`;
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const reportPath = process.argv[2];
  if (!reportPath) {
    console.error('使い方: node scripts/summarize-verapdf.mjs <verapdf-report.json>');
    process.exit(1);
  }
  if (!fs.existsSync(reportPath)) {
    console.error(`NG ${reportPath} が見つからない`);
    process.exit(1);
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  } catch (error) {
    console.error(`NG ${path.basename(reportPath)} を JSON として読めない: ${error.message}`);
    process.exit(1);
  }
  try {
    process.stdout.write(summarizeVerapdfReport(parsed));
  } catch (error) {
    console.error(`NG ${error.message}`);
    process.exit(1);
  }
}
