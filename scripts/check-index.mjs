#!/usr/bin/env node
/**
 * 索引（`class: index` の原稿）と本文のアンカーの食い違いを検査する．
 *
 * Issue #131: 索引のページ番号は CSS の `target-counter` で解決する．
 * 参照先が本文に無いとページ番号を解決できず，組版が終わらない．
 * リンク切れは体裁の乱れでは済まないため，ビルドの前段で止める．
 *
 * 調べることは次の 4 つである（`docs/spec/index-page.md` 参照）．
 *
 * - 参照の `href` が指す原稿が本に含まれるか．
 * - 参照の `href` が指すアンカーが，その原稿に実在するか．
 * - 本文のアンカーのうち，索引から参照されていないものが無いか．
 * - アンカーの `id` が本の中で重複していないか．
 *
 * 走査は VFM の出力（hast）に対して行う．コードブロック・インラインコード・
 * HTML コメントの中の記述は要素にならないため，自前で読み飛ばす必要が無い．
 * Markdown を文字列として探すと，例示のためのアンカーまで拾ってしまう．
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { VFM } from '@vivliostyle/vfm';

/** 索引の原稿を見分ける frontmatter の class */
export const INDEX_CLASS = 'index';

/** 索引へ載せる語に置くアンカーの id の接頭辞 */
export const ANCHOR_ID_PREFIX = 'idx-';

/** 索引から本文へ向かう参照が持つ class */
export const REFERENCE_CLASS = 'index-page';

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/**
 * frontmatter の `class` を空白区切りで分けて返す．
 * frontmatter が無い場合と壊れている場合は空配列を返す．
 * 原稿の書き損じで検査そのものが落ちると，直すべき箇所が分からなくなる．
 * @param {unknown} markdown 原稿の生テキスト
 * @returns {string[]}
 */
export function frontmatterClasses(markdown) {
  if (typeof markdown !== 'string') {
    return [];
  }
  const matched = markdown.match(FRONTMATTER_PATTERN);
  if (matched === null) {
    return [];
  }
  let data;
  try {
    data = parse(matched[1]);
  } catch {
    return [];
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return [];
  }
  const value = data.class;
  if (typeof value !== 'string') {
    return [];
  }
  return value.split(/\s+/).filter((name) => name !== '');
}

/** hast を先行順にたどる．VFM の出力は木であり，親から子へ 1 度ずつ訪れる */
function walk(node, visit) {
  if (node === null || typeof node !== 'object') {
    return;
  }
  visit(node);
  const children = Array.isArray(node.children) ? node.children : [];
  for (const child of children) {
    walk(child, visit);
  }
}

/** hast の class は配列で入る．文字列で入る場合も取りこぼさない */
function classNames(properties) {
  const value = properties?.className;
  if (Array.isArray(value)) {
    return value.map(String);
  }
  return typeof value === 'string' ? value.split(/\s+/).filter((name) => name !== '') : [];
}

/** 属性の値を文字列として取り出す．未指定は null で表す */
function attribute(properties, name) {
  const value = properties?.[name];
  return typeof value === 'string' && value !== '' ? value : null;
}

/**
 * 原稿を VFM で組み立て，アンカーと参照をまとめて集める．
 * 原稿 1 本につき 1 度だけ処理するため，収集は同じ走査で済ませる．
 * @param {unknown} markdown 原稿の生テキスト
 * @returns {Promise<{anchors: {id: string, term: string|null, yomi: string|null}[],
 *                    references: {href: string, file: string|null, id: string|null}[]}>}
 */
export async function scanMarkdown(markdown) {
  const anchors = [];
  const references = [];
  if (typeof markdown !== 'string') {
    return { anchors, references };
  }
  const collect = () => (tree) => {
    walk(tree, (node) => {
      if (node.type !== 'element' || node.tagName !== 'a') {
        return;
      }
      const id = attribute(node.properties, 'id');
      if (id !== null && id.startsWith(ANCHOR_ID_PREFIX)) {
        anchors.push({
          id,
          term: attribute(node.properties, 'dataIndex'),
          yomi: attribute(node.properties, 'dataYomi'),
        });
      }
      if (classNames(node.properties).includes(REFERENCE_CLASS)) {
        const href = attribute(node.properties, 'href') ?? '';
        references.push({ href, ...parseReferenceHref(href) });
      }
    });
  };
  await VFM().use(collect).process(markdown);
  return { anchors, references };
}

/**
 * 原稿からアンカーだけを集める．
 * @param {unknown} markdown 原稿の生テキスト
 * @returns {Promise<{id: string, term: string|null, yomi: string|null}[]>}
 */
export async function collectAnchors(markdown) {
  return (await scanMarkdown(markdown)).anchors;
}

/**
 * 索引の原稿から参照だけを集める．
 * @param {unknown} markdown 索引の原稿の生テキスト
 * @returns {Promise<{href: string, file: string|null, id: string|null}[]>}
 */
export async function collectReferences(markdown) {
  return (await scanMarkdown(markdown)).references;
}

/* 百分率符号化された参照を原稿の綴りへ戻す．編集器が和文の id を
   符号化して書き出す場合があり，そのままでは原稿と照合できない．
   壊れた符号化はそのままの文字列として扱い，検査を落とさない */
function decodeComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * 参照の `href` を出力 HTML のファイル名とアンカーの id へ分ける．
 * 生成 HTML は同じディレクトリへ並ぶため，ディレクトリを含む参照は
 * 組み上がりで指す先が変わる．ファイル名として扱わず null を返す．
 * @param {unknown} href
 * @returns {{file: string|null, id: string|null}}
 */
export function parseReferenceHref(href) {
  if (typeof href !== 'string') {
    return { file: null, id: null };
  }
  const hashIndex = href.indexOf('#');
  const filePart = decodeComponent(hashIndex === -1 ? href : href.slice(0, hashIndex));
  const idPart = decodeComponent(hashIndex === -1 ? '' : href.slice(hashIndex + 1));
  const hasDirectory = filePart.includes('/') || filePart.includes('\\');
  return {
    file: filePart !== '' && !hasDirectory ? filePart : null,
    id: idPart !== '' ? idPart : null,
  };
}

/** 同じ値の並びを，出現回数を添えた一覧の文字列にする */
function locationList(entries) {
  const counts = new Map();
  for (const entry of entries) {
    counts.set(entry, (counts.get(entry) ?? 0) + 1);
  }
  return [...counts]
    .map(([entry, count]) => (count > 1 ? `${entry}（${count} か所）` : entry))
    .join('，');
}

/**
 * 集めたアンカーと参照を突き合わせ，食い違いを日本語の一覧で返す．
 * 参照の側の誤りを先に並べる．参照が外れているとアンカーも未参照になり，
 * 後から出る指摘だけを読んでも原因へ届かないためである．
 * @param {object} params
 * @param {Map<string, {id: string}[]>} params.anchorsByEntry entry のパス → アンカー
 * @param {{href: string, file: string|null, id: string|null}[]} params.references 索引の参照
 * @param {Map<string, string>} params.entryByHtmlName 出力 HTML 名 → entry のパス
 * @param {string} params.indexEntry 索引の原稿の entry パス
 * @returns {string[]}
 */
export function crossCheck({ anchorsByEntry, references, entryByHtmlName, indexEntry }) {
  const errors = [];
  const referenced = new Set();

  for (const reference of references) {
    const shown = reference.href === '' ? '(空)' : reference.href;
    if (reference.file === null) {
      errors.push(`${indexEntry}: 参照 "${shown}" が原稿のファイル名を指していない`);
      continue;
    }
    if (reference.id === null) {
      errors.push(`${indexEntry}: 参照 "${shown}" がアンカーを指していない`);
      continue;
    }
    const entry = entryByHtmlName.get(reference.file);
    if (entry === undefined) {
      errors.push(`${indexEntry}: 参照 "${shown}" が指す原稿は本に無い`);
      continue;
    }
    const anchors = anchorsByEntry.get(entry) ?? [];
    if (!anchors.some((anchor) => anchor.id === reference.id)) {
      errors.push(`${indexEntry}: 参照 "${shown}" の指すアンカーが無い（${entry}）`);
      continue;
    }
    referenced.add(`${entry}#${reference.id}`);
  }

  for (const [entry, anchors] of anchorsByEntry) {
    for (const anchor of anchors) {
      if (!referenced.has(`${entry}#${anchor.id}`)) {
        errors.push(`${entry}: アンカー "${anchor.id}" が索引から参照されていない`);
      }
    }
  }

  const placesById = new Map();
  for (const [entry, anchors] of anchorsByEntry) {
    for (const anchor of anchors) {
      const places = placesById.get(anchor.id) ?? [];
      places.push(entry);
      placesById.set(anchor.id, places);
    }
  }
  for (const [id, places] of placesById) {
    if (places.length > 1) {
      errors.push(`アンカーの id "${id}" が重複している（${locationList(places)}）`);
    }
  }

  return errors;
}

/**
 * entry の指す出力 HTML のファイル名．Markdown は同じ名前の .html になる．
 * @param {string} entry entry のパス
 * @returns {string}
 */
export function htmlNameOf(entry) {
  return path.basename(entry).replace(/\.md$/i, '.html');
}

/** vivliostyle.config.js の entry は文字列とオブジェクトの両方を取りうる */
function entryPath(entry) {
  if (typeof entry === 'string') {
    return entry;
  }
  return typeof entry?.path === 'string' ? entry.path : null;
}

/**
 * 本 1 冊分の原稿を読み，索引の参照を検査する．
 * 索引の原稿を持たない本では何も調べずに成功で終える．
 * 本テンプレートは書籍の性質を選ばず，索引の無い本も組めるためである．
 * @param {object} params
 * @param {string} params.repoRoot リポジトリのルート
 * @param {unknown[]} params.entries vivliostyle.config.js の entry
 * @returns {Promise<{skipped: boolean, indexEntry: string|null, anchorCount: number,
 *                    referenceCount: number, errors: string[]}>}
 */
export async function checkIndex({ repoRoot, entries }) {
  const errors = [];
  const sources = new Map();
  const entryByHtmlName = new Map();

  for (const raw of Array.isArray(entries) ? entries : []) {
    const entry = entryPath(raw);
    if (entry === null) {
      continue;
    }
    entryByHtmlName.set(htmlNameOf(entry), entry);
    if (!/\.md$/i.test(entry)) {
      /* 目次のように Markdown を持たない entry は走査の対象にしない */
      continue;
    }
    const filePath = path.join(repoRoot, entry);
    if (!fs.existsSync(filePath)) {
      errors.push(`${entry}: entry に並んでいる原稿が見つからない`);
      continue;
    }
    sources.set(entry, fs.readFileSync(filePath, 'utf-8'));
  }

  const indexEntries = [...sources]
    .filter(([, content]) => frontmatterClasses(content).includes(INDEX_CLASS))
    .map(([entry]) => entry);

  if (indexEntries.length === 0) {
    return { skipped: true, indexEntry: null, anchorCount: 0, referenceCount: 0, errors };
  }
  if (indexEntries.length > 1) {
    errors.push(
      `frontmatter の class: ${INDEX_CLASS} を持つ原稿が 2 つ以上ある`
      + `（${indexEntries.join('，')}）`,
    );
    return { skipped: false, indexEntry: null, anchorCount: 0, referenceCount: 0, errors };
  }

  const indexEntry = indexEntries[0];
  const anchorsByEntry = new Map();
  let references = [];
  for (const [entry, content] of sources) {
    const scanned = await scanMarkdown(content);
    if (scanned.anchors.length > 0) {
      anchorsByEntry.set(entry, scanned.anchors);
    }
    if (entry === indexEntry) {
      references = scanned.references;
    }
  }

  errors.push(...crossCheck({ anchorsByEntry, references, entryByHtmlName, indexEntry }));

  const anchorCount = [...anchorsByEntry.values()].reduce((sum, list) => sum + list.length, 0);
  return {
    skipped: false,
    indexEntry,
    anchorCount,
    referenceCount: references.length,
    errors,
  };
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const repoRoot = fileURLToPath(new URL('..', import.meta.url));
  const configUrl = pathToFileURL(path.join(repoRoot, 'vivliostyle.config.js'));
  const config = (await import(configUrl.href)).default;
  const result = await checkIndex({ repoRoot, entries: config.entry });

  if (result.errors.length > 0) {
    console.error('検査失敗 索引と本文のアンカーが食い違っている');
    for (const message of result.errors) {
      console.error(`  - ${message}`);
    }
    console.error('  詳細は docs/spec/index-page.md を参照．骨組みは npm run gen:index で作れる');
    process.exit(1);
  }

  if (result.skipped) {
    console.log(`ok class: ${INDEX_CLASS} の原稿が無いため索引の検査を省略する`);
  } else {
    console.log(
      `ok 索引の参照 ${result.referenceCount} 件と本文のアンカー ${result.anchorCount} 件が一致する`,
    );
  }
}
