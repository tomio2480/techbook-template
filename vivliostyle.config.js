import { VFM } from '@vivliostyle/vfm';
import { spectroscope } from '@u1f992/rehype-spectroscope';

export default {
  language: 'ja',
  size: 'A5',
  theme: ['./config/themes/techbook/theme.css'],
  entry: [
    'src/chapters/cover.md',
    'src/chapters/00-preface.md',
    'src/chapters/toc.html',
    'src/chapters/01-introduction.md',
    'src/chapters/02-advanced.md',
    'src/chapters/03-math-and-figures.md',
    'src/chapters/98-afterword.md',
    'src/chapters/99-colophon.md',
  ],
  output: [
    'dist/book.pdf',
  ],
  documentProcessor: (opts, meta) =>
    VFM(opts, meta).use(spectroscope, {
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
