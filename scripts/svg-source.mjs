/**
 * 図版 SVG を読むための共通部品．
 *
 * 図版の検査は正規表現でタグと宣言の範囲を取る．
 * その作りは，範囲を確定できない壊れ方をした入力に対して黙って空振りする．
 * 違反 0 件で通るため，検査が壊れているのに合格と報告する状態になる．
 * ブラウザーが XML として読めない図も，同じく検査を素通りする．
 * 本モジュールはその壊れ方を検出し，各検査へ共通の判定を渡す．
 *
 * 要求要件は docs/spec/diagram-style.md の「読み取れない入力」節を参照する．
 * 見るのは 2 つに限る．検査が走査の範囲を確定できるかと，
 * ブラウザーが XML として読めるかである．
 * 名前空間の解決や属性値の妥当性は，どちらにも当たらないため判定しない．
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
/* XML はコメントの中の -- を禁じる．Chromium は SVG を XML として読むため，
   1 つでもあると図が描画されず，最初のエラーまでの表示になる． */
const DOUBLE_HYPHEN = '--';
const CDATA_OPEN = '<![CDATA[';
const CDATA_CLOSE = ']]>';
/* 処理命令（Processing Instruction）．XML 宣言 <?xml … ?> もこの形である． */
const PI_OPEN = '<?';
const PI_CLOSE = '?>';
const DOCTYPE_OPEN = '<!DOCTYPE';

/** タグ名として読む文字．XML の Name より緩く取り，判定は用途側に委ねる． */
const TAG_NAME_CHARS = /[\w:.-]/;

/**
 * `<` から始まるタグを読む．属性値の中の `>` で切らないよう引用符を見る．
 * @param {string} svgText SVG の中身
 * @param {number} start `<` の位置
 * @returns {{ name: string, isEnd: boolean, selfClosing: boolean, end: number,
 *   openQuote: string | null, lessThanIndex: number }}
 *   `end` は `>` の次の位置．`>` が無ければ `end` は -1 とし，
 *   そのとき `openQuote` に閉じていない引用符が入る．
 *   `lessThanIndex` は属性値の中に現れた生の `<` の位置．無ければ -1
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
  let lessThanIndex = -1;
  while (cursor < svgText.length) {
    const character = svgText[cursor];
    if (quote) {
      if (character === quote) {
        quote = null;
      } else if (character === '<' && lessThanIndex === -1) {
        /* 属性値の中の > は XML で許されるが，< は許されない． */
        lessThanIndex = cursor;
      }
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '>') {
      return {
        name,
        isEnd,
        selfClosing: previous === '/',
        end: cursor + 1,
        openQuote: null,
        lessThanIndex,
      };
    }
    previous = character;
    cursor += 1;
  }
  return { name, isEnd, selfClosing: false, end: -1, openQuote: quote, lessThanIndex };
}

/**
 * `<!DOCTYPE` を読む．内部サブセット（`[` … `]`）の中の `>` で切らない．
 * @param {string} svgText SVG の中身
 * @param {number} start `<` の位置
 * @returns {number} `>` の次の位置．閉じていなければ -1
 */
function readDoctype(svgText, start) {
  let quote = null;
  let inSubset = false;
  for (let cursor = start + DOCTYPE_OPEN.length; cursor < svgText.length; cursor += 1) {
    const character = svgText[cursor];
    if (quote) {
      if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '[') {
      inSubset = true;
    } else if (character === ']') {
      inSubset = false;
    } else if (character === '>' && !inSubset) {
      return cursor + 1;
    }
  }
  return -1;
}

/**
 * 検査が走査の範囲を確定できない壊れ方を集める．
 *
 * 位置の確定できない壊れ方（閉じ忘れ・対応崩れ）は，そこから先の解釈が
 * 定まらないため打ち切る．位置の確定できる壊れ方は走査を続ける．
 * 後者はコメントの中の `--` と，属性値の中の生の `<` である．
 * どちらも描画されない形だが，範囲は確定できるため後続の壊れ方も報告できる．
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
  /** 開いたまま閉じていない要素．末尾が最も内側． */
  const openElements = [];

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
      const body = svgText.slice(start + COMMENT_OPEN.length, close);
      if (body.includes(COMMENT_OPEN)) {
        violations.push({
          kind: 'nested-comment-marker',
          index: start,
          message: 'コメントの中に <!-- があり，入れ子に見える記述が最初の --> で閉じている',
        });
      } else if (body.includes(DOUBLE_HYPHEN) || body.endsWith('-')) {
        /* 本文の末尾が - の形（<!-- a --->）は，閉じ区切りと合わせて --- になる．
           切り出した本文に -- は残らないが，XML パーサは同じく拒む． */
        violations.push({
          kind: 'double-hyphen-in-comment',
          index: start,
          message: 'コメントの中に -- があり，XML パーサが読めず図が描画されない',
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

    /* 処理命令は ?> までを一体として読む．最初の > で切ると，
       中の要素らしき文字列を実要素として数えてしまう． */
    if (svgText.startsWith(PI_OPEN, start)) {
      const close = svgText.indexOf(PI_CLOSE, start + PI_OPEN.length);
      if (close === -1) {
        return stop(
          'unclosed-processing-instruction',
          start,
          '処理命令が ?> で閉じておらず，範囲を確定できない'
        );
      }
      cursor = close + PI_CLOSE.length;
      continue;
    }

    if (svgText.startsWith(DOCTYPE_OPEN, start)) {
      const end = readDoctype(svgText, start);
      if (end === -1) {
        return stop(
          'unclosed-doctype',
          start,
          'DOCTYPE が閉じておらず，内部サブセットの範囲を確定できない'
        );
      }
      cursor = end;
      continue;
    }

    const tag = readTag(svgText, start);
    /* 引用符が閉じないまま末尾へ達した場合を先に見る．
       閉じない引用符は以降の < も飲み込むため，そちらが根本の壊れ方である． */
    if (tag.end === -1) {
      return tag.openQuote
        ? stop(
            'unbalanced-quote',
            start,
            'タグの中の引用符が閉じておらず，同じタグの属性まで走査から外れる'
          )
        : stop('unclosed-tag', start, 'タグが閉じておらず，そのタグの属性が走査から外れる');
    }
    if (tag.lessThanIndex !== -1) {
      /* タグは閉じており，走査の範囲は確定できる．
         位置の確定できる壊れ方として，打ち切らずに続ける． */
      violations.push({
        kind: 'unescaped-lt-in-attribute',
        index: tag.lessThanIndex,
        message: '属性値の中に生の < があり，XML パーサが読めず図が描画されない',
      });
    }
    cursor = tag.end;

    /* 名前が空なのは <!ENTITY 等の宣言であり，要素の入れ子には数えない．
       処理命令と DOCTYPE は上で消費済みのため，ここへは来ない． */
    if (tag.name === '') {
      continue;
    }
    if (tag.selfClosing) {
      continue;
    }
    if (!tag.isEnd) {
      openElements.push({ name: tag.name, index: start });
      continue;
    }
    const innermost = openElements.pop();
    if (innermost === undefined || innermost.name !== tag.name) {
      return stop(
        'mismatched-end-tag',
        start,
        `</${tag.name}> に対応する開始タグが直前に無く，要素の範囲を確定できない`
      );
    }
  }

  /* 打ち切らずに末尾まで読み切った場合にだけ判定する．
     閉じ忘れで途中打ち切りになった図へ，重ねて報告しないためである． */
  const unclosed = openElements.pop();
  if (unclosed !== undefined) {
    violations.push({
      kind: 'unclosed-element',
      index: unclosed.index,
      message: `<${unclosed.name}> が閉じておらず，中の記述がまとめて走査から外れる`,
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
