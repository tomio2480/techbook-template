#!/usr/bin/env node
/**
 * 紙入稿用 PDF（dist/book-print.pdf）のビルド
 *
 * 電子書籍用の `npm run build` と同じ行番号付与を経たうえで，
 * 紙面の面付け（改丁と綴じ単位への調整）を施した PDF を作る。
 *
 * ビルドは 3 パスで進める。
 * 1. 組版パス: Markdown から HTML を生成する。
 * 2. 測定パス: 改丁を外した状態で組み，各原稿のページ数を実測する。
 *    実測には print-measure.css の目印と，PDF からのテキスト抽出を使う。
 * 3. 本番パス: 実測値から MEMO ページの位置と枚数を決めて組み直す。
 *
 * 改丁で空くページを白紙のままにできないため，この段取りを採る。
 * Vivliostyle は改ページで生じた白ページへ何も描画せず，@page :blank も
 * 効かない（v2.39.0 で確認）。詳細は docs/notes を参照。
 *
 * 要求・要件は docs/spec/print-layout.md を参照。
 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { parse } from 'yaml';

import { countPdfPagesFile } from './count-pdf-pages.mjs';
import {
  MEMO_FILE_PREFIX,
  PAGE_SEPARATOR,
  TAB_STYLESHEET_FILE,
  extractChapterLabel,
  hasChapterOpening,
  injectTabClass,
  injectTabMark,
  parseDocumentStartPages,
  planPrintLayout,
  renderMemoHtml,
  renderTabMark,
  renderTabStylesheet,
  resolveFillerBefore,
  resolvePageMultiple,
  resolveSectionSides,
  toDocumentPageCounts,
} from './print-layout.mjs';
import { verifyNoIndexHtml, verifyConfigUsesMarkdown } from './verify-build.mjs';
import { tagPdf } from './tag-pdf.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, '..');

const PRINT_PDF_NAME = 'book-print.pdf';
const PRINT_CONFIG = 'vivliostyle.print.config.js';
const PRINT_STYLE = path.join('config', 'themes', 'techbook', 'print.css');
const MEASURE_STYLE = path.join('config', 'themes', 'techbook', 'print-measure.css');
const PLAN_FILE = path.join('dist', '.print-plan.json');
const BUILD_MARKER = path.join('dist', '.build-marker');
const CHAPTERS_DIR = path.join('src', 'chapters');
const TAB_STYLESHEET = path.join('config', 'themes', 'techbook', TAB_STYLESHEET_FILE);
/* ビルド前に走らせる機械検査。npm run build と同じ内容を同じ順で実行する */
const CHECK_SCRIPTS = ['check-errata.mjs', 'check-isdn.mjs', 'check-preface-errata.mjs'];
/* npx を介さず CLI のエントリポイントを node で直接起動する（tag-pdf.mjs と同じ方針） */
const VIVLIOSTYLE_CLI = path.join('node_modules', '@vivliostyle', 'cli', 'dist', 'cli.js');
const OPENDATALOADER_CLI = path.join('node_modules', '@opendataloader', 'pdf', 'dist', 'cli.js');

function run(command, args, { env = {}, capture = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    encoding: 'utf-8',
    env: { ...process.env, ...env },
  });

  const label = path.relative(repoRoot, args[0]);
  if (result.error) {
    throw new Error(`${label} を起動できませんでした: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${label} が失敗しました（exit code: ${result.status}）。`);
  }
  return result.stdout;
}

function runScript(scriptName, args = []) {
  run(process.execPath, [path.join(__dirname, scriptName), ...args]);
}

function buildPdf({ style, planPath }) {
  run(
    process.execPath,
    [
      path.join(repoRoot, VIVLIOSTYLE_CLI),
      'build',
      '-c',
      PRINT_CONFIG,
      '--style',
      path.join(repoRoot, style),
    ],
    { env: planPath ? { PRINT_PLAN: planPath } : {} }
  );
}

/* PDF からページ区切り付きのテキストを取り出す。目印は余白ボックスにあるため
   ヘッダー・フッターも抽出対象へ含める */
function extractTextWithPageMarks(pdfPath) {
  return run(
    process.execPath,
    [
      path.join(repoRoot, OPENDATALOADER_CLI),
      '--format',
      'text',
      '--text-page-separator',
      PAGE_SEPARATOR,
      '--include-header-footer',
      '--to-stdout',
      '--quiet',
      pdfPath,
    ],
    { capture: true }
  );
}

/* ビルドが途中で止まった PDF を成果物と誤認しないための検査。
   マーカーは行番号付与（add-line-numbers.mjs）が組版パスの後に書き込む */
export function verifyPdfNewerThanMarker(repoRoot_, pdfFileName) {
  const markerPath = path.join(repoRoot_, BUILD_MARKER);
  const pdfPath = path.join(repoRoot_, 'dist', pdfFileName);

  if (!fs.existsSync(pdfPath)) {
    return { ok: false, message: `dist/${pdfFileName} が見つかりません。` };
  }
  if (!fs.existsSync(markerPath)) {
    return { ok: false, message: 'dist/.build-marker が見つかりません。' };
  }
  /* mtime の分解能が粗い環境での偽陽性を避け、明確に古い場合のみ失敗とする */
  if (fs.statSync(pdfPath).mtimeMs < fs.statSync(markerPath).mtimeMs) {
    return {
      ok: false,
      message: `dist/${pdfFileName} が dist/.build-marker より新しくありません。ビルドが中断された可能性があります。`,
    };
  }
  return { ok: true };
}

/* 実測から求めた総ページ数と、組み上がった PDF のページ数を突き合わせる。
   食い違いは改丁の指定（print.css と book.yaml）のずれを示す */
export function verifyPlannedPageCount(actualPages, plannedPages) {
  if (actualPages !== plannedPages) {
    return {
      ok: false,
      message:
        `総ページ数が想定と異なります（実際 ${actualPages}・想定 ${plannedPages}）。` +
        'config/book.yaml の print.section_start と print.css の改丁指定が食い違っている可能性があります。',
    };
  }
  return { ok: true };
}

export function verifyPageMultiple(pageCount, pageMultiple) {
  if (pageCount % pageMultiple !== 0) {
    return {
      ok: false,
      message: `総ページ数 ${pageCount} が ${pageMultiple} の倍数になりませんでした。`,
    };
  }
  return { ok: true };
}

/* 測定パスの PDF から、各原稿が何ページになるかを読み取る */
function measurePageCounts(pdfPath, entries) {
  const totalPages = countPdfPagesFile(pdfPath);
  const startPages = parseDocumentStartPages(extractTextWithPageMarks(pdfPath));

  if (startPages.length !== entries.length) {
    throw new Error(
      `測定パスで読み取った原稿の数（${startPages.length}）がエントリの数（${entries.length}）と一致しません。`
    );
  }

  return toDocumentPageCounts(startPages, totalPages);
}

/* 小口のつめを仕込む。章の順序を生成 HTML のクラスで示し、位置を決める CSS を
   書き出し、章番号と章タイトルを各章の HTML へ入れる。
   つめは流し込みから外れるため、面付けの計画（ページ数）へは影響しない */
function applyChapterTabs(entries, sources) {
  const chapters = entries.filter((entry, index) => hasChapterOpening(sources[index]));

  fs.writeFileSync(
    path.join(repoRoot, TAB_STYLESHEET),
    renderTabStylesheet(chapters.length),
    'utf-8'
  );

  chapters.forEach((entry, index) => {
    const filePath = path.join(repoRoot, entry);
    const html = fs.readFileSync(filePath, 'utf-8');
    const marked = injectTabMark(html, renderTabMark(extractChapterLabel(html)));
    fs.writeFileSync(filePath, injectTabClass(marked, index + 1), 'utf-8');
  });

  return chapters.length;
}

function writeMemoDocuments(memoDocuments) {
  for (const memo of memoDocuments) {
    fs.writeFileSync(
      path.join(repoRoot, CHAPTERS_DIR, memo.fileName),
      renderMemoHtml(memo.pages),
      'utf-8'
    );
  }
}

function removeMemoDocuments() {
  for (const file of fs.readdirSync(path.join(repoRoot, CHAPTERS_DIR))) {
    if (file.startsWith(MEMO_FILE_PREFIX)) {
      fs.rmSync(path.join(repoRoot, CHAPTERS_DIR, file), { force: true });
    }
  }
}

/* 行番号付与より後に読み込み、.html へ差し替わったエントリを受け取る。
   このスクリプトの中で設定を読むのはここだけであり、
   モジュールキャッシュへ古い内容が載ることはない */
async function loadPrintEntries() {
  const configUrl = pathToFileURL(path.join(repoRoot, 'vivliostyle.config.js'));
  const { default: config } = await import(configUrl.href);
  return config.entry;
}

async function main() {
  const bookYaml =
    parse(fs.readFileSync(path.join(repoRoot, 'config', 'book.yaml'), 'utf-8')) ?? {};
  const pageMultiple = resolvePageMultiple(bookYaml);
  const sides = resolveSectionSides(bookYaml);
  const fillerBefore = resolveFillerBefore(bookYaml);
  const pdfPath = path.join(repoRoot, 'dist', PRINT_PDF_NAME);
  const planPath = path.join(repoRoot, PLAN_FILE);

  for (const script of CHECK_SCRIPTS) {
    runScript(script);
  }

  let plan;
  try {
    /* つめの位置を決める CSS は print.css から読み込まれる。
       組版パスの前に，章がまだ確定していない状態の中身で用意しておく */
    fs.writeFileSync(path.join(repoRoot, TAB_STYLESHEET), renderTabStylesheet(0), 'utf-8');

    /* 組版パス: Markdown から HTML を生成する */
    buildPdf({ style: PRINT_STYLE });
    /* 生成 HTML へ行番号を入れ、設定を HTML 参照へ切り替える */
    runScript('add-line-numbers.mjs');

    /* 測定パス: 改丁を外して各原稿のページ数を実測する */
    buildPdf({ style: MEASURE_STYLE });
    const entries = await loadPrintEntries();
    const sources = entries.map(entry => fs.readFileSync(path.join(repoRoot, entry), 'utf-8'));
    const pageCounts = measurePageCounts(pdfPath, entries);

    plan = planPrintLayout({
      entries,
      pageCounts,
      sources,
      sides,
      pageMultiple,
      fillerBefore,
    });
    console.log(
      `MEMO ページを ${plan.memoDocuments.length} 箇所（計 ` +
        `${plan.memoDocuments.reduce((sum, memo) => sum + memo.pages, 0)} ページ）挿入します。`
    );

    /* 本番パス: MEMO ページと小口のつめを入れて組み直す */
    writeMemoDocuments(plan.memoDocuments);
    console.log(`小口のつめを ${applyChapterTabs(entries, sources)} 章分入れます。`);
    fs.writeFileSync(planPath, JSON.stringify(plan, null, 2), 'utf-8');
    buildPdf({ style: PRINT_STYLE, planPath });
  } finally {
    /* 設定と一時ファイルは、途中で失敗した場合も必ず元へ戻す */
    runScript('add-line-numbers.mjs', ['--restore']);
    removeMemoDocuments();
    fs.rmSync(planPath, { force: true });
  }

  const pageCount = countPdfPagesFile(pdfPath);
  const failures = [
    verifyNoIndexHtml(repoRoot),
    verifyConfigUsesMarkdown(repoRoot),
    verifyPdfNewerThanMarker(repoRoot, PRINT_PDF_NAME),
    verifyPlannedPageCount(pageCount, plan.totalPages),
    verifyPageMultiple(pageCount, pageMultiple),
  ].filter(result => !result.ok);

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`検証失敗: ${failure.message}`);
    }
    process.exit(1);
  }

  fs.rmSync(path.join(repoRoot, BUILD_MARKER), { force: true });

  const tagged = tagPdf(repoRoot, { pdfFileName: PRINT_PDF_NAME });
  if (!tagged.ok) {
    console.error(`タグ付き PDF 生成に失敗しました: ${tagged.message}`);
    process.exit(1);
  }

  console.log(`紙入稿用 PDF を出力しました（dist/${PRINT_PDF_NAME}・全 ${pageCount} ページ）。`);
  process.exit(0);
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main().catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}
