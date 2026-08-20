---
class: index
---

<!-- 索引の原稿．見出し語と参照先だけを書き，ページ番号は書かない．
     ページ番号はテーマ CSS の target-counter が組版の結果から解決する．

     骨組みは npm run gen:index で作れる．本文のアンカーを集めて
     区分ごとに並べたものが標準出力へ出るので，取捨と並べ替えのうえ
     下の <div class="index-body"> の中へ貼る．載せる語を選ぶのは執筆者である．

     本文側には，索引に載せる語の直前へ次の形のアンカーを置く．
     <a id="idx-svg-1" data-index="SVG"></a>
     和文の語には読みを添える．五十音の区分と並び順に使う．
     <a id="idx-formula-1" data-index="数式" data-yomi="すうしき"></a>

     参照の食い違いは npm run check:index が調べる（npm run build の前段）．
     索引を置かない本では，この原稿を消して vivliostyle.config.js の
     entry から外す．検査もビルドもそのまま通る．

     要求・要件は docs/spec/index-page.md を参照． -->

# 索引

<div class="index-body">
<p class="index-group">英字</p>
<ul class="index-list">
<li><span class="index-term">SVG</span><a class="index-page" href="02-advanced.html#idx-svg-1"></a><a class="index-page" href="03-math-and-figures.html#idx-svg-2"></a></li>
</ul>
<p class="index-group">か行</p>
<ul class="index-list">
<li><span class="index-term">コードブロック</span><a class="index-page" href="01-introduction.html#idx-code-block-1"></a></li>
</ul>
<p class="index-group">さ行</p>
<ul class="index-list">
<li><span class="index-term">数式</span><a class="index-page" href="03-math-and-figures.html#idx-formula-1"></a></li>
</ul>
</div>
