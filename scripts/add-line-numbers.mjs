#!/usr/bin/env node
/**
 * コードブロックに行番号を追加するスクリプト
 * 生成された HTML の <pre class="language-xxx"> に line-numbers クラスを追加し、
 * .line-numbers-rows 要素を挿入する
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

  // toc.html の nav 内を置換
  tocContent = tocContent.replace(
    /<nav[^>]*role="doc-toc"[^>]*>[\s\S]*?<\/nav>/,
    `<nav role="doc-toc">${tocInner}</nav>`
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

const args = process.argv.slice(2);

if (args.includes('--restore')) {
  restoreConfig();
} else {
  updateTocFromIndex();
  removeIndexHtml();
  processHtmlFiles();
  updateConfig();
  console.log('Line numbers added successfully.');
}
