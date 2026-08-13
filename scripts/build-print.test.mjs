import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  verifyPageMultiple,
  verifyPdfNewerThanMarker,
  verifyPlannedPageCount,
} from './build-print.mjs';

const tempRepos = [];

after(() => {
  for (const dir of tempRepos) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-print-test-'));
  fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
  tempRepos.push(dir);
  return dir;
}

// --- verifyPageMultiple ---

test('verifyPageMultiple: 倍数へ揃っていれば成功する', () => {
  assert.equal(verifyPageMultiple(32, 4).ok, true);
});

test('verifyPageMultiple: 倍数へ揃っていなければページ数を添えて失敗する', () => {
  const result = verifyPageMultiple(30, 4);
  assert.equal(result.ok, false);
  assert.match(result.message, /30/);
});

// --- verifyPlannedPageCount ---

test('verifyPlannedPageCount: 実測と想定が一致すれば成功する', () => {
  assert.equal(verifyPlannedPageCount(32, 32).ok, true);
});

test('verifyPlannedPageCount: 食い違えば両方のページ数と原因の候補を示す', () => {
  const result = verifyPlannedPageCount(33, 32);
  assert.equal(result.ok, false);
  assert.match(result.message, /33/);
  assert.match(result.message, /32/);
  assert.match(result.message, /section_start/);
});

// --- verifyPdfNewerThanMarker ---

test('verifyPdfNewerThanMarker: PDF が無ければ失敗する', () => {
  const dir = makeTempRepo();
  fs.writeFileSync(path.join(dir, 'dist', '.build-marker'), 'marker', 'utf-8');
  const result = verifyPdfNewerThanMarker(dir, 'book-print.pdf');
  assert.equal(result.ok, false);
  assert.match(result.message, /book-print\.pdf/);
});

test('verifyPdfNewerThanMarker: マーカーが無ければ失敗する', () => {
  const dir = makeTempRepo();
  fs.writeFileSync(path.join(dir, 'dist', 'book-print.pdf'), 'pdf', 'utf-8');
  const result = verifyPdfNewerThanMarker(dir, 'book-print.pdf');
  assert.equal(result.ok, false);
  assert.match(result.message, /build-marker/);
});

test('verifyPdfNewerThanMarker: PDF がマーカーより新しければ成功する', () => {
  const dir = makeTempRepo();
  const markerPath = path.join(dir, 'dist', '.build-marker');
  const pdfPath = path.join(dir, 'dist', 'book-print.pdf');
  fs.writeFileSync(markerPath, 'marker', 'utf-8');
  fs.writeFileSync(pdfPath, 'pdf', 'utf-8');
  fs.utimesSync(pdfPath, new Date(), new Date(Date.now() + 1000));

  assert.equal(verifyPdfNewerThanMarker(dir, 'book-print.pdf').ok, true);
});

test('verifyPdfNewerThanMarker: PDF がマーカーより古ければ失敗する', () => {
  const dir = makeTempRepo();
  const markerPath = path.join(dir, 'dist', '.build-marker');
  const pdfPath = path.join(dir, 'dist', 'book-print.pdf');
  fs.writeFileSync(pdfPath, 'pdf', 'utf-8');
  fs.writeFileSync(markerPath, 'marker', 'utf-8');
  fs.utimesSync(pdfPath, new Date(), new Date(Date.now() - 5000));

  const result = verifyPdfNewerThanMarker(dir, 'book-print.pdf');
  assert.equal(result.ok, false);
  assert.match(result.message, /中断/);
});
