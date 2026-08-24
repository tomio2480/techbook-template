#!/usr/bin/env node
/**
 * 表紙単体の入稿データ（dist/cover.pdf・dist/back-cover.pdf）のビルド
 *
 * 多くの印刷所は表 1 と表 4 を本文と別のデータで受け取る。
 * 本文 PDF から表紙を外す指定（config/book.yaml の print.cover.include）は
 * 本文側の話であり、表紙そのものを渡す手立てにはならない。
 *
 * 表紙 1 枚だけを組み、紙入稿用の本文と同じ寸法（塗り足し込み）で出力する。
 * 背幅は加えない。表 1 と表 4 を別ファイルにすると、印刷所が背幅を
 * 両者から半分ずつ取るためである。
 *
 * 要求・要件は docs/spec/cover.md を参照。
 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { parse } from 'yaml';

import { countPdfPages, decodeObjectStreams } from './count-pdf-pages.mjs';
import { verifyNoIndexHtml } from './verify-build.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, '..');

const COVER_CONFIG = 'vivliostyle.cover.config.js';
/* 塗り足しの寸法は紙入稿用のスタイルが単一の出所である。表紙のためだけに
   同じ値を書き写さず、組むときも検査するときもこのファイルから取る */
const COVER_STYLE = path.join('config', 'themes', 'techbook', 'print.css');
const VIVLIOSTYLE_CLI = path.join('node_modules', '@vivliostyle', 'cli', 'dist', 'cli.js');
const OPENDATALOADER_CLI = path.join('node_modules', '@opendataloader', 'pdf', 'dist', 'cli.js');
/* 裏表紙はバーコードを載せるため、入稿前に ISDN の設定を検査する */
const CHECK_SCRIPTS = ['check-isdn.mjs'];

/* 書き出す対象。key は環境変数 COVER_TARGET が取る値であり、
   出力先の名前は原稿名と対応させる。表 1・表 4 は入稿の文脈での呼び方であり、
   人へ示す文言にだけ使う */
export const COVER_TARGETS = [
  {
    key: 'cover',
    entry: 'src/chapters/cover.md',
    output: 'dist/cover.pdf',
    label: '表 1（表紙）',
  },
  {
    key: 'back-cover',
    entry: 'src/chapters/back-cover.md',
    output: 'dist/back-cover.pdf',
    label: '表 4（裏表紙）',
  },
];

/* 寸法の許容差。Vivliostyle は小数の丸めで 0.1 mm ほどずれる */
export const BOX_TOLERANCE_MM = 0.5;

const POINTS_PER_INCH = 72;
const MM_PER_INCH = 25.4;

/* 塗り足しの量の宣言。単位はミリメートルに限る。紙入稿用のスタイルが
   ミリメートルで書いており、他の単位を許すと入稿の指定と突き合わせにくい */
const BLEED_PATTERN = /--bleed:\s*([0-9]*\.?[0-9]+)mm/;

/* PDF の空白は NUL・水平タブ・改行・改ページ・復帰・空白の 6 種である。
   count-pdf-pages.mjs と同じ定義を使う */
const PDF_WHITESPACE = '\\x00\\t\\n\\f\\r ';
const BOX_PATTERN_SOURCE = `/%NAME%[${PDF_WHITESPACE}]*\\[([-0-9.${PDF_WHITESPACE}]+)\\]`;

export function resolveCoverTarget(key) {
  const target = COVER_TARGETS.find(candidate => candidate.key === key);
  if (target) return target;

  const keys = COVER_TARGETS.map(candidate => candidate.key).join('・');
  throw new Error(
    `書き出す対象を COVER_TARGET で指定してください（${keys} のいずれか。現在 ${key}）。`
  );
}

/* 紙入稿用のスタイルから塗り足しの量を読む。値を書き写すと、入稿先に合わせて
   --bleed を変えた本で検査だけが古い値のまま残る */
export function resolveBleedMm(cssText) {
  const match = cssText.match(BLEED_PATTERN);
  if (!match) {
    throw new Error(`${COVER_STYLE} から --bleed（ミリメートル）を読み取れませんでした。`);
  }

  const bleed = Number(match[1]);
  if (!Number.isFinite(bleed) || bleed <= 0) {
    throw new Error(`${COVER_STYLE} の --bleed は 0 より大きい値で指定してください（現在 ${match[1]}mm）。`);
  }
  return bleed;
}

/* 誌面へ必ず現れる文字を，対象ごとに config/book.yaml から引く。
   表紙は書名と著者名をマーカーで流し込む（docs/spec/cover.md）。
   流し込みは値が無くても警告だけで進み，空文字へ置き換わる。
   入稿データが白紙のまま成功扱いになるのを防ぐため，ここで先に弾く。
   裏表紙の文言は執筆者が自由に書くため，決まった文字列を求めない */
export function resolveExpectedTexts(target, bookYaml) {
  if (target.key !== 'cover') return [];

  return ['title', 'author'].map(key => {
    const value = bookYaml?.[key];
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(
        `config/book.yaml の ${key} を空でない文字列で指定してください（${target.label}へ流し込みます）。`
      );
    }
    return value;
  });
}

/* 抽出した文字を突き合わせられる形へそろえる。
   PDF から取り出した漢字は康熙部首へ化けることがあり（「行」が U+2F8F），
   素の包含判定では原稿の文字列と一致しない。
   組版で入る改行と空白も，原稿の並びとは違う位置に来る */
export function normalizeExtractedText(text) {
  return text.normalize('NFKC').replace(/\s+/g, '');
}

/* 文字が画像にならず，実テキストのまま入っているかを見る（docs/spec/cover.md）。
   求める文字列を持たない対象でも，1 文字も取り出せなければ落とす */
export function verifyExtractedText(text, expected, label) {
  const normalized = normalizeExtractedText(text);
  if (normalized === '') {
    return {
      ok: false,
      message: `${label}の PDF から文字を抽出できませんでした。文字が画像になっている可能性があります。`,
    };
  }

  const missing = expected.filter(value => !normalized.includes(normalizeExtractedText(value)));
  if (missing.length > 0) {
    return {
      ok: false,
      message: `${label}の PDF に「${missing.join('」「')}」が見当たりません。`,
    };
  }

  return { ok: true };
}

export function verifySinglePage(pageCount, label) {
  if (pageCount === 1) return { ok: true };
  return {
    ok: false,
    message: `${label}が ${pageCount} ページになりました。表紙は 1 ページで組んでください。`,
  };
}

/* PDF から矩形の宣言を読む。同じ寸法のページは 1 つにまとめる。
   Vivliostyle はページ辞書を圧縮したオブジェクトストリーム（/ObjStm）へ入れる。
   平文だけを見ると矩形を 1 つも読めないため、展開した中身も併せて走査する */
export function readPdfBoxes(buffer) {
  const raw = buffer.toString('latin1');
  const text = `${raw}\n${decodeObjectStreams(raw, buffer)}`;
  const read = name => {
    const pattern = new RegExp(BOX_PATTERN_SOURCE.replace('%NAME%', name), 'g');
    const seen = new Map();
    for (const match of text.matchAll(pattern)) {
      const numbers = match[1].trim().split(/[\x00\t\n\f\r ]+/).map(Number);
      if (numbers.length !== 4 || numbers.some(Number.isNaN)) continue;
      const key = numbers.join(' ');
      if (!seen.has(key)) seen.set(key, numbers);
    }
    return [...seen.values()];
  };
  return { mediaBox: read('MediaBox'), trimBox: read('TrimBox') };
}

export function boxSizeMm(box) {
  const [x0, y0, x1, y1] = box;
  const toMm = points => (points / POINTS_PER_INCH) * MM_PER_INCH;
  return { width: toMm(x1 - x0), height: toMm(y1 - y0) };
}

/* 塗り足しは仕上がりの外側へ四方に付く。紙面（MediaBox）から仕上がり（TrimBox）
   までの隔たりを，四辺それぞれ量る。
   天地・左右の寸法差で量ると，仕上がりが紙面の中で寄っていても平均が合えば通る。
   片側 0 mm・反対側 6 mm の版が入稿へ届く。
   寸法そのものを想定値と突き合わせないのは，判型を変えた本でも同じ検査を
   使えるようにするためである */
export function verifyBleedSize(boxes, bleedMm, label) {
  for (const [name, list] of [
    ['MediaBox', boxes.mediaBox],
    ['TrimBox', boxes.trimBox],
  ]) {
    if (list.length === 0) {
      return { ok: false, message: `${label}の PDF から ${name} を読み取れませんでした。` };
    }
    if (list.length > 1) {
      return { ok: false, message: `${label}の PDF に寸法の違う ${name} が混ざっています。` };
    }
  }

  /* PDF の座標は左下が原点である。天は上端，地は下端に当たる */
  const [mediaLeft, mediaBottom, mediaRight, mediaTop] = boxes.mediaBox[0];
  const [trimLeft, trimBottom, trimRight, trimTop] = boxes.trimBox[0];
  const edges = [
    ['天', mediaTop - trimTop],
    ['地', trimBottom - mediaBottom],
    ['左', trimLeft - mediaLeft],
    ['右', mediaRight - trimRight],
  ].map(([name, points]) => [name, (points / POINTS_PER_INCH) * MM_PER_INCH]);

  const off = edges.filter(([, mm]) => Math.abs(mm - bleedMm) > BOX_TOLERANCE_MM);
  if (off.length > 0) {
    const actual = off.map(([name, mm]) => `${name} ${mm.toFixed(1)} mm`).join('・');
    return {
      ok: false,
      message: `${label}の塗り足しが ${actual} です（想定は四方 ${bleedMm} mm）。`,
    };
  }

  return { ok: true };
}

/* 表 1 と表 4 の仕上がり寸法をそろえる。食い違うと，印刷所が背幅を
   両者から半分ずつ取れない */
export function verifyTrimSizeMatch(measured) {
  const [first, ...rest] = measured;
  if (first === undefined) return { ok: true };

  for (const other of rest) {
    const off =
      Math.abs(other.size.width - first.size.width) > BOX_TOLERANCE_MM ||
      Math.abs(other.size.height - first.size.height) > BOX_TOLERANCE_MM;
    if (off) {
      return {
        ok: false,
        message:
          `${first.label}の仕上がりが ${first.size.width.toFixed(1)} x ` +
          `${first.size.height.toFixed(1)} mm，${other.label}が ` +
          `${other.size.width.toFixed(1)} x ${other.size.height.toFixed(1)} mm です。` +
          '表 1 と表 4 は同じ仕上がり寸法で組んでください。',
      };
    }
  }

  return { ok: true };
}

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

function runScript(scriptName) {
  run(process.execPath, [path.join(__dirname, scriptName)]);
}

function buildCoverPdf(target) {
  run(
    process.execPath,
    [
      path.join(repoRoot, VIVLIOSTYLE_CLI),
      'build',
      '-c',
      COVER_CONFIG,
      '--style',
      path.join(repoRoot, COVER_STYLE),
    ],
    { env: { COVER_TARGET: target.key } }
  );
}

/* PDF からテキストを取り出す。表紙の文字は余白ボックスへ置かれることがあるため
   ヘッダー・フッターも対象へ含める（scripts/build-print.mjs と同じ扱い） */
function extractPdfText(pdfPath) {
  return run(
    process.execPath,
    [
      path.join(repoRoot, OPENDATALOADER_CLI),
      '--format',
      'text',
      '--include-header-footer',
      '--to-stdout',
      '--quiet',
      pdfPath,
    ],
    { capture: true }
  );
}

/* 書き出した PDF を測り、検査の結果と仕上がり寸法を返す。
   寸法は表 1 と表 4 の突き合わせに使う */
function inspectCoverPdf(target, bleedMm, expectedTexts) {
  const pdfPath = path.join(repoRoot, target.output);
  if (!fs.existsSync(pdfPath)) {
    return {
      results: [
        { ok: false, message: `${target.label}の PDF が出力されていません（${target.output}）。` },
      ],
      measured: null,
    };
  }

  const buffer = fs.readFileSync(pdfPath);
  const boxes = readPdfBoxes(buffer);
  return {
    results: [
      verifySinglePage(countPdfPages(buffer), target.label),
      verifyBleedSize(boxes, bleedMm, target.label),
      verifyExtractedText(extractPdfText(pdfPath), expectedTexts, target.label),
    ],
    measured:
      boxes.trimBox.length === 1
        ? { label: target.label, size: boxSizeMm(boxes.trimBox[0]) }
        : null,
  };
}

async function main() {
  const bleedMm = resolveBleedMm(fs.readFileSync(path.join(repoRoot, COVER_STYLE), 'utf-8'));
  const bookYaml =
    parse(fs.readFileSync(path.join(repoRoot, 'config', 'book.yaml'), 'utf-8')) ?? {};
  /* 誌面へ求める文字は組む前にすべて解決する。設定の不足でやり直すとき，
     1 枚目を組む時間を無駄にしない */
  const expectations = new Map(
    COVER_TARGETS.map(target => [target.key, resolveExpectedTexts(target, bookYaml)])
  );

  for (const scriptName of CHECK_SCRIPTS) {
    runScript(scriptName);
  }

  const failures = [];
  const measured = [];
  for (const target of COVER_TARGETS) {
    buildCoverPdf(target);
    const inspected = inspectCoverPdf(target, bleedMm, expectations.get(target.key));
    failures.push(...inspected.results.filter(result => !result.ok));
    if (inspected.measured) measured.push(inspected.measured);
  }

  failures.push(
    ...[verifyTrimSizeMatch(measured), verifyNoIndexHtml(repoRoot)].filter(result => !result.ok)
  );

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`検証失敗: ${failure.message}`);
    }
    process.exit(1);
  }

  const outputs = COVER_TARGETS.map(target => `${target.label}: ${target.output}`).join('、');
  console.log(`表紙単体の入稿データを出力しました（塗り足し ${bleedMm} mm・${outputs}）。`);
  process.exit(0);
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main().catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}
