---
body:
  style: "counter-set: chapter 1;"
---

<section class="chapter-opening">

<p class="chapter-number">2</p>
<p class="chapter-title">応用編</p>

<div class="chapter-summary">

本章では、より実践的な技術書執筆のテクニックを紹介する。回路図の埋め込みや複数言語のコード例、コラムや Tips の活用方法など、技術書の品質を高めるための手法を解説する。

</div>

<div class="chapter-topics">

<p class="chapter-topics-title">この章で学ぶこと</p>

<ul>
<li>回路図の埋め込み方法</li>
<li>複数言語のコード例の記述</li>
<li>コラムと Tips の使い方</li>
<li>執筆時の注意事項とヒント</li>
</ul>

</div>

</section>

# 応用編

本章では、より実践的な技術書執筆のテクニックを紹介する。

## 回路図の埋め込み

電子工作の技術書では、回路図が必須となる。KiCad や Fritzing で作成した回路図は SVG 形式でエクスポートし、以下のように埋め込む。

```markdown
![LED点滅回路](../assets/diagrams/led-blink.svg)
```

SVG 形式を推奨する理由は以下の通り。

- 拡大しても画質が劣化しない
- ファイルサイズが小さい
- テキストが検索可能

## 複数言語のコード例

### Rust

```rust
fn main() {
    let numbers = vec![1, 2, 3, 4, 5];
    let sum: i32 = numbers.iter().sum();
    println!("Sum: {}", sum);
}
```

### Go

```go
package main

import "fmt"

func main() {
    numbers := []int{1, 2, 3, 4, 5}
    sum := 0
    for _, n := range numbers {
        sum += n
    }
    fmt.Printf("Sum: %d\n", sum)
}
```

### Shell

```bash
#!/bin/bash
numbers=(1 2 3 4 5)
sum=0
for n in "${numbers[@]}"; do
    sum=$((sum + n))
done
echo "Sum: $sum"
```

## 部品表の詳細例

Arduino Uno を使った温度計の部品表

| 部品名 | 型番 | 数量 | 単価 | 小計 | 購入先 |
|--------|------|------|------|------|--------|
| Arduino Uno | A000066 | 1 | 3,000 | 3,000 | 秋月電子 |
| 温度センサ | LM35DZ | 1 | 200 | 200 | 秋月電子 |
| LCD | SC1602 | 1 | 600 | 600 | 千石電商 |
| 抵抗 | 10kΩ | 2 | 10 | 20 | 秋月電子 |
| ブレッドボード | BB-801 | 1 | 300 | 300 | 秋月電子 |
| ジャンパワイヤ | - | 10 | 20 | 200 | Amazon |
| **合計** | | | | **4,320** | |

## コラムと Tips

本文の流れから少し外れた補足情報や、読者に役立つ実践的なヒントを提示するためのブロックを用意している。

### コラムの使い方

コラムは、本文の話題に関連する補足的な解説やコラム記事に使用する。HTML の `div` タグに `class="column"` を指定する。

<div class="column">
<p class="column-title">Vivliostyle と CSS 組版</p>
<p>Vivliostyle は CSS 組版に基づくオープンソースの組版エンジンである。W3C の CSS Paged Media 仕様に準拠しており、ブラウザの描画エンジンを利用して高品質な PDF を生成できる。</p>
<p>従来の DTP ソフトウェアと異なり、テキストエディタと Git による原稿管理が可能な点が特徴である。</p>
</div>

### Tips の使い方

Tips は、読者が作業を効率化するための実践的なアドバイスに使用する。HTML の `div` タグに `class="tips"` を指定する。

<div class="tips">
<p class="tips-title">Tips: Markdown から HTML ブロックへの切り替え</p>
<p>Vivliostyle の VFM（Vivliostyle Flavored Markdown）では、Markdown 内に HTML を直接記述できる。コラムや Tips のように独自クラスを使いたい場合は、HTML ブロックを利用する。</p>
</div>

### コラム内の数式

コラムや Tips の HTML ブロック内でも数式に番号を付与できる。HTML ブロック内では `<span class="math display">` 形式で記述する。

<div class="column">
<p class="column-title">オームの法則</p>
<p>電気回路の基本法則であるオームの法則は以下の式で表される。</p>
<p><span class="math display">$$V = IR$$</span></p>
<p>ここで、<span class="math inline">\(V\)</span> は電圧、<span class="math inline">\(I\)</span> は電流、<span class="math inline">\(R\)</span> は抵抗である。</p>
</div>

## 注意事項とヒント

技術書を執筆する際の注意点を以下に示す。

> コードは必ず動作確認を行うこと。読者が再現できないコードは信頼を損なう原因となる。

### 執筆のポイント

1. 対象読者を明確にする
2. 前提知識を最初に記載する
3. 手順は省略せず詳細に書く
4. エラーが発生しやすい箇所を明示する
5. トラブルシューティングを用意する

### よくある間違い

- パスの記述ミス（Windows と Unix の違い）
- バージョンの不一致による動作不良
- 環境変数の設定漏れ

## まとめ

本章では、技術書執筆における実践的なテクニックを紹介した。次章では、CI/CD による自動ビルドの設定方法を解説する。
