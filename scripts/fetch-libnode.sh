#!/usr/bin/env bash
#
# 下载 nodejs-mobile 的安卓预编译核心,放入:
#   android/app/libnode/bin/<ABI>/libnode.so
#   android/app/libnode/include/node/node.h ...
#
# 用法:
#   scripts/fetch-libnode.sh [nodejs-mobile-release-url]
#
# 若未传 URL,默认从 GitHub 官方 Releases 拉取 v24 行预编译包。
# 注意:实际 assets 命名可能随版本变化,若自动下载失败,请按下方"手动步骤"
# 下载后放到对应目录即可,脚本会校验结构。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/android/app/libnode"
ABIS="${ABIS:-arm64-v8a armeabi-v7a x86_64}"

mkdir -p "$DEST"

ensure_head() {
  # 校验头文件是否存在
  [ -f "$DEST/include/node/node.h" ] && return 0
  return 1
}

ensure_bins() {
  for abi in $ABIS; do
    [ -f "$DEST/bin/$abi/libnode.so" ] || return 1
  done
  return 0
}

if ensure_head && ensure_bins; then
  echo "libnode 已存在,跳过下载。"
  exit 0
fi

URL="${1:-}"
if [ -z "$URL" ]; then
  echo ">> 需要指定 nodejs-mobile Android 预编译包(包含 bin/<ABI>/libnode.so 与 include/node)。"
  echo ">> 官方下载: https://github.com/nodejs-mobile/nodejs-mobile/releases"
  echo ">> 例如 v24系 Releases 下的 Android zip(arm64/armv7/x86_64)。"
  echo
  cat <<'EOF'
手动步骤:
  1. 打开 https://github.com/nodejs-mobile/nodejs-mobile/releases
  2. 找到 nodejs-mobile v24.x 对应的 Android 预编译 assets(通常名为
     nodejs-mobile-<ver>-android.zip 之类),下载并解压。
  3. 把解压后的 bin/ 与 include/ 放到这里(结构):
       android/app/libnode/bin/arm64-v8a/libnode.so
       android/app/libnode/bin/armeabi-v7a/libnode.so
       android/app/libnode/bin/x86_64/libnode.so
       android/app/libnode/include/node/node.h
  4. 完成后重新运行本脚本校验。
EOF
  exit 2
fi

echo ">> 下载 $URL"
TMP="$(mktemp -d)"
curl -fL "$URL" -o "$TMP/nodejs.zip"
unzip -q -o "$TMP/nodejs.zip" -d "$TMP/x"

# 尝试从解压目录中定位 bin/include(可能有嵌套目录)
SRC="$TMP/x"
find "$TMP/x" -type d -name bin 2>/dev/null | head -1 | read -r BINDIR || true
if [ -n "${BINDIR:-}" ]; then
  cp -r "$(dirname "$BINDIR")/include" "$DEST/include"
  for abi in $ABIS; do
    [ -d "$BINDIR/$abi" ] && { mkdir -p "$DEST/bin/$abi"; cp "$BINDIR/$abi/libnode.so" "$DEST/bin/$abi/" 2>/dev/null || true; }
  done
else
  cp -r "$SRC/bin" "$DEST/bin"  2>/dev/null || true
  cp -r "$SRC/include" "$DEST/include" 2>/dev/null || true
fi

rm -rf "$TMP"

if ensure_head && ensure_bins; then
  echo "libnode 就绪:"
  ls -lR "$DEST"/bin | head -20
else
  echo "!! 结构与预期不符,请按上方手动步骤放置 libnode。" >&2
  exit 1
fi