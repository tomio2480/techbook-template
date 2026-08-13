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

/* インラインコードとバックスラッシュエスケープの中の区切りは，VFM が
   実体参照へ落とすためコメントを開かない．同じ長さのバッククォート組を
   対で取り除く近似で扱う */
const INLINE_CODE_PATTERN = /(`+)(?:(?!\1)[\s\S])*\1/g;
const ESCAPED_PATTERN = /\\[\s\S]/g;

/**
 * 行から，HTML コメントの区切りとして働かない部分を取り除く．
 * @param {string} line
 * @returns {string}
 */
function stripNonMarkup(line) {
  return line.replace(INLINE_CODE_PATTERN, ' ').replace(ESCAPED_PATTERN, ' ');
}

/**
 * 行を走査し，行末時点で HTML コメントの内側かどうかを返す．
 * 1 行の中で閉じてから開き直す（`--> <!--`）場合を取りこぼさないため，
 * 区切りを出現順にたどって状態を反転させる．
 * @param {string} line
 * @param {boolean} inComment 行頭時点でコメントの内側か
 * @returns {boolean}
 */
function scanCommentState(line, inComment) {
  const text = stripNonMarkup(line);
  let state = inComment;
  let index = 0;
  for (;;) {
    const token = state ? COMMENT_CLOSE : COMMENT_OPEN;
    const found = text.indexOf(token, index);
    if (found === -1) {
      return state;
    }
    state = !state;
    index = found + token.length;
  }
}

/**
 * 原稿の生テキストに `{{errata}}` が単独行として含まれるか判定する．
 * 文中に埋め込まれた同じ文字列は対象にしない．
 * フェンスドコードブロック・4 スペース／タブインデントのコードブロック内は
 * VFM が `<pre><code>` へ変換し `injectColophonPlugin` が注入しないため，
 * 対象から除外する．
 * HTML コメント（複数行にまたがるものを含む）も同様に除外する．
 * コメント内のマーカーは段落にならず注入されないため，存在すると見なすと
 * 誌面から正誤表案内が欠落したまま検査が通ってしまう．
 * コメントの開閉はインラインコードとエスケープを除いた本文で判定する．
 * 区切りが文字として表示されるだけの場合にコメント扱いすると，
 * 本物のマーカーを見落として偽の警告を出すためである．
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
      inComment = scanCommentState(line, true);
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
    if (line.trim() === ERRATA_MARKER) {
      return true;
    }
    inComment = scanCommentState(line, false);
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
