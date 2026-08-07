/**
 * 書籍メタ情報（config/book.yaml の title・author）を誌面へ流し込む
 * rehype プラグイン．マーカーは次の 2 つとする．
 *
 * - `{{book-title}}`: 書名（title）へ置き換える
 * - `{{book-author}}`: 著者名（author）へ置き換える
 *
 * 表紙と本扉で同じ文字列データを使い回しつつ，体裁は各ページの CSS で
 * 独立に調整できるようにするための仕組みである．ISDN マーカーと異なり，
 * 見出しや文中への埋め込みを想定するため，テキストノード内を
 * インライン置換する．データが無い場合はマーカーを取り除いて警告する．
 */

const MARKERS = [
  { marker: '{{book-title}}', key: 'title', label: 'title' },
  { marker: '{{book-author}}', key: 'author', label: 'author' },
];

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * プラグイン本体．vivliostyle.config.js の documentProcessor から
 * `.use(injectBookMetaPlugin, { title, author })` の形で組み込む．
 * @param {{ title?: unknown, author?: unknown, warn?: (m: string) => void }} options
 */
export function injectBookMetaPlugin(options = {}) {
  const warn = options.warn ?? console.warn;
  return (tree) => {
    /* 同じ欠落を文書内で繰り返し警告しないための記録 */
    const warned = new Set();
    const replaceText = (value) => {
      let result = value;
      for (const { marker, key, label } of MARKERS) {
        if (!result.includes(marker)) {
          continue;
        }
        const data = options[key];
        if (isNonEmptyString(data)) {
          result = result.split(marker).join(data.trim());
        } else {
          if (!warned.has(key)) {
            warned.add(key);
            warn(`config/book.yaml: ${label} が未設定のため ${marker} を取り除く`);
          }
          result = result.split(marker).join('');
        }
      }
      return result;
    };
    const visit = (node) => {
      if (!node) {
        return;
      }
      if (node.type === 'text' && typeof node.value === 'string') {
        node.value = replaceText(node.value);
        return;
      }
      (node.children ?? []).forEach(visit);
    };
    visit(tree);
  };
}
