import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  resolveTaggedPdfPath,
  buildTaggingArgs,
  tagPdf,
} from './tag-pdf.mjs';

function makeTempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tag-pdf-test-'));
  fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
  return dir;
}

// --- resolveTaggedPdfPath ---

test('resolveTaggedPdfPath: 出力先ディレクトリと入力 PDF のベース名を結合する', () => {
  const result = resolveTaggedPdfPath('/tmp/out', '/repo/dist/book.pdf');
  assert.equal(result, path.join('/tmp/out', 'book.pdf'));
});

// --- buildTaggingArgs ---

test('buildTaggingArgs: --format tagged-pdf --output-dir と入力パスを含む', () => {
  const args = buildTaggingArgs('/repo/dist/book.pdf', '/tmp/out');
  assert.deepEqual(args, ['--format', 'tagged-pdf', '--output-dir', '/tmp/out', '/repo/dist/book.pdf']);
});

// --- tagPdf ---

test('tagPdf: dist/book.pdf が存在しなければ失敗する', () => {
  const dir = makeTempRepo();
  const result = tagPdf(dir, { runCommand: () => ({ status: 0 }) });
  assert.equal(result.ok, false);
  assert.match(result.message, /book\.pdf/);
});

test('tagPdf: コマンドが異常終了すれば失敗し stderr を含める', () => {
  const dir = makeTempRepo();
  fs.writeFileSync(path.join(dir, 'dist', 'book.pdf'), 'original', 'utf-8');
  const result = tagPdf(dir, {
    runCommand: () => ({ status: 1, stderr: 'java: command not found' }),
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /java: command not found/);
});

test('tagPdf: コマンドは成功したがタグ付き PDF が生成されていなければ失敗する', () => {
  const dir = makeTempRepo();
  fs.writeFileSync(path.join(dir, 'dist', 'book.pdf'), 'original', 'utf-8');
  const result = tagPdf(dir, { runCommand: () => ({ status: 0 }) });
  assert.equal(result.ok, false);
  assert.match(result.message, /生成されませんでした/);
});

test('tagPdf: 正常系では dist/book.pdf をタグ付き PDF の内容で上書きし、一時ディレクトリを掃除する', () => {
  const dir = makeTempRepo();
  const pdfPath = path.join(dir, 'dist', 'book.pdf');
  fs.writeFileSync(pdfPath, 'original', 'utf-8');

  let capturedOutputDir;
  const result = tagPdf(dir, {
    runCommand: args => {
      const outputDirIndex = args.indexOf('--output-dir');
      capturedOutputDir = args[outputDirIndex + 1];
      const taggedPath = resolveTaggedPdfPath(capturedOutputDir, pdfPath);
      fs.writeFileSync(taggedPath, 'tagged-content', 'utf-8');
      return { status: 0 };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(fs.readFileSync(pdfPath, 'utf-8'), 'tagged-content');
  assert.equal(fs.existsSync(capturedOutputDir), false);
});

test('tagPdf: コマンドに --format tagged-pdf を渡す', () => {
  const dir = makeTempRepo();
  const pdfPath = path.join(dir, 'dist', 'book.pdf');
  fs.writeFileSync(pdfPath, 'original', 'utf-8');

  let capturedArgs;
  tagPdf(dir, {
    runCommand: args => {
      capturedArgs = args;
      const outputDirIndex = args.indexOf('--output-dir');
      const outputDir = args[outputDirIndex + 1];
      fs.writeFileSync(resolveTaggedPdfPath(outputDir, pdfPath), 'tagged', 'utf-8');
      return { status: 0 };
    },
  });

  assert.equal(capturedArgs[0], '--format');
  assert.equal(capturedArgs[1], 'tagged-pdf');
  assert.equal(capturedArgs[4], pdfPath);
});
