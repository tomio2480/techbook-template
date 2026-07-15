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
  documentProcessor: (opts, meta) =>
    VFM(opts, meta)
      .use(joinCjkLineBreaksPlugin),
  vfm: {
    hardLineBreaks: false,
  },
};
