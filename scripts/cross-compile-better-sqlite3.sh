#!/usr/bin/env bash
#
# 交叉编译 better-sqlite3 到 Android ABI,并替换进内嵌服务的 node_modules。
#
# 背景:内嵌服务用 Prisma 的 @prisma/adapter-better-sqlite3 依赖原生 better-sqlite3。
#     为了在 nodejs-mobile v24(Node N-API)下运行,需要 arm64-v8a 的 .node 二进制,
#     host(x86_64-linux)的 .node 不能直接使用。
#
# 推荐方案:digidem 的 better-sqlite3-nodejs-mobile prebuild 流水线(bare-make + cmake-napi)。
# 参考: https://github.com/digidem/better-sqlite3-nodejs-mobile
#
# 前提:
#   - Android NDK(环境变量 ANDROID_NDK_HOME 或 sdkmanager 安装)
#   - Node 20+(用于 npm / bare-make)
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ABI="${ABI:-arm64-v8a}"                 # 主要目标:arm64
NAPI_NODE_VERSION="${NAPI_NODE_VERSION:-24.19.0-0}"  # 与下载的 nodejs-mobile 版本对齐
NODE_MODS="$ROOT/android/app/src/main/assets/nodejs-project/node_modules/better-sqlite3"

echo ">> 目标 better-sqlite3 位于: $NODE_MODS"
if [ ! -d "$NODE_MODS" ]; then
  echo "!! 缺少内嵌服务的 node_modules,请先运行 scripts/prepare-server.sh" >&2
  exit 1
fi

if ! command -v bare-make >/dev/null 2>&1 \
   && ! command -v cmake >/dev/null 2>&1; then
  echo "!! 需要 cmake 与 bare-make。安装: npm i -g bare-make@latest,或 apt install cmake" >&2
  exit 1
fi

BUILD="$ROOT/.sqlite3-android"
rm -rf "$BUILD"; mkdir -p "$BUILD"; cd "$BUILD"

echo "[1/5] 解包 better-sqlite3@$(node -e "console.log(require('$ROOT/node_modules/better-sqlite3/package.json').version)") 源码"
npm pack better-sqlite3@13 | xargs tar -zxvf
cd package
npm install --ignore-scripts --no-audit --no-fund
npm install -D --ignore-scripts cmake-bare cmake-fetch 2>/dev/null || true
npm install -D --ignore-scripts cmake-napi@github:digidem/cmake-napi-nodejs-mobile 2>/dev/null || true

echo "[2/5] 生成 Android $ABI 构建"
bare-make generate --platform android --arch "$ABI" -D NAPI_NODE_VERSION="$NAPI_NODE_VERSION"

echo "[3/5] 编译"
bare-make build

echo "[4/5] 收集产物"
OUT_NODE="$(find . -name 'better_sqlite3.node' -path '*android*' | head -1)"
if [ -z "${OUT_NODE:-}" ]; then
  echo "!! 未找到 Android 的 better_sqlite3.node 产物" >&2; exit 1
fi

echo "[5/5] 替换内嵌服务中所有更好-sqlite3 的 .node 副本"
# 关键:Next standalone 的 outputFileTracing 会把 better-sqlite3 按需复制到
# @prisma/adapter-better-sqlite3/node_modules/better-sqlite3 这一"嵌套副本",
# 运行期适配器就近 require 会优先命中该副本。因此必须把 assets 下所有
# build/Release/better_sqlite3.node 全部替换为 arm64 产物,只改顶层目录不够。
ASSET_ROOT="$(dirname "$NODE_MODS")"   # .../assets/nodejs-project/node_modules
REPLACED=0
while IFS= read -r target; do
  mkdir -p "$(dirname "$target")"
  cp "$OUT_NODE" "$target"
  echo "  已替换: $target"
  REPLACED=$((REPLACED+1))
done < <(find "$ASSET_ROOT" -path "*/better-sqlite3/build/Release/better_sqlite3.node" -print)

if [ "$REPLACED" -eq 0 ]; then
  echo "!! 未找到任何 better_sqlite3.node,请检查内嵌服务是否已用 prepare-server.sh 生成" >&2
  exit 1
fi
echo "完成:共替换 $REPLACED 处 better_sqlite3.node(arm64)"
echo "提示:如需支持 armeabi-v7a / x86_64 模拟器,请分别设置 ABI 重复本脚本并替换对应构架。"