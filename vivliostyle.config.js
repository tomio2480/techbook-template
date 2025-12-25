module.exports = {
  title: '書籍タイトル',
  author: '著者名',
  language: 'ja',
  size: 'A5',
  theme: ['./config/themes/techbook/theme.css'],
  entry: [
    'src/chapters/00-preface.md',
    { rel: 'contents', theme: './config/themes/techbook/theme.css' },
    'src/chapters/01-introduction.md',
    'src/chapters/02-advanced.md',
    'src/chapters/03-math-and-figures.md',
  ],
  output: [
    'dist/book.pdf',
  ],
  vfm: {
    math: true,
    hardLineBreaks: false,
  },
  toc: {
    title: '目次',
    depth: 3,
  },
};
