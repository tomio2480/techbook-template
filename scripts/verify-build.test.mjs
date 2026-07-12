import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  verifyNoIndexHtml,
  verifyPdfNewerThanMarker,
  verifyConfigUsesMarkdown,
  runVerifications,
} from './verify-build.mjs';

function makeTempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-build-test-'));
  fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
  return dir;
}

function writeConfig(dir, entryLines) {
  const content = `export default {\n  entry: [\n${entryLines.map(l => `    '${l}',`).join('\n')}\n  ],\n};\n`;
  fs.writeFileSync(path.join(dir, 'vivliostyle.config.js'), content, 'utf-8');
}

// --- verifyNoIndexHtml ---

test('verifyNoIndexHtml: index.html が存在しなければ成功する', () => {
  const dir = makeTempRepo();
  const result = verifyNoIndexHtml(dir);
  assert.equal(result.ok, true);
});

test('verifyNoIndexHtml: index.html が残っていれば失敗する', () => {
  const dir = makeTempRepo();
  fs.writeFileSync(path.join(dir, 'index.html'), '<html></html>', 'utf-8');
  const result = verifyNoIndexHtml(dir);
  assert.equal(result.ok, false);
  assert.match(result.message, /index\.html/);
});

// --- verifyPdfNewerThanMarker ---

test('verifyPdfNewerThanMarker: marker が存在しなければ失敗する', () => {
  const dir = makeTempRepo();
  fs.writeFileSync(path.join(dir, 'dist', 'book.pdf'), 'dummy', 'utf-8');
  const result = verifyPdfNewerThanMarker(dir);
  assert.equal(result.ok, false);
  assert.match(result.message, /build-marker/);
});

test('verifyPdfNewerThanMarker: pdf が存在しなければ失敗する', () => {
  const dir = makeTempRepo();
  fs.writeFileSync(path.join(dir, 'dist', '.build-marker'), new Date().toISOString(), 'utf-8');
  const result = verifyPdfNewerThanMarker(dir);
  assert.equal(result.ok, false);
  assert.match(result.message, /book\.pdf/);
});

test('verifyPdfNewerThanMarker: pdf が marker より古ければ失敗する', async () => {
  const dir = makeTempRepo();
  fs.writeFileSync(path.join(dir, 'dist', 'book.pdf'), 'dummy', 'utf-8');
  await new Promise(r => setTimeout(r, 20));
  fs.writeFileSync(path.join(dir, 'dist', '.build-marker'), new Date().toISOString(), 'utf-8');
  const result = verifyPdfNewerThanMarker(dir);
  assert.equal(result.ok, false);
});

test('verifyPdfNewerThanMarker: pdf が marker より新しければ成功する', async () => {
  const dir = makeTempRepo();
  fs.writeFileSync(path.join(dir, 'dist', '.build-marker'), new Date().toISOString(), 'utf-8');
  await new Promise(r => setTimeout(r, 20));
  fs.writeFileSync(path.join(dir, 'dist', 'book.pdf'), 'dummy', 'utf-8');
  const result = verifyPdfNewerThanMarker(dir);
  assert.equal(result.ok, true);
});

// --- verifyConfigUsesMarkdown ---

test('verifyConfigUsesMarkdown: entry が .md のみなら成功する', () => {
  const dir = makeTempRepo();
  writeConfig(dir, ['src/chapters/cover.md', 'src/chapters/toc.html', 'src/chapters/01-introduction.md']);
  const result = verifyConfigUsesMarkdown(dir);
  assert.equal(result.ok, true);
});

test('verifyConfigUsesMarkdown: entry に .html（toc.html 以外）が含まれれば失敗する', () => {
  const dir = makeTempRepo();
  writeConfig(dir, ['src/chapters/cover.html', 'src/chapters/toc.html']);
  const result = verifyConfigUsesMarkdown(dir);
  assert.equal(result.ok, false);
  assert.match(result.message, /entry/);
});

// --- runVerifications ---

test('runVerifications: すべて成功する場合は全件 ok になる', async () => {
  const dir = makeTempRepo();
  writeConfig(dir, ['src/chapters/cover.md', 'src/chapters/toc.html']);
  fs.writeFileSync(path.join(dir, 'dist', '.build-marker'), new Date().toISOString(), 'utf-8');
  await new Promise(r => setTimeout(r, 20));
  fs.writeFileSync(path.join(dir, 'dist', 'book.pdf'), 'dummy', 'utf-8');
  const results = runVerifications(dir);
  assert.equal(results.every(r => r.ok), true);
});

test('runVerifications: いずれかが失敗する場合は失敗を含む', () => {
  const dir = makeTempRepo();
  writeConfig(dir, ['src/chapters/cover.html']);
  const results = runVerifications(dir);
  assert.equal(results.some(r => !r.ok), true);
});
