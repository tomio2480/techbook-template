import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeVerapdfReport } from './summarize-verapdf.mjs';

/* veraPDF 1.30.2 の JSON レポート（--format json）の実物構造に合わせた
   最小の雛形を組み立てる．実物は report.jobs[].validationResult[] の
   入れ子で，details にルール・チェックの集計と ruleSummaries を持つ */
const buildRule = (overrides = {}) => ({
  ruleStatus: 'FAILED',
  specification: 'ISO 14289-1:2014',
  clause: '7.1',
  testNumber: 8,
  status: 'failed',
  failedChecks: 1,
  description: 'The Catalog dictionary shall contain the ViewerPreferences.',
  object: 'PDCatalog',
  test: 'true',
  ...overrides,
});

const buildReport = ({ compliant = false, ruleSummaries = [buildRule()], name = 'C:\\work\\dist\\book.pdf' } = {}) => ({
  report: {
    buildInformation: {},
    jobs: [
      {
        itemDetails: { name, size: 1387353 },
        validationResult: [
          {
            details: {
              passedRules: 100,
              failedRules: ruleSummaries.length,
              passedChecks: 76773,
              failedChecks: ruleSummaries.reduce((sum, rule) => sum + rule.failedChecks, 0),
              ruleSummaries,
            },
            jobEndStatus: 'normal',
            profileName: 'PDF/UA-1 validation profile',
            statement: 'PDF file is not compliant with Validation Profile requirements.',
            compliant,
          },
        ],
        processingTime: {},
      },
    ],
    batchSummary: {},
  },
});

// --- 正常系 ---

test('summarizeVerapdfReport: 非準拠レポートは要点と失敗ルール表を出す', () => {
  const markdown = summarizeVerapdfReport(buildReport());
  assert.match(markdown, /準拠: いいえ/);
  assert.match(markdown, /PDF\/UA-1 validation profile/);
  assert.match(markdown, /合格 100 ／ 失敗 1/);
  assert.match(markdown, /合格 76773 ／ 失敗 1/);
  assert.match(markdown, /\| 7\.1 \| 8 \| 1 \|/);
});

test('summarizeVerapdfReport: 準拠レポートは表を出さない', () => {
  const markdown = summarizeVerapdfReport(buildReport({ compliant: true, ruleSummaries: [] }));
  assert.match(markdown, /準拠: はい/);
  assert.doesNotMatch(markdown, /\| 条項 \|/);
});

test('summarizeVerapdfReport: 対象はパスでなくファイル名だけを出す', () => {
  const markdown = summarizeVerapdfReport(buildReport({ name: '/home/runner/work/repo/repo/dist/book.pdf' }));
  assert.match(markdown, /対象: book\.pdf/);
  assert.doesNotMatch(markdown, /home\/runner/);
});

test('summarizeVerapdfReport: 失敗ルールは失敗数の多い順に並ぶ', () => {
  const markdown = summarizeVerapdfReport(
    buildReport({
      ruleSummaries: [
        buildRule({ clause: '7.1', failedChecks: 1 }),
        buildRule({ clause: '7.18.5', failedChecks: 176 }),
      ],
    })
  );
  const first = markdown.indexOf('| 7.18.5 |');
  const second = markdown.indexOf('| 7.1 |');
  assert.ok(first >= 0 && second >= 0 && first < second);
});

test('summarizeVerapdfReport: description の改行とパイプは表を壊さない', () => {
  const markdown = summarizeVerapdfReport(
    buildReport({
      ruleSummaries: [buildRule({ description: 'first line\nsecond | third' })],
    })
  );
  assert.match(markdown, /first line second \\\| third/);
});

test('summarizeVerapdfReport: 長い description は切り詰める', () => {
  const markdown = summarizeVerapdfReport(
    buildReport({ ruleSummaries: [buildRule({ description: 'a'.repeat(200) })] })
  );
  assert.doesNotMatch(markdown, /a{121}/);
  assert.match(markdown, /a{3}…/);
});

test('summarizeVerapdfReport: 表は上位 20 件で打ち切り残数を示す', () => {
  const ruleSummaries = Array.from({ length: 23 }, (_, index) =>
    buildRule({ clause: `9.${index}`, failedChecks: index + 1 })
  );
  const markdown = summarizeVerapdfReport(buildReport({ ruleSummaries }));
  const rowCount = (markdown.match(/^\| 9\./gm) ?? []).length;
  assert.equal(rowCount, 20);
  assert.match(markdown, /他 3 件/);
});

// --- 異常系 ---

test('summarizeVerapdfReport: report が無ければ理由を示して失敗する', () => {
  assert.throws(() => summarizeVerapdfReport({}), /report/);
});

test('summarizeVerapdfReport: jobs が空なら理由を示して失敗する', () => {
  assert.throws(
    () => summarizeVerapdfReport({ report: { jobs: [] } }),
    /jobs/
  );
});

test('summarizeVerapdfReport: validationResult が無ければ理由を示して失敗する', () => {
  const report = buildReport();
  delete report.report.jobs[0].validationResult;
  assert.throws(() => summarizeVerapdfReport(report), /validationResult/);
});

test('summarizeVerapdfReport: details の集計が数値でなければ失敗する', () => {
  const report = buildReport();
  report.report.jobs[0].validationResult[0].details.failedRules = 'six';
  assert.throws(() => summarizeVerapdfReport(report), /failedRules/);
});
