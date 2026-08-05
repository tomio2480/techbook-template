import fs from 'node:fs';
import { parse } from 'yaml';
import { VFM } from '@vivliostyle/vfm';
import { spectroscope } from '@u1f992/rehype-spectroscope';
import { joinCjkLineBreaksPlugin } from './scripts/join-cjk-line-breaks.mjs';
import { injectColophonPlugin } from './scripts/inject-colophon.mjs';

/* 奥付へ流し込む著者紹介・正誤表 URL を config/book.yaml から読み込む */
const bookYaml =
  parse(fs.readFileSync(new URL('./config/book.yaml', import.meta.url), 'utf-8')) ?? {};

export default {
  language: 'ja',
  size: 'JIS-B5',
  theme: ['./config/themes/techbook/theme.css'],
  entry: [
    'src/chapters/cover.md',
    'src/chapters/00-preface.md',
    'src/chapters/toc.html',
    'src/chapters/01-introduction.md',
    'src/chapters/02-advanced.md',
    'src/chapters/03-math-and-figures.md',
    'src/chapters/96-answers.md',
    'src/chapters/97-appendix.md',
    'src/chapters/98-afterword.md',
    'src/chapters/99-colophon.md',
  ],
  output: [
    'dist/book.pdf',
  ],
  documentProcessor: (opts, meta) =>
    VFM(opts, meta)
      .use(joinCjkLineBreaksPlugin)
      .use(injectColophonPlugin, { authors: bookYaml.authors, errata: bookYaml.errata })
      .use(spectroscope, {
        languages: [
          'javascript', 'typescript', 'python', 'rust', 'go', 'bash',
          'json', 'yaml', 'markup', 'css', 'markdown', 'c', 'cpp'
        ],
      }),
  vfm: {
    math: true,
    hardLineBreaks: false,
  },
  toc: {
    sectionDepth: 3,
  },
};
