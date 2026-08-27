/**
 * figure と装飾画像へ読み上げ用の目印を与える rehype プラグイン．
 *
 * Vivliostyle のタグ付き PDF は Chromium のアクセシビリティツリーから
 * 作られる．その変換には次の 2 つの穴があり，veraPDF の PDF/UA-1 検証で
 * 「Figure タグに代替テキストが無い」（条項 7.3 テスト 1）として現れる
 * （Issue #197）．
 *
 * - `figure` 要素は alt を持たない Figure タグになる．`figcaption` の
 *   文字列は `/Alt` へ写されない．`aria-label` を与えたときだけ
 *   `/Alt` が付く（最小構成の実験で確認）．
 * - 空 alt の `img` は装飾の意図に反して Figure タグとして残る．
 *   `role="presentation"` を与えると構造ツリーから外れる．
 *
 * そこで変換前の HTML 側で補う．`figure` には `figcaption` の文字列
 * （無ければ子孫 `img` の非空 alt）を `aria-label` として与える．
 * 空 alt の `img` には `role="presentation"` を与える．
 * 執筆者が明示した `aria-label`・`role` は上書きしない．
 * alt 属性そのものが無い `img` は書き漏らしの可能性があるため，
 * 変更せず警告だけ出す．
 */

/** ノード配下のテキストを連結して返す */
function textOf(node) {
  if (node.type === 'text') {
    return typeof node.value === 'string' ? node.value : '';
  }
  return (node.children ?? []).map(textOf).join('');
}

function isElement(node, tagName) {
  return node?.type === 'element' && node.tagName === tagName;
}

/** 子孫から最初の非空 alt を持つ img を探す */
function findAltFromImages(node) {
  if (isElement(node, 'img')) {
    const alt = node.properties?.alt;
    if (typeof alt === 'string' && alt.trim() !== '') {
      return alt.trim();
    }
  }
  for (const child of node.children ?? []) {
    const found = findAltFromImages(child);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

/** figure のラベルを figcaption →子孫 img の alt の順で決める */
function resolveFigureLabel(figure) {
  /* figcaption は HTML の文法上 figure の直下にだけ置ける */
  for (const child of figure.children ?? []) {
    if (isElement(child, 'figcaption')) {
      const caption = textOf(child).trim();
      if (caption !== '') {
        return caption;
      }
    }
  }
  return findAltFromImages(figure);
}

/**
 * プラグイン本体．vivliostyle.config.js の documentProcessor から
 * `.use(labelFiguresPlugin)` の形で組み込む．
 * @param {{ warn?: (m: string) => void }} options
 */
export function labelFiguresPlugin(options = {}) {
  const warn = options.warn ?? console.warn;
  return (tree) => {
    const visit = (node) => {
      if (!node) {
        return;
      }
      if (isElement(node, 'figure')) {
        node.properties ??= {};
        if (node.properties.ariaLabel === undefined) {
          const label = resolveFigureLabel(node);
          if (label !== undefined) {
            node.properties.ariaLabel = label;
          } else {
            warn('figure に figcaption も alt 付き img も無く，読み上げ名を与えられない');
          }
        }
      }
      if (isElement(node, 'img')) {
        node.properties ??= {};
        const { alt, role } = node.properties;
        if (alt === undefined) {
          warn(`img（${node.properties.src ?? '(src 不明)'}）に alt 属性が無い`);
        } else if (typeof alt === 'string' && alt.trim() === '' && role === undefined) {
          /* 空 alt は装飾の宣言．Figure タグとして残さないよう役割でも示す */
          node.properties.role = 'presentation';
        }
      }
      (node.children ?? []).forEach(visit);
    };
    visit(tree);
  };
}
