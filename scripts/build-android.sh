#!/usr/bin/env bash
#
# 一键构建安卓 APK(调试)的主脚本。
#
# 流程:
#   1. 准备内嵌服务(Next standalone 打包进 assets)
#   2. 获取 nodejs-mobile libnode 预编译核心
#   3. 交叉编译 better-sqlite3(arm64)
#   4. 检查/准备 Android 构建环境(JDK 17 + Android SDK)
#   5. gradlew assembleDebug 产出 APK
#
# 环境变量(可选):
#   ANDROID_HOME     指向已安装的 Android SDK(否则尝试自动安装到 ~/Android/Sdk)
#   ANDROID_NDK_HOME 指向 NDK(better-sqlite3 交叉编译用)
#   ABI              目标 ABI,默认 arm64-v8a
#   DEBUG_SKIP_NATIVE  若设置且非空,则跳过 libnode/交叉编译(仅验证 Gradle 配置)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "====================  [1/5] 准备内嵌服务 ===================="
bash scripts/prepare-server.sh

if [ -z "${DEBUG_SKIP_NATIVE:-}" ]; then
  echo "====================  [2/5] 获取 nodejs-mobile ===================="
  bash scripts/fetch-libnode.sh

  echo "====================  [3/5] 交叉编译 better-sqlite3 ===================="
  ABI="${ABI:-arm64-v8a}" bash scripts/cross-compile-better-sqlite3.sh
fi

echo "====================  [4/5] 准备 Android 构建环境 ===================="
JAVA_HOME_17="${JAVA_HOME_17:-}"
if [ -z "${JAVA_HOME_17:-}" ]; then
  # 自动定位 JDK:优先 21(AGP 8.13 / Capacitor 7 需要),否则 17
  for c in /usr/lib/jvm/*/ /opt/android-studio/jbr/; do
    if [ -x "$c/bin/java" ] && "$c/bin/java" -version 2>&1 | grep -qE '"(17|21)'; then
      JAVA_HOME_17="$c"; break
    fi
  done
fi
if [ -n "$JAVA_HOME_17" ]; then
  export JAVA_HOME="$JAVA_HOME_17"
  echo "使用 JDK: $JAVA_HOME"
fi

# Android SDK
if [ -z "${ANDROID_HOME:-}" ]; then
  export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
fi
CMD_TOOLS="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
if [ ! -x "$CMD_TOOLS" ] && [ -x "$ANDROID_HOME/cmdline-tools/bin/sdkmanager" ]; then
  CMD_TOOLS="$ANDROID_HOME/cmdline-tools/bin/sdkmanager"
fi
if [ ! -x "$CMD_TOOLS" ]; then
  echo ">> 未检测到 Android SDK,正在安装命令行工具到 $ANDROID_HOME ..."
  mkdir -p "$ANDROID_HOME/cmdline-tools"
  TMPZ="$(mktemp -d)"
  curl -fL -o "$TMPZ/cmdtools.zip" \
    "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
  unzip -q -o "$TMPZ/cmdtools.zip" -d "$TMPZ/cmd"
  mv "$TMPZ/cmd/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
  rm -rf "$TMPZ"
  CMD_TOOLS="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
fi
yes | "$CMD_TOOLS" --licenses >/dev/null 2>&1 || true
"$CMD_TOOLS" "platforms;android-36" "build-tools;36.0.0" "platform-tools" >/dev/null 2>&1 || \
  "$CMD_TOOLS" "platforms;android-35" "build-tools;35.0.0" "platform-tools" >/dev/null 2>&1 || true
echo "Android SDK 就绪: $ANDROID_HOME"

echo "====================  [5/5] Gradle 构建 APK ===================="
cd "$ROOT/android"
./gradlew assembleDebug --console=plain

APK="$(find "$ROOT/android/app/build/outputs/apk/debug" -name '*.apk' | head -1)"
if [ -n "$APK" ]; then
  echo "=================================================="
  echo "构建成功: $APK"
  echo "安装到设备: adb install -r \"$APK\""
  echo "=================================================="
else
  echo "!! 未找到 APK,请检查上方 Gradle 输出。" >&2
  exit 1
fi