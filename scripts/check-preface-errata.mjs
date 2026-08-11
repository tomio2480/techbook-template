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

const FENCE_PATTERN = /^ {0,3}(`{3,}|~{3,})/;
const INDENTED_CODE_PATTERN = /^(?: {4,}|\t)\S/;
const COMMENT_OPEN = '<!--';
const COMMENT_CLOSE = '-->';

/**
 * 原稿の生テキストに `{{errata}}` が単独行として含まれるか判定する．
 * 文中に埋め込まれた同じ文字列は対象にしない．
 * フェンスドコードブロック・4 スペース／タブインデントのコードブロック内は
 * VFM が `<pre><code>` へ変換し `injectColophonPlugin` が注入しないため，
 * 対象から除外する．
 * HTML コメント（複数行にまたがるものを含む）も同様に除外する．
 * コメント内のマーカーは段落にならず注入されないため，存在すると見なすと
 * 誌面から正誤表案内が欠落したまま検査が通ってしまう．
 * @param {unknown} content 00-preface.md の生テキスト
 * @returns {boolean}
 */
export function hasErrataMarker(content) {
  if (typeof content !== 'string') {
    return false;
  }
  let fenceChar = null;
  let inComment = false;
  for (const line of content.split('\n')) {
    if (inComment) {
      /* 終了行も HTML ブロックの一部であり，`-->` の後ろは段落にならない */
      if (line.includes(COMMENT_CLOSE)) {
        inComment = false;
      }
      continue;
    }
    const fenceMatch = line.match(FENCE_PATTERN);
    if (fenceMatch) {
      const char = fenceMatch[1][0];
      fenceChar = fenceChar === null ? char : (fenceChar === char ? null : fenceChar);
      continue;
    }
    if (fenceChar !== null || INDENTED_CODE_PATTERN.test(line)) {
      continue;
    }
    const opened = line.lastIndexOf(COMMENT_OPEN);
    if (opened !== -1 && !line.slice(opened).includes(COMMENT_CLOSE)) {
      inComment = true;
      continue;
    }
    if (line.trim() === ERRATA_MARKER) {
      return true;
    }
  }
  return false;
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
