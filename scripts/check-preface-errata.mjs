#!/usr/bin/env node
/**
 * まえがき（00-preface.md）に正誤表案内マーカーが含まれているかを検査する．
 *
 * Issue #64: 正誤表の存在を読者へ確実に届けるため，まえがきに
 * `{{errata}}` マーカー（scripts/inject-colophon.mjs が処理する既存マーカー）
 * を必ず含める運用とする．欠落は誤り探しではなく警告として知らせる．
 */

import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';

const ERRATA_MARKER = '{{errata}}';

/**
 * 原稿の生テキストに `{{errata}}` が単独行として含まれるか判定する．
 * 文中に埋め込まれた同じ文字列は対象にしない．
 * @param {unknown} content 00-preface.md の生テキスト
 * @returns {boolean}
 */
export function hasErrataMarker(content) {
  if (typeof content !== 'string') {
    return false;
  }
  return content.split('\n').some((line) => line.trim() === ERRATA_MARKER);
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const root = new URL('..', import.meta.url);
  const prefacePath = fileURLToPath(new URL('src/chapters/00-preface.md', root));
  if (!fs.existsSync(prefacePath)) {
    console.warn('警告 src/chapters/00-preface.md が存在しないため正誤表案内の確認を省略する');
    process.exit(0);
  }
  const content = fs.readFileSync(prefacePath, 'utf-8');
  if (!hasErrataMarker(content)) {
    console.warn(
      '警告 src/chapters/00-preface.md に {{errata}} マーカーが無い．'
      + '正誤表の案内を読者へ確実に届けるため，まえがきへの記載を推奨する'
      + '（docs/spec/edition-errata.md 参照）',
    );
  } else {
    console.log('ok まえがき（00-preface.md）に正誤表案内マーカーがある');
  }
}
