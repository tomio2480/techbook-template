/**
 * 全角文字（ひらがな・カタカナ・漢字・全角記号）どうしに挟まれた改行だけを
 * 詰める rehype プラグイン．原稿の1文1行スタイルによる文中改行が，HTML の
 * 空白折りたたみ規則により半角スペース1つとして表示されてしまう問題への対処．
 * コードブロック（pre/code）と数式（VFM が生成する class="math ..." 要素）は
 * 対象外とする．
 */

const CJK_CHAR_CLASS =
  '\\u3000-\\u303f\\u3040-\\u309f\\u30a0-\\u30ff' +
  '\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\uff00-\\uffef';

// 前後の CJK 文字を lookbehind/lookahead で判定するため、CJK 文字自体は
// マッチに含まれない。改行と前後の空白だけが対象になるため、置換先は
// 空文字列でよく、連続する改行も1回の replace で処理できる。
const CJK_LINE_BREAK_RE = new RegExp(
  `(?<=[${CJK_CHAR_CLASS}])[ \\t]*\\r?\\n[ \\t]*(?=[${CJK_CHAR_CLASS}])`,
  'g',
);

export function joinCjkLineBreaks(value) {
  return value.replace(CJK_LINE_BREAK_RE, '');
}

function hasMathClass(node) {
  const className = node.properties && node.properties.className;
  if (Array.isArray(className)) return className.includes('math');
  if (typeof className === 'string') return className.split(/\s+/).includes('math');
  return false;
}

export function joinCjkLineBreaksPlugin() {
  return (tree) => {
    const visit = (node) => {
      if (
        node.type === 'element' &&
        (node.tagName === 'code' || node.tagName === 'pre' || hasMathClass(node))
      ) {
        return;
      }
      if (node.type === 'text' && typeof node.value === 'string') {
        node.value = joinCjkLineBreaks(node.value);
      }
      if (Array.isArray(node.children)) {
        node.children.forEach(visit);
      }
    };
    visit(tree);
  };
}
