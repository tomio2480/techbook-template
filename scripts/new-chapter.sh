#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CHAPTERS_DIR="$PROJECT_ROOT/src/chapters"

if [ $# -lt 2 ]; then
  echo "Usage: $0 <chapter_number> <chapter_title>"
  echo "Example: $0 02 \"基本的な使い方\""
  exit 1
fi

CHAPTER_NUM="$1"
CHAPTER_TITLE="$2"

PADDED_NUM=$(printf "%02d" "$CHAPTER_NUM")

FILENAME_TITLE=$(echo "$CHAPTER_TITLE" | tr ' ' '-' | tr '[:upper:]' '[:lower:]')
FILENAME="${PADDED_NUM}-${FILENAME_TITLE}.md"
FILEPATH="$CHAPTERS_DIR/$FILENAME"

if [ -f "$FILEPATH" ]; then
  echo "Error: File already exists: $FILEPATH"
  exit 1
fi

cat > "$FILEPATH" << EOF
# 第${CHAPTER_NUM}章 ${CHAPTER_TITLE}

本章では、${CHAPTER_TITLE}について説明します。

## 概要

（ここに章の概要を記述）

## まとめ

（ここに章のまとめを記述）
EOF

echo "Created: $FILEPATH"
echo ""
echo "Next steps:"
echo "1. Edit vivliostyle.config.js to add: 'src/chapters/$FILENAME'"
echo "2. Edit config/book.yaml to add the chapter to the chapters list"
