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
/* 行頭の `<!--` は HTML ブロックの開始であり，段落を途中で切る．
   直前の行に閉じ手の無いバッククォートがあっても，コードスパンは続かない */
const COMMENT_BLOCK_START_PATTERN = /^ {0,3}<!--/;
const COMMENT_OPEN = '<!--';
const COMMENT_CLOSE = '-->';

/* インラインコードとバックスラッシュエスケープの中の区切りは，VFM が
   実体参照へ落とすためコメントを開かない．同じ長さのバッククォート組を
   対で取り除く近似で扱う */
const INLINE_CODE_PATTERN = /(`+)(?:(?!\1)[\s\S])*\1/g;
const ESCAPED_PATTERN = /\\[\s\S]/g;

/* 行をまたぐコードスパンを閉じるバッククォート組．長さが一致するものだけが
   閉じ手であり，前後に余分なバッククォートが続くものは閉じ手にならない */
function closingTicksPattern(length) {
  return new RegExp('(?<!`)`{' + length + '}(?!`)');
}

/* 対で取り除いた後に残るバッククォート組．ここから行末までがコードスパンで，
   閉じ手は後続の行に現れる */
const UNCLOSED_TICKS_PATTERN = /(?<!`)(`+)(?!`)/;

/**
 * 行から，HTML コメントの区切りとして働かない部分を取り除く．
 * CommonMark のコードスパンは行をまたげるため，閉じていないバッククォート組の
 * 長さを行間で持ち回る．開いたままの区間に現れる `<!--` は文字として表示される
 * だけであり，コメントを開かない．
 * @param {string} line
 * @param {number|null} openTicks 行頭時点で開いているコードスパンの長さ
 * @returns {{ text: string, openTicks: number|null }}
 */
function stripNonMarkup(line, openTicks) {
  let text = line;
  let ticks = openTicks;

  if (ticks !== null) {
    const closing = text.match(closingTicksPattern(ticks));
    if (closing === null) {
      return { text: '', openTicks: ticks };
    }
    text = text.slice(closing.index + closing[0].length);
    ticks = null;
  }

  text = text.replace(INLINE_CODE_PATTERN, ' ');

  const unclosed = text.match(UNCLOSED_TICKS_PATTERN);
  if (unclosed) {
    ticks = unclosed[1].length;
    text = text.slice(0, unclosed.index);
  }

  return { text: text.replace(ESCAPED_PATTERN, ' '), openTicks: ticks };
}

/**
 * 行を走査し，行末時点で HTML コメントの内側かどうかを返す．
 * 1 行の中で閉じてから開き直す（`--> <!--`）場合を取りこぼさないため，
 * 区切りを出現順にたどって状態を反転させる．
 * @param {string} line
 * @param {boolean} inComment 行頭時点でコメントの内側か
 * @param {number|null} openTicks 行頭時点で開いているコードスパンの長さ
 * @returns {{ inComment: boolean, openTicks: number|null }}
 */
function scanCommentState(line, inComment, openTicks) {
  const { text, openTicks: nextTicks } = stripNonMarkup(line, openTicks);
  let state = inComment;
  let index = 0;
  for (;;) {
    const token = state ? COMMENT_CLOSE : COMMENT_OPEN;
    const found = text.indexOf(token, index);
    if (found === -1) {
      return { inComment: state, openTicks: nextTicks };
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
 * インラインコードは行をまたぐものも扱う．開いたままのバッククォート組の
 * 長さを行間で持ち回り，閉じ手が現れるまでを非マークアップとして読む．
 * ただしコードスパンは段落の内側にとどまる．空行・フェンス・行頭の `<!--` は
 * 段落を切るため，閉じ手が無くてもそこで文字へ戻す．
 * 段落の切れ目の判断は VFM の出力で確かめた（Issue #112・PR #121）．
 * @param {unknown} content 00-preface.md の生テキスト
 * @returns {boolean}
 */
export function hasErrataMarker(content) {
  if (typeof content !== 'string') {
    return false;
  }
  let fenceChar = null;
  let inComment = false;
  let openTicks = null;
  for (const line of content.split('\n')) {
    if (inComment) {
      /* 終了行も HTML ブロックの一部であり，`-->` の後ろは段落にならない */
      ({ inComment } = scanCommentState(line, true, null));
      /* コメントの内側にバッククォートがあってもコードスパンにはならない */
      openTicks = null;
      continue;
    }
    const fenceMatch = line.match(FENCE_PATTERN);
    if (fenceMatch) {
      const char = fenceMatch[1][0];
      fenceChar = fenceChar === null ? char : (fenceChar === char ? null : fenceChar);
      /* フェンスも段落を切る．開いたままのコードスパンはここで終わる */
      openTicks = null;
      continue;
    }
    if (fenceChar !== null || INDENTED_CODE_PATTERN.test(line)) {
      continue;
    }
    /* 空行は段落を切る．閉じ手の無いバッククォートはそこで文字へ戻る */
    if (line.trim() === '') {
      openTicks = null;
      continue;
    }
    if (COMMENT_BLOCK_START_PATTERN.test(line)) {
      openTicks = null;
    }
    /* 行をまたぐコードスパンの内側にある行は，段落にならず注入もされない */
    if (openTicks === null && line.trim() === ERRATA_MARKER) {
      return true;
    }
    ({ inComment, openTicks } = scanCommentState(line, false, openTicks));
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
