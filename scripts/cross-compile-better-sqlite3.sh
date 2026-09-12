#!/usr/bin/env bash
#
# 准备 Android(Arm) 的 better-sqlite3 原生模块,并替换进内嵌服务的 node_modules。
#
# 背景:内嵌服务用 Prisma 的 @prisma/adapter-better-sqlite3 依赖原生 better-sqlite3。
#     host 构建出的 x86_64 better_sqlite3.node 无法在 Android(arm64) 上加载,
#     一旦 require 就会崩溃,导致内嵌 Node 服务起不来、App 卡在图标页。
#
# 方案:直接下载 digidem 为 nodejs-mobile 预编译的更好-sqlite3 产物
#   (https://github.com/digidem/better-sqlite3-nodejs-mobile)。
#   better-sqlite3 >= 13 是 N-API 插件,一物一目标即可,须配套 nodejs-mobile v24
#   (N-API 10)。与本项目内嵌运行时 nodejs-mobile 24 对齐。
#
# 用法:
#   ABI=arm64-v8a NAPI_NODE_VERSION=24.19.0-0 bash scripts/cross-compile-better-sqlite3.sh
#
# 说明:脚本名沿用旧名,实际为"下载并替换",不再需要 NDK/cmake/bare-make 交叉编译。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ABI="${ABI:-arm64-v8a}"
NAPI_NODE_VERSION="${NAPI_NODE_VERSION:-24.19.0-0}"
ASSET_ROOT="$ROOT/android/app/src/main/assets/nodejs-project/node_modules"

# 从项目已安装的 better-sqlite3 读取实际版本,保证与 JS 包完全一致
VERSION="$(node -e "console.log(require('$ROOT/node_modules/better-sqlite3/package.json').version)")"

# ABI -> 预编译资产名里使用的 android arch 命名
case "$ABI" in
  arm64-v8a) ASSET_ARCH=arm64 ;;
  armeabi-v7a) ASSET_ARCH=arm ;;
  x86_64) ASSET_ARCH=x64 ;;
  *) echo "!! 暂不支持 ABI: $ABI(预编译资产仅 arm64-v8a / armeabi-v7a / x86_64)" >&2; exit 1 ;;
esac

echo ">> 目标 better-sqlite3 版本: $VERSION ; ABI=$ABI ; android arch=$ASSET_ARCH"
echo ">> 需要内嵌运行时 nodejs-mobile >= 24(NAPI 10),当前配置 NAPI_NODE_VERSION=$NAPI_NODE_VERSION"

if [ ! -d "$ASSET_ROOT" ]; then
  echo "!! 缺少内嵌服务的 node_modules,请先运行 scripts/prepare-server.sh" >&2
  exit 1
fi

URL="https://github.com/digidem/better-sqlite3-nodejs-mobile/releases/download/${VERSION}/better-sqlite3-${VERSION}-android-${ASSET_ARCH}.tar.gz"
echo ">> 下载预编译产物: $URL"
TMP="$(mktemp -d)"
curl -fL "$URL" -o "$TMP/bs.tar.gz"
mkdir -p "$TMP/x"
tar -zxvf "$TMP/bs.tar.gz" -C "$TMP/x" >/dev/null

OUT_NODE="$(find "$TMP/x" -name "better_sqlite3.node" -type f | head -1)"
if [ -z "$OUT_NODE" ]; then
  echo "!! 预编译包内未找到 better_sqlite3.node" >&2; exit 1
fi
echo ">> 产物: $OUT_NODE"
file "$OUT_NODE"
# 硬校验:必须为 aarch64(仅当目标是 arm64 时),防非 arm64 混入
if [ "$ASSET_ARCH" = "arm64" ] && ! file "$OUT_NODE" | grep -qiE "aarch64|ARM aarch64"; then
  echo "!! 预编译产物不是 arm64(aarch64),中止" >&2; exit 1
fi

echo ">> 替换内嵌服务中所有 better-sqlite3 的 .node 副本"
# Next standalone 的 outputFileTracing 会按需复制 better-sqlite3 到多个位置
# (顶层 node_modules/ 以及 @prisma/adapter-better-sqlite3/node_modules/ 嵌套副本),
# 运行期会就近 require。因此必须把所有副本全部替换。
REPLACED=0
while IFS= read -r target; do
  mkdir -p "$(dirname "$target")"
  cp "$OUT_NODE" "$target"
  echo "  已替换: $target"
  REPLACED=$((REPLACED+1))
done < <(find "$ASSET_ROOT" -path "*/better-sqlite3/build/Release/better_sqlite3.node" -print)

rm -rf "$TMP"
if [ "$REPLACED" -eq 0 ]; then
  echo "!! 未找到任何 better_sqlite3.node,请检查内嵌服务是否已用 prepare-server.sh 生成" >&2
  exit 1
fi
echo "完成:共替换 $REPLACED 处 better_sqlite3.node($ASSET_ARCH)"