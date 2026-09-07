/**
 * 図版 SVG を読むための共通部品．
 *
 * 図版の検査は正規表現でタグと宣言の範囲を取る．
 * その作りは，範囲を確定できない壊れ方をした入力に対して黙って空振りする．
 * 違反 0 件で通るため，検査が壊れているのに合格と報告する状態になる．
 * 本モジュールはその壊れ方を検出し，各検査へ共通の判定を渡す．
 *
 * 要求要件は docs/spec/diagram-style.md の「読み取れない入力」節を参照する．
 * XML の整形式そのものは判定しない．終了タグの対応・要素の入れ子・
 * 名前空間が崩れても，タグと宣言の範囲は確定でき，検査は空振りしないためである．
 */

/**
 * XML コメントを除去する．コメント内に残る指定（無効化済みの記述）を
 * 検査対象から除外し，誤検出・誤通過の両方を防ぐ．
 *
 * 入れ子・破損したコメント境界（例: `<!-- a <!-- b -->`）では 1 回の
 * 置換で取り残しが生じ得るため，変化がなくなるまで繰り返す．
 * CodeQL js/incomplete-multi-character-sanitization の指摘への対応である．
 * @param {string} svgText SVG の中身
 * @returns {string} コメントを取り除いた SVG
 */
export function stripXmlComments(svgText) {
  let text = svgText;
  for (;;) {
    const next = text.replace(/<!--[\s\S]*?-->/g, '');
    if (next === text) {
      return next;
    }
    text = next;
  }
}

const COMMENT_OPEN = '<!--';
const COMMENT_CLOSE = '-->';
const CDATA_OPEN = '<![CDATA[';
const CDATA_CLOSE = ']]>';
const STYLE_ELEMENT_NAME = 'style';

/** タグ名として読む文字．XML の Name より緩く取り，判定は用途側に委ねる． */
const TAG_NAME_CHARS = /[\w:.-]/;

/**
 * `<` から始まるタグを読む．属性値の中の `>` で切らないよう引用符を見る．
 * @param {string} svgText SVG の中身
 * @param {number} start `<` の位置
 * @returns {{ name: string, isEnd: boolean, selfClosing: boolean, end: number, openQuote: string | null }}
 *   `end` は `>` の次の位置．`>` が無ければ `end` は -1 とし，
 *   そのとき `openQuote` に閉じていない引用符が入る
 */
function readTag(svgText, start) {
  let cursor = start + 1;
  const isEnd = svgText[cursor] === '/';
  if (isEnd) {
    cursor += 1;
  }
  let name = '';
  while (cursor < svgText.length && TAG_NAME_CHARS.test(svgText[cursor])) {
    name += svgText[cursor];
    cursor += 1;
  }
  let quote = null;
  let previous = '';
  while (cursor < svgText.length) {
    const character = svgText[cursor];
    if (quote) {
      if (character === quote) {
        quote = null;
      }
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '>') {
      return { name, isEnd, selfClosing: previous === '/', end: cursor + 1, openQuote: null };
    }
    previous = character;
    cursor += 1;
  }
  return { name, isEnd, selfClosing: false, end: -1, openQuote: quote };
}

/**
 * 検査が走査の範囲を確定できない壊れ方を集める．
 *
 * 位置の確定できない壊れ方（閉じ忘れ）は，そこから先の解釈が定まらないため
 * 打ち切る．位置の確定できる壊れ方（コメントの中の `--`）は走査を続ける．
 * @param {string} svgText SVG の中身
 * @returns {Array<{ kind: string, index: number, message: string }>}
 *   違反の一覧．読み取れれば空
 */
export function findUnreadableMarkup(svgText) {
  const violations = [];
  const stop = (kind, index, message) => {
    violations.push({ kind, index, message });
    return violations;
  };

  let cursor = 0;
  let openStyleIndex = -1;

  while (cursor < svgText.length) {
    const start = svgText.indexOf('<', cursor);
    if (start === -1) {
      break;
    }

    if (svgText.startsWith(COMMENT_OPEN, start)) {
      const close = svgText.indexOf(COMMENT_CLOSE, start + COMMENT_OPEN.length);
      if (close === -1) {
        return stop(
          'unclosed-comment',
          start,
          'コメントが閉じておらず，以降の全体がコメントとして捨てられる'
        );
      }
      if (svgText.slice(start + COMMENT_OPEN.length, close).includes(COMMENT_OPEN)) {
        violations.push({
          kind: 'nested-comment-marker',
          index: start,
          message: 'コメントの中に <!-- があり，入れ子に見える記述が最初の --> で閉じている',
        });
      }
      cursor = close + COMMENT_CLOSE.length;
      continue;
    }

    if (svgText.startsWith(CDATA_OPEN, start)) {
      const close = svgText.indexOf(CDATA_CLOSE, start + CDATA_OPEN.length);
      if (close === -1) {
        return stop('unclosed-cdata', start, 'CDATA 節が閉じておらず，範囲を確定できない');
      }
      cursor = close + CDATA_CLOSE.length;
      continue;
    }

    const tag = readTag(svgText, start);
    if (tag.end === -1) {
      return tag.openQuote
        ? stop(
            'unbalanced-quote',
            start,
            'タグの中の引用符が閉じておらず，同じタグの属性まで走査から外れる'
          )
        : stop('unclosed-tag', start, 'タグが閉じておらず，そのタグの属性が走査から外れる');
    }
    cursor = tag.end;

    if (tag.name.toLowerCase() !== STYLE_ELEMENT_NAME) {
      continue;
    }
    if (tag.isEnd) {
      openStyleIndex = -1;
    } else if (!tag.selfClosing) {
      openStyleIndex = start;
    }
  }

  if (openStyleIndex !== -1) {
    /* 打ち切らずに末尾まで読み切った場合にだけ判定する．
       閉じ忘れで途中打ち切りになった図へ，重ねて報告しないためである． */
    violations.push({
      kind: 'unclosed-style',
      index: openStyleIndex,
      message: '<style> が閉じておらず，中の宣言がまとめて走査から外れる',
    });
  }
  return violations;
}

/**
 * 読み取れない入力を，各検査が返す違反の形へそろえる．
 * 検査ごとに文言が割れると，同じ壊れ方が別の問題に見えるためである．
 * @param {string} file 図版のファイル名
 * @param {{ kind: string, index: number, message: string }} item findUnreadableMarkup の要素
 * @returns {{ type: string, file: string, kind: string, index: number, message: string }} 違反
 */
export function toUnreadableViolation(file, { kind, index, message }) {
  return {
    type: 'unreadable-markup',
    file,
    kind,
    index,
    message: `${file} は ${index} 文字目から検査が読み取れない（${message}）`,
  };
}
