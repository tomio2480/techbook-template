/* 紙入稿用 PDF（dist/book-print.pdf）のビルド設定
 *
 * 電子書籍用の設定（vivliostyle.config.js）を単一の出所とし，
 * 面付けにかかわる差分（MEMO ページの追加・出力先）だけを上書きする。
 * 面付け用の追加スタイル（config/themes/techbook/print.css）は
 * vivliostyle build の --style で渡す。
 *
 * MEMO ページを含むエントリ構成は，各原稿のページ数を実測してから決まる。
 * 実測とエントリ構成の決定は scripts/build-print.mjs が行い，
 * 結果を PRINT_PLAN が指す JSON で受け渡す。
 *
 * 単体で `vivliostyle build -c vivliostyle.print.config.js` を実行しても
 * 動くが，行番号の付与も面付けも行われない。
 * 入稿用の成果物は必ず `npm run build:print` で作ること。
 */

import fs from 'node:fs';
import baseConfig from './vivliostyle.config.js';

const planPath = process.env.PRINT_PLAN;
const plan =
  planPath && fs.existsSync(planPath)
    ? JSON.parse(fs.readFileSync(planPath, 'utf-8'))
    : null;

export default {
  ...baseConfig,
  entry: plan?.entry ?? baseConfig.entry,
  output: [
    'dist/book-print.pdf',
  ],
};
