---
body:
  style: "counter-set: chapter 0;"
---

<section class="chapter-opening variant-a">

<p class="sample-label">章扉 A 案: 現行改良（三角バッジを基調色ベタに、タイトル下へ短罫線）</p>

<p class="chapter-number">1</p>
<p class="chapter-title">装飾バリアント見本</p>

<div class="chapter-summary">

この扉は A 案である。現行レイアウトを踏襲しつつ、右上の三角バッジを基調色のベタ塗りに変更し、章タイトルの下へ短い罫線を加えた。グレースケール変換ではバッジが濃グレーになり、エッジは明瞭なまま保たれる。

</div>

<div class="chapter-topics">

<p class="chapter-topics-title">この章で学ぶこと</p>

<ul>
<li>章扉ページの装飾バリアント</li>
<li>見出し・枠ものの装飾バリアント</li>
<li>グレースケール変換時の見え方</li>
</ul>

</div>

</section>

<section class="chapter-opening variant-b">

<p class="sample-label">章扉 B 案: 上部横帯＋白抜き章番号（絶対配置を使わない通常フロー）</p>

<p class="chapter-number">1</p>
<p class="chapter-title">装飾バリアント見本</p>

<div class="chapter-summary">

この扉は B 案である。ページ上部に基調色の横帯を置き、帯内へ「第 N 章」を白抜きで表示する。章タイトルは帯の下で左揃えとし、左罫線を添えた。絶対配置を使わないため、PDF タグ付けの読み順解析に最も安全な構成である。

</div>

<div class="chapter-topics">

<p class="chapter-topics-title">この章で学ぶこと</p>

<ul>
<li>章扉ページの装飾バリアント</li>
<li>見出し・枠ものの装飾バリアント</li>
<li>グレースケール変換時の見え方</li>
</ul>

</div>

</section>

<section class="chapter-opening variant-c">

<p class="sample-label">章扉 C 案: 超大サイズ淡グレー章番号のミニマル案（色に依存しない）</p>

<p class="chapter-number">1</p>
<p class="chapter-title">装飾バリアント見本</p>

<div class="chapter-summary">

この扉は C 案である。中央に超大サイズの淡グレー章番号を置き、その上へ「CHAPTER」の欧文ラベルを添えた。章タイトルは細い罫線で区切って配置する。色をまったく使わずに成立するため、グレースケール印刷と完全に等価な見た目になる。

</div>

<div class="chapter-topics">

<p class="chapter-topics-title">この章で学ぶこと</p>

<ul>
<li>章扉ページの装飾バリアント</li>
<li>見出し・枠ものの装飾バリアント</li>
<li>グレースケール変換時の見え方</li>
</ul>

</div>

</section>

# 装飾バリアント見本

本章は書籍要素の装飾バリアントを見比べるための見本である。各要素の直前にあるグレーのラベルが案の識別子を示す。比較の基準として、案を適用しない現行スタイルも併置する。

## 節見出し（h2）のバリアント

この見出し自体が現行スタイル（左ボーダー 4px）である。以下に 3 案を示す。

<p class="sample-label">h2 A 案: 左ボーダー太化＋薄グレー背景帯</p>

<h2 class="variant-a">実践的な組版テクニック</h2>

見出し直後の本文はこのように続く。背景帯により見出しの領域が明確になる。

<p class="sample-label">h2 B 案: 節番号を白抜きバッジ化＋下罫線</p>

<h2 class="variant-b">実践的な組版テクニック</h2>

見出し直後の本文はこのように続く。番号バッジが視線の起点になる。

<p class="sample-label">h2 C 案: 上細線・下太線の二本線（グレースケール完全対応）</p>

<h2 class="variant-c">実践的な組版テクニック</h2>

見出し直後の本文はこのように続く。色を使わず線の太さだけで階層を示す。

## 項見出し（h3）のバリアント

### 現行スタイルの項見出し

この見出しが現行スタイル（装飾なし）である。以下に 3 案を示す。

<p class="sample-label">h3 A 案: 先頭に基調色の ■ 記号</p>

<h3 class="variant-a">コードの読みやすさを高める</h3>

見出し直後の本文はこのように続く。

<p class="sample-label">h3 B 案: 短い左ボーダー</p>

<h3 class="variant-b">コードの読みやすさを高める</h3>

見出し直後の本文はこのように続く。

<p class="sample-label">h3 C 案: 下点線（h2 の実線と線種で差別化）</p>

<h3 class="variant-c">コードの読みやすさを高める</h3>

見出し直後の本文はこのように続く。

## 章まとめ枠（chapter-recap）のバリアント

章まとめ枠は新設要素であり、現行スタイルは存在しない。章末の「まとめ」節で要点を列挙する用途を想定する。

<p class="sample-label">まとめ A 案: タイトル帯型（帯は基調色、白抜き文字）</p>

<div class="chapter-recap variant-a">
<p class="chapter-recap-title">この章のまとめ</p>
<ul>
<li>装飾は意味トークン経由で配色し、パレット差し替えに追従させる</li>
<li>グレースケール判別は罫線・ラベル・明度差で担保する</li>
<li>PDF タグ付けへ配慮し、本文の絶対配置を増やさない</li>
</ul>
</div>

<p class="sample-label">まとめ B 案: 二重罫線枠（背景なし、グレースケール完全対応）</p>

<div class="chapter-recap variant-b">
<p class="chapter-recap-title">この章のまとめ</p>
<ul>
<li>装飾は意味トークン経由で配色し、パレット差し替えに追従させる</li>
<li>グレースケール判別は罫線・ラベル・明度差で担保する</li>
<li>PDF タグ付けへ配慮し、本文の絶対配置を増やさない</li>
</ul>
</div>

<p class="sample-label">まとめ C 案: 薄グレー地＋チェックリスト風</p>

<div class="chapter-recap variant-c">
<p class="chapter-recap-title">この章のまとめ</p>
<ul>
<li>装飾は意味トークン経由で配色し、パレット差し替えに追従させる</li>
<li>グレースケール判別は罫線・ラベル・明度差で担保する</li>
<li>PDF タグ付けへ配慮し、本文の絶対配置を増やさない</li>
</ul>
</div>

## コラム枠のバリアント

<p class="sample-label">コラム 現行スタイル</p>

<div class="column">
<p class="column-title">Vivliostyle と CSS 組版</p>
<p>Vivliostyle は CSS 組版に基づくオープンソースの組版エンジンである。W3C の CSS Paged Media 仕様に準拠しており、ブラウザの描画エンジンを利用して高品質な PDF を生成できる。</p>
</div>

<p class="sample-label">コラム A 案: 現行踏襲＋タイトルを帯化</p>

<div class="column variant-a">
<p class="column-title">Vivliostyle と CSS 組版</p>
<p>Vivliostyle は CSS 組版に基づくオープンソースの組版エンジンである。W3C の CSS Paged Media 仕様に準拠しており、ブラウザの描画エンジンを利用して高品質な PDF を生成できる。</p>
</div>

<p class="sample-label">コラム B 案: 上下太罫線のみの雑誌風（背景色に依存しない）</p>

<div class="column variant-b">
<p class="column-title">Vivliostyle と CSS 組版</p>
<p>Vivliostyle は CSS 組版に基づくオープンソースの組版エンジンである。W3C の CSS Paged Media 仕様に準拠しており、ブラウザの描画エンジンを利用して高品質な PDF を生成できる。</p>
</div>

<p class="sample-label">コラム C 案: 角丸背景＋ラベルタブ</p>

<div class="column variant-c">
<p class="column-title">Vivliostyle と CSS 組版</p>
<p>Vivliostyle は CSS 組版に基づくオープンソースの組版エンジンである。W3C の CSS Paged Media 仕様に準拠しており、ブラウザの描画エンジンを利用して高品質な PDF を生成できる。</p>
</div>

## Tips・注釈・警告枠のバリアント

3 種の枠は本文中で混在するため、種別どうしの判別しやすさを主眼に、案ごとに 3 種セットで示す。

<p class="sample-label">現行スタイル（tips / note / warning）</p>

<div class="tips">
<p class="tips-title">Tips: ビルドの高速化</p>
<p>執筆中は対象章だけを entry に残すと、ビルド時間を大幅に短縮できる。</p>
</div>

<div class="note">
<p>本文の理解を補う周辺情報は note に記載する。読み飛ばしても本筋の理解に支障がない情報を置く。</p>
</div>

<div class="warning">
<p>ビルド前に必ず原稿を保存する。未保存の変更はビルド結果へ反映されない。</p>
</div>

<p class="sample-label">A 案: 左ボーダー統一系（線種・太さ 3 段階で種別を区別）</p>

<div class="tips variant-a">
<p class="tips-title">Tips: ビルドの高速化</p>
<p>執筆中は対象章だけを entry に残すと、ビルド時間を大幅に短縮できる。</p>
</div>

<div class="note variant-a">
<p>本文の理解を補う周辺情報は note に記載する。読み飛ばしても本筋の理解に支障がない情報を置く。</p>
</div>

<div class="warning variant-a">
<p>ビルド前に必ず原稿を保存する。未保存の変更はビルド結果へ反映されない。</p>
</div>

<p class="sample-label">B 案: タイトル帯系（帯の明度 3 段階で種別を区別）</p>

<div class="tips variant-b">
<p class="tips-title">Tips: ビルドの高速化</p>
<p>執筆中は対象章だけを entry に残すと、ビルド時間を大幅に短縮できる。</p>
</div>

<div class="note variant-b">
<p>本文の理解を補う周辺情報は note に記載する。読み飛ばしても本筋の理解に支障がない情報を置く。</p>
</div>

<div class="warning variant-b">
<p>ビルド前に必ず原稿を保存する。未保存の変更はビルド結果へ反映されない。</p>
</div>

<p class="sample-label">C 案: 記号ラベル系（枠は最小限の罫線のみ）</p>

<div class="tips variant-c">
<p class="tips-title">Tips: ビルドの高速化</p>
<p>執筆中は対象章だけを entry に残すと、ビルド時間を大幅に短縮できる。</p>
</div>

<div class="note variant-c">
<p>本文の理解を補う周辺情報は note に記載する。読み飛ばしても本筋の理解に支障がない情報を置く。</p>
</div>

<div class="warning variant-c">
<p>ビルド前に必ず原稿を保存する。未保存の変更はビルド結果へ反映されない。</p>
</div>
