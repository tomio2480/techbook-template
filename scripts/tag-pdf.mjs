#!/usr/bin/env node
/**
 * ビルド後処理: dist/book.pdf にアクセシビリティタグを付与するスクリプト
 *
 * Vivliostyle CLI が生成する dist/book.pdf はタグ付き PDF（PDF/UA の
 * 下地となる Tagged PDF 構造）になっていない既知の不具合がある
 * （vivliostyle-cli#539）。OpenDataLoader PDF（@opendataloader/pdf,
 * Apache-2.0）の CLI を呼び出してタグを付与し、dist/book.pdf を
 * 上書きする。
 *
 * 上書きする理由: dist/book.pdf を単一の成果物として扱う既存パイプ
 * ライン（GitHub Actions の release ジョブ・verify-build.mjs）を
 * 変更せずに済ませるため。詳細は docs/spec/pdf-tagging.md を参照。
 *
 * OpenDataLoader PDF は Java 11 以上を要求するランタイム依存であり、
 * Java が見つからない環境では非 0 の exit code で終了する。
 *
 * CLI 呼び出しは npx ではなく node での直接実行とする。npx はパッケージ
 * 解決のオーバーヘッドがあり、Windows では npx.cmd 経由のため shell: true
 * が必要になる（引数エスケープの潜在リスクを伴う）。devDependencies に
 * 導入済みの cli.js を直接 node 実行すればどちらも回避できる。
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawnSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// opendataloader-pdf は --output-dir に `{拡張子を除いた入力ファイル名}_tagged.pdf`
// という名前でタグ付き PDF を書き出す（実行結果で確認済み。ドキュメント上の
// 明記はないため、@opendataloader/pdf のバージョンアップ時は要再確認）。
export function resolveTaggedPdfPath(outputDir, inputPdfPath) {
  const ext = path.extname(inputPdfPath);
  const baseName = path.basename(inputPdfPath, ext);
  return path.join(outputDir, `${baseName}_tagged${ext}`);
}

export function buildTaggingArgs(inputPdfPath, outputDir) {
  return ['--format', 'tagged-pdf', '--output-dir', outputDir, inputPdfPath];
}

// devDependencies に導入済みの @opendataloader/pdf の CLI エントリポイントを
// node で直接実行する。npx 経由（毎回のパッケージ解決オーバーヘッドがあり、
// Windows では npx が npx.cmd のため shell: true が必要になる）より高速かつ
// 安全である。
function resolveCliPath(repoRoot) {
  return path.join(repoRoot, 'node_modules', '@opendataloader', 'pdf', 'dist', 'cli.js');
}

function defaultRunCommand(cliPath, args) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function tagPdf(repoRoot, { runCommand } = {}) {
  const distDir = path.join(repoRoot, 'dist');
  const inputPdfPath = path.join(distDir, 'book.pdf');

  if (!fs.existsSync(inputPdfPath)) {
    return {
      ok: false,
      message: 'dist/book.pdf が見つかりません。タグ付けの前にビルドを完了させてください。',
    };
  }

  const cliPath = resolveCliPath(repoRoot);
  if (!runCommand && !fs.existsSync(cliPath)) {
    return {
      ok: false,
      message: '@opendataloader/pdf がインストールされていません。npm install を実行してください。',
    };
  }
  const runner = runCommand || (args => defaultRunCommand(cliPath, args));

  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opendataloader-pdf-'));
  try {
    const args = buildTaggingArgs(inputPdfPath, outputDir);
    const result = runner(args);

    if (result.error) {
      return {
        ok: false,
        message: `opendataloader-pdf を起動できませんでした: ${result.error.message}`,
      };
    }

    if (result.status !== 0) {
      const detail = result.stderr ? result.stderr.trim() : '';
      return {
        ok: false,
        message: `opendataloader-pdf の実行に失敗しました（exit code: ${result.status}）。${detail}`.trim(),
      };
    }

    const taggedPdfPath = resolveTaggedPdfPath(outputDir, inputPdfPath);
    if (!fs.existsSync(taggedPdfPath)) {
      return {
        ok: false,
        message: `タグ付き PDF が生成されませんでした: ${taggedPdfPath}`,
      };
    }

    fs.copyFileSync(taggedPdfPath, inputPdfPath);
    return { ok: true };
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
}

function main() {
  const repoRoot = path.join(__dirname, '..');
  const result = tagPdf(repoRoot);
  if (!result.ok) {
    console.error(`タグ付き PDF 生成に失敗しました: ${result.message}`);
    process.exit(1);
  }
  console.log('dist/book.pdf にアクセシビリティタグを付与しました。');
  process.exit(0);
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main();
}
