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
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawnSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// opendataloader-pdf は --output-dir に、入力ファイルと同じベース名で
// タグ付き PDF を書き出す
export function resolveTaggedPdfPath(outputDir, inputPdfPath) {
  return path.join(outputDir, path.basename(inputPdfPath));
}

export function buildTaggingArgs(inputPdfPath, outputDir) {
  return ['--format', 'tagged-pdf', '--output-dir', outputDir, inputPdfPath];
}

function defaultRunCommand(args) {
  return spawnSync('npx', ['opendataloader-pdf', ...args], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function tagPdf(repoRoot, { runCommand = defaultRunCommand } = {}) {
  const distDir = path.join(repoRoot, 'dist');
  const inputPdfPath = path.join(distDir, 'book.pdf');

  if (!fs.existsSync(inputPdfPath)) {
    return {
      ok: false,
      message: 'dist/book.pdf が見つかりません。タグ付けの前にビルドを完了させてください。',
    };
  }

  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opendataloader-pdf-'));
  try {
    const args = buildTaggingArgs(inputPdfPath, outputDir);
    const result = runCommand(args);

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
