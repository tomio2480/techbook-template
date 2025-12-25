module.exports = {
  title: '書籍タイトル',
  author: '著者名',
  language: 'ja',
  size: 'A5',
  theme: ['./config/themes/techbook/theme.css'],
  entry: [
    'src/chapters/00-preface.md',
    'src/chapters/01-introduction.md',
    'src/chapters/02-advanced.md',
  ],
  output: [
    'dist/book.pdf',
  ],
};
