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
import { verifyNoTransparencyFile } from './check-print-transparency.mjs';
import {
  MEMO_FILE_PATTERN,
  PAGE_SEPARATOR,
  TAB_STYLESHEET_FILE,
  injectHtmlClass,
  injectTabMark,
  isTabTarget,
  parseDocumentStartPages,
  planPrintLayout,
  renderMemoHtml,
  renderTabMark,
  renderTabStylesheet,
  resolveCoverInclude,
  resolveFillerBefore,
  resolvePageMultiple,
  resolveSectionSides,
  resolveSectionTabs,
  sideClassName,
  sideForEntry,
  tabClassName,
  tabLabelFor,
  toDocumentPageCounts,
} from './print-layout.mjs';
import { verifyNoIndexHtml, verifyConfigUsesMarkdown } from './verify-build.mjs';

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
const CHECK_SCRIPTS = [
  'check-errata.mjs',
  'check-isdn.mjs',
  'check-preface-errata.mjs',
  'check-index.mjs',
  /* 紙用に焼いた枠アイコンが theme.css と食い違っていないか。
     組版の前に見ておけば、4 分かかるビルドを走らせる前に気づける */
  'check-icon-bake.mjs',
];
/* 透明が見つかったときに並べる件数の上限。発生源は限られるため数件で足りる */
const TRANSPARENCY_REPORT_LIMIT = 10;
/* npx を介さず CLI のエントリポイントを node で直接起動する。
   npx はパッケージ解決のオーバーヘッドがあり、Windows では shell: true が要る */
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

/* 紙面用の目印を入れる前の中身を控える対象を選ぶ。
   entry の HTML は多くが Markdown から作り直されるが、目次（toc.html）のように
   Markdown を持たない原稿は手で書く追跡ファイルであり、書き換えたまま終わると
   作業ツリーが汚れる。ファイル名ではなく Markdown の有無で判定し、
   利用者が別の HTML を直接置いた場合も同じ扱いにする */
export function snapshotAuthoredDocuments(repoRoot_, entries) {
  return entries
    .filter(entry => !fs.existsSync(path.join(repoRoot_, entry.replace(/\.html$/i, '.md'))))
    .map(entry => ({
      entry,
      content: fs.readFileSync(path.join(repoRoot_, entry), 'utf-8'),
    }));
}

/* 控えた中身へ書き戻す。ビルドが途中で失敗した場合も後始末で必ず呼ぶ */
export function restoreAuthoredDocuments(repoRoot_, snapshots) {
  for (const { entry, content } of snapshots) {
    fs.writeFileSync(path.join(repoRoot_, entry), content, 'utf-8');
  }
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
   食い違いは、測定パスと本番パスで組版結果が変わったことを示す */
export function verifyPlannedPageCount(actualPages, plannedPages) {
  if (actualPages !== plannedPages) {
    return {
      ok: false,
      message:
        `総ページ数が想定と異なります（実際 ${actualPages}・想定 ${plannedPages}）。` +
        'テーマ CSS の改ページ指定を print-measure.css が打ち消せていない可能性があります。',
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

/* 生成 HTML へ紙面用の目印を入れる。
   (a) 区分の開始面。config/book.yaml の指定をクラスとして伝え，print.css が面へ翻訳する。
   (b) 小口のつめ。章の順序をクラスで示し，位置を決める CSS を書き出し，
       章番号と章タイトルを各章の HTML へ入れる。
       章扉を持たない区分は config/book.yaml の print.section_tabs で対象に加える。
       番号は扉があれば扉を優先し，無いときだけ指定値を使う。
   どちらも流し込みから外れるか体裁のみであり、面付けの計画（ページ数）へは影響しない */
function applyPrintMarkup(entries, sources, sides, sectionTabs = []) {
  const tabTargets = entries.filter((entry, index) =>
    isTabTarget(entry, sources[index], sectionTabs)
  );

  fs.writeFileSync(
    path.join(repoRoot, TAB_STYLESHEET),
    renderTabStylesheet(tabTargets.length),
    'utf-8'
  );

  entries.forEach((entry, index) => {
    const filePath = path.join(repoRoot, entry);
    const side = sideForEntry(entry, sources[index], sides);
    /* つめの高さはエントリ順で決まる。対象でない区分では 0 になる */
    const tabOrder = tabTargets.indexOf(entry) + 1;
    if (!side && tabOrder === 0) return;

    let html = fs.readFileSync(filePath, 'utf-8');
    if (side) {
      html = injectHtmlClass(html, sideClassName(side));
    }
    if (tabOrder > 0) {
      html = injectTabMark(html, renderTabMark(tabLabelFor(entry, html, sectionTabs)));
      html = injectHtmlClass(html, tabClassName(tabOrder));
    }
    fs.writeFileSync(filePath, html, 'utf-8');
  });

  return tabTargets.length;
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

/* 後始末はこのビルドが作る連番の HTML（print-memo-1.html など）だけを消す。
   前置きが同じだけの利用者のファイルを巻き込まないためである */
function removeMemoDocuments() {
  for (const file of fs.readdirSync(path.join(repoRoot, CHAPTERS_DIR))) {
    if (MEMO_FILE_PATTERN.test(file)) {
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
  const sectionTabs = resolveSectionTabs(bookYaml);
  const coverInclude = resolveCoverInclude(bookYaml);
  const pdfPath = path.join(repoRoot, 'dist', PRINT_PDF_NAME);
  const planPath = path.join(repoRoot, PLAN_FILE);

  for (const script of CHECK_SCRIPTS) {
    runScript(script);
  }

  let plan;
  let authoredDocuments = [];
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
      coverInclude,
    });
    if (!coverInclude) {
      console.log('表紙・裏表紙を本文 PDF から外します（print.cover.include: false）。');
    }
    console.log(
      `MEMO ページを ${plan.memoDocuments.length} 箇所（計 ` +
        `${plan.memoDocuments.reduce((sum, memo) => sum + memo.pages, 0)} ページ）挿入します。`
    );

    /* 本番パス: MEMO ページと小口のつめを入れて組み直す */
    writeMemoDocuments(plan.memoDocuments);
    /* 目印を入れる直前の中身を控える。組版に要るのはこのビルドの間だけであり、
       追跡ファイルへ残すと作業ツリーが汚れる */
    authoredDocuments = snapshotAuthoredDocuments(repoRoot, entries);
    console.log(
      `小口のつめを ${applyPrintMarkup(entries, sources, sides, sectionTabs)} 区分に入れます。`
    );
    fs.writeFileSync(planPath, JSON.stringify(plan, null, 2), 'utf-8');
    buildPdf({ style: PRINT_STYLE, planPath });
  } finally {
    /* 設定と一時ファイルは、途中で失敗した場合も必ず元へ戻す */
    runScript('add-line-numbers.mjs', ['--restore']);
    restoreAuthoredDocuments(repoRoot, authoredDocuments);
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

  /* 透明効果の検査は、入稿へ渡る最終の PDF に対して行う */
  const transparency = verifyNoTransparencyFile(pdfPath);
  if (!transparency.ok) {
    for (const item of transparency.found.slice(0, TRANSPARENCY_REPORT_LIMIT)) {
      console.error(`検出: ${item.kind} ${item.context}`);
    }
    if (transparency.found.length > TRANSPARENCY_REPORT_LIMIT) {
      console.error(`ほか ${transparency.found.length - TRANSPARENCY_REPORT_LIMIT} 件`);
    }
    console.error(`検証失敗: ${transparency.message}`);
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
