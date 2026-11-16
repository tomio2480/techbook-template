// 装飾バリアント見本の専用ビルド設定（Issue #22）
// 本文（vivliostyle.config.js / dist/book.pdf）には影響しない。
import { VFM } from '@vivliostyle/vfm';
import { joinCjkLineBreaksPlugin } from './scripts/join-cjk-line-breaks.mjs';

export default {
  language: 'ja',
  size: 'JIS-B5',
  theme: ['./config/themes/techbook/design-variants.css'],
  entry: [
    'src/design-samples/design-samples.md',
  ],
  output: [
    'dist/design-samples.pdf',
  ],
  /* 中間 HTML を原稿の隣へ出す（vivliostyle.config.js と同じ理由） */
  workspaceDir: '.',
  documentProcessor: (opts, meta) =>
    VFM(opts, meta)
      .use(joinCjkLineBreaksPlugin),
  vfm: {
    hardLineBreaks: false,
  },
};
