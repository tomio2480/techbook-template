import fs from 'node:fs';
import { parse } from 'yaml';
import { VFM } from '@vivliostyle/vfm';
import { spectroscope } from '@u1f992/rehype-spectroscope';
import { joinCjkLineBreaksPlugin } from './scripts/join-cjk-line-breaks.mjs';
import { injectColophonPlugin } from './scripts/inject-colophon.mjs';
import { injectIsdnPlugin } from './scripts/inject-isdn.mjs';
import { DEFAULT_BARCODE_PATH, isRegularFile } from './scripts/check-isdn.mjs';

/* 奥付へ流し込む著者紹介・正誤表 URL を config/book.yaml から読み込む */
const bookYaml =
  parse(fs.readFileSync(new URL('./config/book.yaml', import.meta.url), 'utf-8')) ?? {};

/* 奥付・裏表紙へ流し込む ISDN の発行情報を config/isdn.yaml から読み込む */
const isdnYamlUrl = new URL('./config/isdn.yaml', import.meta.url);
const isdnYaml = fs.existsSync(isdnYamlUrl)
  ? (parse(fs.readFileSync(isdnYamlUrl, 'utf-8')) ?? {})
  : {};
/* バーコード画像の有無はここで確定し，プラグインへは参照情報だけ渡す */
const isdnBarcodePath = isdnYaml.issued?.barcode || DEFAULT_BARCODE_PATH;
if (!isdnBarcodePath.startsWith('src/')) {
  /* 生成 HTML からの相対参照が組めないパスは黙って壊さず知らせる */
  console.warn(`config/isdn.yaml: issued.barcode は src/ 配下のパスを想定している（現在 ${isdnBarcodePath}）`);
}
const isdnBarcode = {
  /* 生成 HTML は src/chapters/ に置かれるため 1 階層上がって参照する */
  src: isdnBarcodePath.replace(/^src\//, '../'),
  exists: isRegularFile(new URL(`./${isdnBarcodePath}`, import.meta.url)),
};

export default {
  language: 'ja',
  size: 'JIS-B5',
  theme: ['./config/themes/techbook/theme.css'],
  entry: [
    'src/chapters/cover.md',
    'src/chapters/title-page.md',
    'src/chapters/00-preface.md',
    'src/chapters/toc.html',
    'src/chapters/01-introduction.md',
    'src/chapters/02-advanced.md',
    'src/chapters/03-math-and-figures.md',
    'src/chapters/96-answers.md',
    'src/chapters/97-appendix.md',
    'src/chapters/98-afterword.md',
    'src/chapters/99-colophon.md',
    'src/chapters/back-cover.md',
  ],
  output: [
    'dist/book.pdf',
  ],
  documentProcessor: (opts, meta) =>
    VFM(opts, meta)
      .use(joinCjkLineBreaksPlugin)
      .use(injectColophonPlugin, { authors: bookYaml.authors, errata: bookYaml.errata })
      .use(injectIsdnPlugin, {
        number: isdnYaml.issued?.number,
        barcode: isdnBarcode,
        /* 裏表紙の情報ブロック（コード行・発行者）は申請情報から引く */
        application: {
          cCode: isdnYaml.application?.c_code,
          price: isdnYaml.application?.price,
          circle: isdnYaml.application?.circle,
        },
      })
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
