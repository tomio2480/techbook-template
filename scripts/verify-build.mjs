#!/usr/bin/env node
/**
 * ビルド中断フェイルセーフ検証スクリプト
 *
 * npm run build の最終ステップとして実行し、以下を検証する。
 * (a) リポジトリルートに index.html が残っていないこと
 * (b) dist/book.pdf の mtime が dist/.build-marker の mtime より新しいこと
 * (c) vivliostyle.config.js の entry 配列が .md ファイルを参照していること
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function verifyNoIndexHtml(repoRoot) {
  const indexPath = path.join(repoRoot, 'index.html');
  if (fs.existsSync(indexPath)) {
    return {
      ok: false,
      message: 'index.html がリポジトリルートに残っています。ビルドが中断された可能性があります。',
    };
  }
  return { ok: true };
}

export function verifyPdfNewerThanMarker(repoRoot) {
  const markerPath = path.join(repoRoot, 'dist', '.build-marker');
  const pdfPath = path.join(repoRoot, 'dist', 'book.pdf');

  if (!fs.existsSync(markerPath)) {
    return {
      ok: false,
      message: 'dist/.build-marker が見つかりません。ビルドが正しく完了していない可能性があります。',
    };
  }
  if (!fs.existsSync(pdfPath)) {
    return {
      ok: false,
      message: 'dist/book.pdf が見つかりません。ビルドが正しく完了していない可能性があります。',
    };
  }

  const markerMtime = fs.statSync(markerPath).mtimeMs;
  const pdfMtime = fs.statSync(pdfPath).mtimeMs;
  // mtime 分解能が粗い環境（1秒単位のファイルシステム等）での偽陽性を
  // 避けるため、同時刻は許容し、明確に古い場合のみ失敗とする
  if (pdfMtime < markerMtime) {
    return {
      ok: false,
      message: 'dist/book.pdf が dist/.build-marker より新しくありません。ビルドが中断された可能性があります。',
    };
  }
  return { ok: true };
}

export function verifyConfigUsesMarkdown(repoRoot) {
  const configPath = path.join(repoRoot, 'vivliostyle.config.js');
  if (!fs.existsSync(configPath)) {
    return {
      ok: false,
      message: 'vivliostyle.config.js が見つかりません。',
    };
  }
  const config = fs.readFileSync(configPath, 'utf-8');

  const entryMatch = config.match(/entry:\s*\[([\s\S]*?)\]/);
  if (!entryMatch) {
    return {
      ok: false,
      message: 'vivliostyle.config.js から entry 配列を読み取れませんでした。',
    };
  }

  // コメントアウトされた行（例: // 'old.html' や /* ... */）は判定対象から除外する。
  // toc.html は常に生の HTML として参照される正当なエントリのため対象から除外する
  const entryBlock = entryMatch[1]
    .replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '')
    .replace(/src\/chapters\/toc\.html/g, '');
  if (/\.html['"`]/.test(entryBlock)) {
    return {
      ok: false,
      message: 'vivliostyle.config.js の entry 配列が .html ファイルを参照しています。restore 処理が正しく完了していない可能性があります。',
    };
  }
  return { ok: true };
}

export function runVerifications(repoRoot) {
  return [
    verifyNoIndexHtml(repoRoot),
    verifyPdfNewerThanMarker(repoRoot),
    verifyConfigUsesMarkdown(repoRoot),
  ];
}

function main() {
  const repoRoot = path.join(__dirname, '..');
  const results = runVerifications(repoRoot);
  const failures = results.filter(r => !r.ok);

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`検証失敗: ${failure.message}`);
    }
    process.exit(1);
  }

  const markerPath = path.join(repoRoot, 'dist', '.build-marker');
  if (fs.existsSync(markerPath)) {
    fs.unlinkSync(markerPath);
  }
  console.log('ビルド検証に成功しました。');
  process.exit(0);
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main();
}
