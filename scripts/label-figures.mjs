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
        /* 役割を明示した figure には踏み込まない．presentation 等へ
           aria-label（グローバル ARIA 属性）を足すと，役割競合の解決で
           明示した役割が無効になり figure として露出し直すためである．
           暗黙の役割と同じ role="figure" だけは補完の対象へ残す．

           role の値は空白区切りのフォールバックリストであり，認識できる
           最初のトークンが効く．正確な解決には認識可能なロールの全一覧が
           要り，Chromium の実装との不一致を抱え込むため持たない．
           figure を含む複数トークンは「解釈できない並び」として補完を
           見送り，警告で知らせる．黙って素通しはしない */
        const role = node.properties.role;
        const roleTokens =
          typeof role === 'string' ? role.trim().split(/\s+/).filter(Boolean) : [];
        const keepsFigureRole =
          role === undefined || roleTokens.every((token) => token === 'figure');
        if (role !== undefined && !keepsFigureRole && roleTokens.includes('figure')) {
          warn(
            `figure の role（"${role}"）は複数トークンの並びで解釈できないため，` +
              '読み上げ名を補わない．単一の role="figure" にするか役割を見直すこと'
          );
        }
        /* 空白だけの aria-label は読み上げ名にならないため，明示と見なさない */
        const existing = node.properties.ariaLabel;
        const hasExplicitLabel =
          existing !== undefined && !(typeof existing === 'string' && existing.trim() === '');
        if (keepsFigureRole && !hasExplicitLabel) {
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
