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

  // .md を .html に変更
  config = config.replace(/\.md'/g, ".html'");
  config = config.replace(/\.md"/g, '.html"');

  fs.writeFileSync(configPath, config, 'utf-8');
  console.log('Updated vivliostyle.config.js to use HTML files');
}

// 元の設定に戻す
function restoreConfig() {
  let config = fs.readFileSync(configPath, 'utf-8');

  // .html を .md に戻す
  config = config.replace(/\.html'/g, ".md'");
  config = config.replace(/\.html"/g, '.md"');

  fs.writeFileSync(configPath, config, 'utf-8');
  console.log('Restored vivliostyle.config.js to use MD files');
}

const args = process.argv.slice(2);

if (args.includes('--restore')) {
  restoreConfig();
} else {
  processHtmlFiles();
  updateConfig();
  console.log('Line numbers added successfully.');
}
