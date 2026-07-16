---
body:
  style: "counter-set: chapter 0;"
---

<section class="chapter-opening">

<p class="chapter-number">1</p>
<p class="chapter-title">装飾スタイルカタログ</p>

<div class="chapter-summary">

この扉ページ自体が採用スタイルである。中央に縁取りの章番号を置き、その上へ「CHAPTER」の欧文ラベルを添える。章タイトルは文字の下半分へ淡色マーカーを敷いて示す。面を塗らない、軽やかな扉になっている。

</div>

<div class="chapter-topics">

<p class="chapter-topics-title">この章で確認できること</p>

<ul>
<li>章扉・見出し・枠ものの採用スタイル</li>
<li>章まとめ枠（chapter-recap）の見た目と記法</li>
<li>パレット差し替え時に追従する装飾の範囲</li>
</ul>

</div>

</section>

# 装飾スタイルカタログ

本章は theme.css に定義された装飾スタイルの一覧カタログである。この章見出し自体が採用スタイル（全幅の淡色グラデ帯＋帯右上の角落とし＋左罫線）を示す。デザイン言語は工業系の教科書風で、淡色基調に軽いグラデーション・角落とし（ドッグイヤー）・縁取り文字をあしらう。配色は palette.css のパレット層を差し替えると全装飾が追従する。

## 節見出しのスタイル

この節見出し自体が採用スタイル（角落とし番号プレート＋下罫線）である。番号プレートの右下角を斜めに落とし、細い下罫線で節の範囲を示す。

### 項見出しのスタイル

この項見出し自体が採用スタイル（淡色マーカー下線）である。文字の下半分に淡色を敷き、蛍光マーカー風の軽い強調にとどめる。

## コラム枠

<p class="sample-label">コラム: ドッグイヤー地＋縁取り COLUMN ラベル</p>

<div class="column">
<p class="column-title">Vivliostyle と CSS 組版</p>
<p>Vivliostyle は CSS 組版に基づくオープンソースの組版エンジンである。W3C の CSS Paged Media 仕様に準拠しており、ブラウザの描画エンジンを利用して高品質な PDF を生成できる。</p>
</div>

## Tips・注釈・警告枠

3 種の枠は本文中で混在するため、種別記号（◆・※・！）と帯の配色で判別できるようにしている。記号は印刷入稿の安全のため JIS X 0208 内に限定している。

<p class="sample-label">Tips: 淡色グラデ帯タイトル＋種別記号 ◆</p>

<div class="tips">
<p class="tips-title">Tips: ビルドの高速化</p>
<p>執筆中は対象章だけを entry に残すと、ビルド時間を大幅に短縮できる。</p>
</div>

<p class="sample-label">注釈: 淡色グラデ帯「※ Note」</p>

<div class="note">
<p>本文の理解を補う周辺情報は note に記載する。読み飛ばしても本筋の理解に支障がない情報を置く。</p>
</div>

<p class="sample-label">警告: 淡色グラデ帯「！ 注意」</p>

<div class="warning">
<p>ビルド前に必ず原稿を保存する。未保存の変更はビルド結果へ反映されない。</p>
</div>

## 枠アイコンの背景あしらい（検討中）

3 種の枠は、配色を基調色（primary）系へ統一する検討中である。色味が同一になるため、種別は SVG 線画アイコン（電球・書類・警告三角）で判別する。アイコンは本文を邪魔しない薄色にして、枠の背景へ大きく敷く。傾きや集中線を軽くあしらい、遊び心のある背景にする。mask で塗るためパレット差し替えに追従する。フォントを経由しないため、環境差による豆腐化も起きない。種別記号（◆・※・！）は廃止する。帯は Tips・Note・Warning の英語表記へ統一する。採用決定後に theme.css へ本実装し、本節は削除する。

<p class="sample-label">背景あしらい: 薄色の大きな線画＋傾き＋集中線</p>

<div class="v-primary-tone v-icon-watermark">

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

</div>

## 表

<p class="sample-label">表: 基調色の見出し罫＋中明度の横罫＋ゼブラストライプ</p>

見出し行の下罫線は基調色、本体の横罫線は中明度、偶数行の背景は淡色で示す。縦罫線は使わない。

パレットへ追従する意味トークンの例

| トークン | 割り当て | 用途 |
|---|---|---|
| `--table-head-rule` | primary | 見出し行の下罫線 |
| `--table-rule` | primary-mid | 本体行の下罫線 |
| `--table-stripe-bg` | primary-light | 偶数行の背景 |
| `--quote-bg` / `--quote-border` | primary-light / primary-mid | 引用の地と左罫線 |

## 引用とリンク

<p class="sample-label">引用: 淡色地＋基調色系の左罫線</p>

> 引用は淡色の地と左罫線で本文と区別する。地と罫線は基調色系のため、パレット差し替えに追従する。

<p class="sample-label">リンク: 基調色の文字色</p>

本文中のリンクは [Vivliostyle 公式サイト](https://vivliostyle.org/) のように基調色の文字で示す。

## 章まとめ枠

章末の「まとめ」節で要点を列挙する新設要素である。チェック印は文字でなく罫線描画で作り、フォント差による豆腐化を避けている。

<p class="sample-label">章まとめ: 淡色グラデ帯タイトル＋チェックリスト</p>

<div class="chapter-recap">
<p class="chapter-recap-title">この章のまとめ</p>
<ul>
<li>装飾は意味トークン経由で配色し、パレット差し替えに追従させる</li>
<li>グレースケール判別は罫線・ラベル・明度差で担保する</li>
<li>PDF タグ付けへ配慮し、本文の絶対配置を増やさない</li>
</ul>
</div>
