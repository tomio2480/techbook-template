import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeBuildMarker } from './add-line-numbers.mjs';

// --- writeBuildMarker ---

test('writeBuildMarker: dist ディレクトリが存在しない場合は作成した上で marker を書き込む', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'add-line-numbers-test-'));
  const distDir = path.join(tmpRoot, 'dist');
  try {
    assert.equal(fs.existsSync(distDir), false);
    writeBuildMarker(distDir);
    const markerPath = path.join(distDir, '.build-marker');
    assert.equal(fs.existsSync(markerPath), true);
    assert.match(fs.readFileSync(markerPath, 'utf-8'), /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});
