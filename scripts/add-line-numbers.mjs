#!/usr/bin/env node
/**
 * コードブロックに行番号を追加するスクリプト
 * 生成された HTML の <pre class="language-xxx"> に line-numbers クラスを追加し、
 * .line-numbers-rows 要素を挿入する
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const chaptersDir = path.join(__dirname, '..', 'src', 'chapters');
const configPath = path.join(__dirname, '..', 'vivliostyle.config.js');
const indexPath = path.join(__dirname, '..', 'index.html');
const tocPath = path.join(chaptersDir, 'toc.html');

// HTML ファイルを処理
function processHtmlFiles() {
  const files = fs.readdirSync(chaptersDir).filter(f => f.endsWith('.html'));

  for (const file of files) {
    const filePath = path.join(chaptersDir, file);
    let content = fs.readFileSync(filePath, 'utf-8');

    // 既に処理済みの場合はスキップ
    if (content.includes('line-numbers-rows')) {
      console.log(`Already processed: ${file}`);
      continue;
    }

    // <pre class="language-xxx"> を <pre class="language-xxx line-numbers"> に変更し、
    // 行番号を追加
    content = content.replace(
      /<pre class="language-([^"]+)"([^>]*)><code class="language-[^"]+">([\s\S]*?)<\/code><\/pre>/g,
      (match, lang, attrs, code) => {
        // コードの行数をカウント
        const lines = code.split('\n');
        const lineCount = lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;

        // 行番号の span を生成（番号を直接テキストとして挿入）
        const lineNumbersRows = Array.from({ length: lineCount }, (_, i) => `<span>${i + 1}</span>`).join('');

        return `<pre class="language-${lang} line-numbers"${attrs}><code class="language-${lang}">${code}</code><span class="line-numbers-rows">${lineNumbersRows}</span></pre>`;
      }
    );

    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`Processed: ${file}`);
  }

  return files;
}

// vivliostyle.config.js を更新して HTML を直接参照
function updateConfig() {
  let config = fs.readFileSync(configPath, 'utf-8');

  // src/chapters/ 内の .md を .html に変更（toc.html は既に HTML なので除外）
  config = config.replace(/src\/chapters\/(?!toc\.)([^'"]*)\.md'/g, "src/chapters/$1.html'");
  config = config.replace(/src\/chapters\/(?!toc\.)([^'"]*)\.md"/g, 'src/chapters/$1.html"');

  // toc 設定を削除（2回目のビルドでは index.html を生成しない）
  config = config.replace(/,\s*toc:\s*\{[^}]*\}/s, '');

  fs.writeFileSync(configPath, config, 'utf-8');
  console.log('Updated vivliostyle.config.js to use HTML files');
}

// ビルド中断フェイルセーフ用のマーカーファイルを書き込む
export function writeBuildMarker(distDir) {
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }
  fs.writeFileSync(path.join(distDir, '.build-marker'), new Date().toISOString(), 'utf-8');
  console.log('Wrote dist/.build-marker');
}

// 元の設定に戻す
function restoreConfig() {
  let config = fs.readFileSync(configPath, 'utf-8');

  // src/chapters/ 内の .html を .md に戻す（toc.html は除外）
  config = config.replace(/src\/chapters\/(?!toc\.)([^'"]*)\.html'/g, "src/chapters/$1.md'");
  config = config.replace(/src\/chapters\/(?!toc\.)([^'"]*)\.html"/g, 'src/chapters/$1.md"');

  // toc 設定を復元
  if (!config.includes('toc:')) {
    // 末尾の }; の前に toc 設定を追加
    config = config.replace(/,\s*\n(\s*}\s*;\s*)$/, `,
  toc: {
    sectionDepth: 3,
  },
$1`);
  }

  fs.writeFileSync(configPath, config, 'utf-8');
  console.log('Restored vivliostyle.config.js to use MD files');
}

// ネストされた li 要素を正しく削除するためのヘルパー関数
function removeLiContainingHref(html, hrefPattern) {
  const regex = new RegExp(`href="${hrefPattern}"`, 'g');
  let result = html;
  let match;

  // hrefPattern を含む位置を見つける
  while ((match = regex.exec(html)) !== null) {
    const hrefPos = match.index;

    // その位置から逆方向に <li を探す
    let liStart = -1;
    for (let i = hrefPos; i >= 0; i--) {
      if (html.substring(i, i + 3) === '<li') {
        liStart = i;
        break;
      }
    }

    if (liStart === -1) continue;

    // liStart から正方向に対応する </li> を探す（ネストを考慮）
    let depth = 0;
    let liEnd = -1;
    for (let i = liStart; i < html.length; i++) {
      if (html.substring(i, i + 3) === '<li') {
        depth++;
      } else if (html.substring(i, i + 5) === '</li>') {
        depth--;
        if (depth === 0) {
          liEnd = i + 5;
          break;
        }
      }
    }

    if (liEnd !== -1) {
      result = result.substring(0, liStart) + result.substring(liEnd);
      // 正規表現のインデックスをリセット
      regex.lastIndex = 0;
      html = result;
    }
  }

  return result;
}

// タグ名直後の文字が、属性・閉じ括弧・空白のいずれかであることを確認する。
// 前方一致だけでは <olfoo> や <li-foo> のような無関係なタグにも
// マッチしてしまうため、タグ名の境界を保証するのに使う
const isTagNameBoundary = ch =>
  ch === undefined || ch === ' ' || ch === '>' || ch === '\n' || ch === '\t' || ch === '\r';

// HTML パーサは使わず文字列走査のみで実装している（既存の removeLiContainingHref
// と同じ方針）。toc.html は本スクリプトが生成する既知の構造のみを想定している。
function extractOlContent(html) {
  let start = html.indexOf('<ol');
  while (start !== -1 && !isTagNameBoundary(html[start + 3])) {
    start = html.indexOf('<ol', start + 3);
  }
  if (start === -1) return null;
  const openTagEnd = html.indexOf('>', start);
  if (openTagEnd === -1) return null;

  let depth = 1;
  let i = openTagEnd + 1;
  while (i < html.length && depth > 0) {
    if (html.substring(i, i + 3) === '<ol' && isTagNameBoundary(html[i + 3])) {
      depth++;
      i += 3;
      continue;
    }
    if (html.substring(i, i + 5) === '</ol>') {
      depth--;
      if (depth === 0) break;
      i += 5;
      continue;
    }
    i++;
  }

  // </ol> が不足している場合、depth が 0 に戻らずループを抜ける。
  // 壊れた部分文字列を返さず、パース失敗として null を返す
  return depth === 0 ? html.substring(openTagEnd + 1, i) : null;
}

// html 中のトップレベル <li>...</li> 群を、ネストを考慮して分割する
function splitTopLevelLis(html) {
  const lis = [];
  let i = 0;
  while (i < html.length) {
    const liStart = html.indexOf('<li', i);
    if (liStart === -1) break;
    if (!isTagNameBoundary(html[liStart + 3])) {
      i = liStart + 3;
      continue;
    }

    let depth = 1;
    let j = liStart + 3;
    while (j < html.length && depth > 0) {
      if (html.substring(j, j + 3) === '<li' && isTagNameBoundary(html[j + 3])) {
        depth++;
        j += 3;
        continue;
      }
      if (html.substring(j, j + 5) === '</li>') {
        depth--;
        j += 5;
        if (depth === 0) break;
        continue;
      }
      j++;
    }

    lis.push(html.substring(liStart, j));
    i = j;
  }
  return lis;
}

// HTML タグを除去する。単発の置換ではネストした断片が結合して新たな
// タグを再構成してしまう可能性があるため、変化がなくなるまで反復適用する
export function stripHtmlTags(html) {
  let previous;
  let result = html;
  do {
    previous = result;
    result = result.replace(/<[^>]*>/g, '');
  } while (result !== previous);
  return result;
}

// 1 件の <li>...</li> 文字列から { href, level, text, children, rawOuterHtml } を組み立てる
function parseLiNode(liHtml) {
  const openTagMatch = liHtml.match(/^<li\b([^>]*)>/);
  const levelMatch = openTagMatch ? openTagMatch[1].match(/data-section-level="(\d+)"/) : null;
  const level = levelMatch ? Number(levelMatch[1]) : null;

  // 自ノード直下の内容（子 <ol> を除く）を先に切り出してから <a> を探す。
  // liHtml 全体に対して <a> を検索すると、子ノードが持つ <a> を誤って
  // 自ノードのものとして拾ってしまうため
  const innerStart = openTagMatch ? openTagMatch[0].length : 0;
  const innerEndIndex = liHtml.lastIndexOf('</li>');
  const inner = liHtml.substring(innerStart, innerEndIndex === -1 ? liHtml.length : innerEndIndex);
  const olIndex = inner.indexOf('<ol');
  const ownHtml = olIndex !== -1 ? inner.substring(0, olIndex) : inner;
  const childrenHtml = olIndex !== -1 ? inner.substring(olIndex) : '';

  const anchorMatch = ownHtml.match(/<a([\s\S]*?)>([\s\S]*?)<\/a\s*>/);
  const hrefMatch = anchorMatch ? anchorMatch[1].match(/href=["']([^"']*)["']/) : null;
  const href = hrefMatch ? hrefMatch[1] : null;
  const text = anchorMatch
    ? anchorMatch[2].replace(/\s+/g, ' ').trim()
    : stripHtmlTags(ownHtml).replace(/\s+/g, ' ').trim();

  const children = childrenHtml.includes('<ol') ? parseListItems(childrenHtml) : [];

  return { href, level, text, children, rawOuterHtml: liHtml };
}

// nav 内側などの HTML から、トップレベル <ol> 直下の <li> 群を再帰的に解析する
export function parseListItems(html) {
  const olContent = extractOlContent(html);
  if (olContent === null) return [];
  return splitTopLevelLis(olContent).map(parseLiNode);
}

// href からアンカー（# 以降）を取り除いて比較用に正規化する
function normalizeHref(href) {
  if (!href) return href;
  return href.split('#')[0];
}

// 自動生成された木（auto）と既存の toc.html の木（old）をマージする。2 パスで行う。
// - 1 パス目: href・テキストが完全一致するノードを優先的に確保する（未編集の見出し）。
//   同一ファイル内に新規見出しが挿入・削除されても、未編集の見出しが位置ずれにより
//   誤って別ノードとマッチしてしまうのを防ぐ
// - 2 パス目: 1 パス目で確保されなかった残りについて、位置が一致すれば old のテキストを
//   引き継ぎ（リライト保持）、ずれていれば href の一致で old 側から探す
// - old 側にのみ残った項目は手動追加項目として末尾に rawOuterHtml のまま残す
export function mergeTocTrees(autoTree, oldTree) {
  const oldRemaining = oldTree.slice();
  const matchedOldIndices = new Set();

  const exactMatches = autoTree.map(autoNode => {
    const autoHref = normalizeHref(autoNode.href);
    if (!autoHref) return null;
    const idx = oldRemaining.findIndex((node, index) =>
      node && !matchedOldIndices.has(index) &&
      normalizeHref(node.href) === autoHref && node.text === autoNode.text
    );
    if (idx === -1) return null;
    matchedOldIndices.add(idx);
    return oldRemaining[idx];
  });

  const merged = autoTree.map((autoNode, i) => {
    let matched = exactMatches[i];
    const autoHref = normalizeHref(autoNode.href);

    if (!matched && autoHref) {
      // href を持たないノード同士は同一性の根拠がないため、マッチングの対象にしない
      if (oldRemaining[i] && !matchedOldIndices.has(i) && normalizeHref(oldRemaining[i].href) === autoHref) {
        matched = oldRemaining[i];
        matchedOldIndices.add(i);
      } else {
        const idx = oldRemaining.findIndex(
          (node, index) => node && !matchedOldIndices.has(index) && normalizeHref(node.href) === autoHref
        );
        if (idx !== -1) {
          matched = oldRemaining[idx];
          matchedOldIndices.add(idx);
        }
      }
    }

    const text = matched ? matched.text : autoNode.text;
    const oldChildren = matched ? matched.children : [];

    return {
      href: autoNode.href,
      level: autoNode.level,
      text,
      children: mergeTocTrees(autoNode.children, oldChildren),
      rawOuterHtml: null,
    };
  });

  const manualLeftovers = oldRemaining
    .filter((node, index) => node !== null && !matchedOldIndices.has(index))
    .map(node => ({ ...node, isManual: true }));

  return [...merged, ...manualLeftovers];
}

// 既存 toc.html の nav 内側に手動編集された見出し（<h1>〜<h6>）があれば
// それを保持し、なければデフォルトの「目次」見出しを使う
export function extractHeadingOrDefault(oldNavInner) {
  const headingMatch = oldNavInner ? oldNavInner.match(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/) : null;
  return headingMatch ? headingMatch[0].trim() : '<h2>目次</h2>';
}

// マージ済みの木を <ol>...</ol> の HTML 文字列に戻す
export function serializeTocTree(tree) {
  if (tree.length === 0) return '';
  const items = tree.map(serializeTocNode).join('\n');
  return `<ol>\n${items}\n</ol>`;
}

function serializeTocNode(node) {
  if (node.isManual) {
    return node.rawOuterHtml;
  }
  const levelAttr = node.level !== null ? ` data-section-level="${node.level}"` : '';
  const anchorHtml = node.href ? `<a href="${node.href}">${node.text}</a>` : node.text;
  const childrenHtml = node.children && node.children.length > 0 ? serializeTocTree(node.children) : '';
  return `<li${levelAttr}>${anchorHtml}${childrenHtml}</li>`;
}

// index.html から目次を抽出して toc.html に挿入
function updateTocFromIndex() {
  if (!fs.existsSync(indexPath) || !fs.existsSync(tocPath)) {
    console.log('index.html or toc.html not found, skipping TOC update');
    return;
  }

  const indexContent = fs.readFileSync(indexPath, 'utf-8');
  let tocContent = fs.readFileSync(tocPath, 'utf-8');

  // index.html から <nav role="doc-toc"> の中身を抽出
  const tocMatch = indexContent.match(/<nav[^>]*role="doc-toc"[^>]*>([\s\S]*?)<\/nav>/);
  if (!tocMatch) {
    console.log('TOC not found in index.html');
    return;
  }

  // 目次の内容を取得し、タイトルを「目次」に変更
  let tocInner = tocMatch[1];
  tocInner = tocInner.replace(/<h2>Table of Contents<\/h2>/, '<h2>目次</h2>');

  // パスを相対パスに変換（src/chapters/ を削除）
  tocInner = tocInner.replace(/href="src\/chapters\//g, 'href="');

  // 表紙、目次自体、あとがき、奥付の項目を削除
  tocInner = removeLiContainingHref(tocInner, 'cover\\.html[^"]*');
  tocInner = removeLiContainingHref(tocInner, 'toc\\.html');
  tocInner = removeLiContainingHref(tocInner, '98-afterword\\.html[^"]*');
  tocInner = removeLiContainingHref(tocInner, '99-colophon\\.html[^"]*');


  // アンカー（#以降）を削除してファイル名のみにする（target-counter の解決を助ける）
  tocInner = tocInner.replace(/href="([^"#]+)#[^"]*"/g, 'href="$1"');

  // 既存 toc.html 側（手動編集済みのテキストを含みうる）の nav 内側を解析
  const oldTocMatch = tocContent.match(/<nav[^>]*role="doc-toc"[^>]*>([\s\S]*?)<\/nav>/);
  const oldTree = oldTocMatch ? parseListItems(oldTocMatch[1]) : [];
  const autoTree = parseListItems(tocInner);
  const mergedTree = mergeTocTrees(autoTree, oldTree);
  const mergedOl = serializeTocTree(mergedTree);
  const heading = extractHeadingOrDefault(oldTocMatch ? oldTocMatch[1] : null);

  // toc.html の nav 内を、手動編集済みテキストを保持したままマージ結果で置換
  tocContent = tocContent.replace(
    /<nav[^>]*role="doc-toc"[^>]*>[\s\S]*?<\/nav>/,
    `<nav role="doc-toc">\n  ${heading}\n  ${mergedOl}\n</nav>`
  );

  fs.writeFileSync(tocPath, tocContent, 'utf-8');
  console.log('Updated toc.html with contents from index.html');
}

// index.html を削除（PDF に含めないため）
function removeIndexHtml() {
  if (fs.existsSync(indexPath)) {
    fs.unlinkSync(indexPath);
    console.log('Removed index.html');
  }
}

// テストからの import 時には実行せず、CLI から直接起動された場合のみ実行する
const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  const args = process.argv.slice(2);

  if (args.includes('--restore')) {
    restoreConfig();
  } else {
    updateTocFromIndex();
    removeIndexHtml();
    processHtmlFiles();
    updateConfig();
    writeBuildMarker(path.join(__dirname, '..', 'dist'));
    console.log('Line numbers added successfully.');
  }
}
