/* 表紙単体の入稿データ（dist/cover.pdf・dist/back-cover.pdf）のビルド設定
 *
 * 電子書籍用の設定（vivliostyle.config.js）を単一の出所とし，
 * 表紙 1 枚だけを組むための差分（エントリ・出力先・目次の無効化）を上書きする。
 * 塗り足しは紙入稿用のスタイル（config/themes/techbook/print.css）を
 * vivliostyle build の --style で渡して与える。
 *
 * どちらの表紙を組むかは環境変数 COVER_TARGET で受け取る。
 * 1 回のビルドが 1 つの PDF を作るため、2 つの表紙は 2 回に分けて組む。
 * 分けて組むのは印刷所の指定による。表 1 と表 4 を別ファイルにすると、
 * 背幅を両者から半分ずつ取ってもらえる（docs/spec/cover.md）。
 *
 * 単体で `vivliostyle build -c vivliostyle.cover.config.js` を実行するときは，
 * 環境変数 COVER_TARGET へ cover か back-cover を与える。
 * 与えないと設定の読み込みで失敗し，ビルドは始まらない。
 * 与えて実行しても塗り足しは付かず，ページ数と寸法の検査も行われない。
 * 入稿用の成果物は必ず `npm run build:cover` で作ること。
 */

import baseConfig from './vivliostyle.config.js';
import { resolveCoverTarget } from './scripts/build-cover.mjs';

const target = resolveCoverTarget(process.env.COVER_TARGET);

export default {
  ...baseConfig,
  entry: [target.entry],
  output: [target.output],
  /* 表紙だけを組むため見出しの一覧を要さない。
     有効なままだと目次の HTML が作業ツリーへ生まれる */
  toc: false,
};
