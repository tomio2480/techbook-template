/**
 * 奥付（99-colophon.md）のマーカーを config/book.yaml のデータで置き換える
 * rehype プラグイン．マーカーは単独の段落として書かれた次の 3 つに限る．
 *
 * - `{{authors}}`: 著者紹介セクション（氏名・SNS ID・紹介文・リンク 1 つ）
 * - `{{errata}}`: 公開正誤表ページへの案内とリンク
 * - `{{copyright}}`: © 表記（年・権利者名）と無断複製・転載の禁止文言
 *
 * データが無い・不正な場合はマーカーを取り除いたうえで警告を出す．
 * 出版物に `{{authors}}` の文字列が残る事故を防ぐためである．
 * 文章中に埋め込まれた同じ文字列は置き換え対象にしない．
 */

const AUTHORS_MARKER = '{{authors}}';
const ERRATA_MARKER = '{{errata}}';
const COPYRIGHT_MARKER = '{{copyright}}';
const COPYRIGHT_YEAR_PATTERN = /^\d{4}(-\d{4})?$/;
const DEFAULT_COPYRIGHT_NOTICE =
  '本書の一部または全部を、著作権者の許諾なく複製・転載・改変・公衆送信することを禁じます。';

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function el(tagName, properties, children) {
  return { type: 'element', tagName, properties, children };
}

function text(value) {
  return { type: 'text', value };
}

function paragraph(className, children) {
  return el('p', { className: [className] }, children);
}

/**
 * 著者 1 名分のブロックを組み立てる．name が無い場合は null を返す．
 * @param {Record<string, unknown>} author
 * @param {number} index 警告メッセージ用の添字
 * @param {(message: string) => void} warn
 */
function buildAuthorBlock(author, index, warn) {
  if (!author || typeof author !== 'object' || !isNonEmptyString(author.name)) {
    warn(`config/book.yaml: authors[${index}].name が無いため著者紹介から除外する`);
    return null;
  }
  const nameText = isNonEmptyString(author.sns)
    ? `${author.name}（${author.sns}）`
    : author.name;
  const children = [paragraph('colophon-author-name', [text(nameText)])];
  if (isNonEmptyString(author.bio)) {
    children.push(paragraph('colophon-author-bio', [text(author.bio)]));
  }
  if (author.link !== undefined) {
    const { title, url } = author.link ?? {};
    if (isNonEmptyString(title) && isNonEmptyString(url)) {
      children.push(
        paragraph('colophon-author-link', [
          text(`${title}：`),
          el('a', { href: url }, [text(url)]),
        ]),
      );
    } else {
      warn(`config/book.yaml: authors[${index}].link は title と url の両方が必要なため省略する`);
    }
  }
  return el('div', { className: ['colophon-author'] }, children);
}

/**
 * 著者紹介セクションを組み立てる．有効な著者が 1 名も無ければ null を返す．
 * @param {unknown} authors config/book.yaml の authors 節
 * @param {(message: string) => void} warn
 */
export function buildAuthorsSection(authors, warn = console.warn) {
  if (!Array.isArray(authors) || authors.length === 0) {
    warn('config/book.yaml: authors が未設定のため著者紹介を出力しない');
    return null;
  }
  const blocks = authors
    .map((author, index) => buildAuthorBlock(author, index, warn))
    .filter((block) => block !== null);
  if (blocks.length === 0) {
    return null;
  }
  return el('section', { className: ['colophon-authors'] }, [
    el('h2', {}, [text('著者紹介')]),
    ...blocks,
  ]);
}

/**
 * 正誤表案内セクションを組み立てる．url が http(s) でなければ null を返す．
 * @param {unknown} errata config/book.yaml の errata 節（{ url } を想定）
 * @param {(message: string) => void} warn
 */
export function buildErrataSection(errata, warn = console.warn) {
  const url = errata && typeof errata === 'object' ? errata.url : undefined;
  if (!isNonEmptyString(url) || !/^https?:\/\//.test(url)) {
    warn('config/book.yaml: errata.url が http(s) の URL でないため正誤表案内を出力しない');
    return null;
  }
  return el('section', { className: ['colophon-errata'] }, [
    paragraph('colophon-errata-label', [
      text('本書の正誤表は次のページで公開しています。'),
    ]),
    paragraph('colophon-errata-url', [el('a', { href: url }, [text(url)])]),
  ]);
}

/**
 * 著作権表記セクションを組み立てる．year が無い・不正な場合，
 * および holder・fallbackHolder がどちらも無い場合は null を返す．
 * @param {unknown} copyright config/book.yaml の copyright 節
 * @param {unknown} fallbackHolder holder 省略時に使う名義（book.yaml の author）
 * @param {(message: string) => void} warn
 */
export function buildCopyrightSection(copyright, fallbackHolder, warn = console.warn) {
  const source = copyright && typeof copyright === 'object' ? copyright : {};
  const rawYear = source.year;
  const yearText = isNonEmptyString(rawYear)
    ? rawYear.trim()
    : typeof rawYear === 'number'
      ? String(rawYear)
      : '';
  if (yearText === '' || !COPYRIGHT_YEAR_PATTERN.test(yearText)) {
    warn('config/book.yaml: copyright.year が無い・不正なため著作権表記を出力しない');
    return null;
  }
  const holder = isNonEmptyString(source.holder)
    ? source.holder
    : isNonEmptyString(fallbackHolder)
      ? fallbackHolder
      : null;
  if (holder === null) {
    warn('config/book.yaml: copyright.holder も author も無いため著作権表記を出力しない');
    return null;
  }
  const notice = isNonEmptyString(source.notice) ? source.notice : DEFAULT_COPYRIGHT_NOTICE;
  return el('section', { className: ['colophon-copyright'] }, [
    paragraph('colophon-copyright-line', [text(`© ${yearText} ${holder}`)]),
    paragraph('colophon-copyright-notice', [text(notice)]),
  ]);
}

/**
 * 単独段落のマーカーを判定する．空白だけのテキストノードは無視する．
 * @param {Record<string, unknown>} node
 * @returns {string | null} マーカー文字列（該当しなければ null）
 */
function markerOf(node) {
  if (!node || node.type !== 'element' || node.tagName !== 'p') {
    return null;
  }
  const meaningful = (node.children ?? []).filter(
    (child) => !(child.type === 'text' && child.value.trim() === ''),
  );
  if (meaningful.length !== 1 || meaningful[0].type !== 'text') {
    return null;
  }
  const value = meaningful[0].value.trim();
  return [AUTHORS_MARKER, ERRATA_MARKER, COPYRIGHT_MARKER].includes(value) ? value : null;
}

/**
 * プラグイン本体．vivliostyle.config.js の documentProcessor から
 * `.use(injectColophonPlugin, { authors, errata, copyright, fallbackAuthor })`
 * の形で組み込む．
 * @param {{ authors?: unknown, errata?: unknown, copyright?: unknown,
 *   fallbackAuthor?: unknown, warn?: (m: string) => void }} options
 */
export function injectColophonPlugin(options = {}) {
  const warn = options.warn ?? console.warn;
  return (tree) => {
    const builders = {
      [AUTHORS_MARKER]: () => buildAuthorsSection(options.authors, warn),
      [ERRATA_MARKER]: () => buildErrataSection(options.errata, warn),
      [COPYRIGHT_MARKER]: () =>
        buildCopyrightSection(options.copyright, options.fallbackAuthor, warn),
    };
    const visit = (node) => {
      if (!node || !Array.isArray(node.children)) {
        return;
      }
      node.children = node.children.flatMap((child) => {
        const marker = markerOf(child);
        if (marker !== null) {
          const replacement = builders[marker]();
          return replacement === null ? [] : [replacement];
        }
        visit(child);
        return [child];
      });
    };
    visit(tree);
  };
}
