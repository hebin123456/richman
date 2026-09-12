# 安卓版「掌上大富翁」构建与部署文档

本文档说明如何把 Next.js + Phaser 的网页版「掌上大富翁」打包成一个可安装的安卓
APP,并采用**本地内嵌服务**架构(游戏服务端内嵌在 App 内,可离线对局)。

## 架构总览

```
┌────────────────────────────────────────────────────────┐
│                    安卓 App (APK)                        │
│  ┌────────────────┐          ┌────────────────────────┐ │
│  │   WebView       │  fetch/  │   nodejs-mobile 核心     │ │
│  │  (Capacitor)    │  SSE     │   (内嵌 Node.js 运行时)   │ │
│  │  · Phaser 渲染   │ ───────► │   · Next standalone 服务 │ │
│  │  · React 逻辑   │          │   · Prisma + SQLite       │ │
│  └────────────────┘          └────────────────────────┘ │
│        ▲  加载 http://127.0.0.1:10086      │              │
│        └───────────────────────────────────┘              │
└────────────────────────────────────────────────────────┘
```

- WebView 由 Capacitor 提供,通过 `server.url` 指向 `http://127.0.0.1:10086`。
- 游戏服务端在 App 启动时由 `MainActivity` 用 nodejs-mobile 拉起,监听本机回环地址。
- API 与 SSE(`/api/...`)全部走相对路径,与 WebView 页面同源,无需修改游戏代码。
- 数据库(SQLite)存放在 App 私有目录 `filesDir`,冷启动时从 assets 预置的种子库复制。

## 目录结构(与安卓相关的部分)

```
richman-android/
├─ capacitor.config.ts                     # Capacitor 配置(server.url 指向本地服务)
├─ scripts/
│  ├─ prepare-server.sh                    # 构建 Next standalone 并打包进 assets
│  ├─ fetch-libnode.sh                     # 下载 nodejs-mobile 预编译核心(libnode.so)
│  ├─ cross-compile-better-sqlite3.sh      # 交叉编译 better-sqlite3 到 Android ABI
│  └─ build-android.sh                     # 一键构建 APK
└─ android/app/
   ├─ CMakeLists.txt                       # 导入 libnode,链接 native-lib
   ├─ libnode/bin/<ABI>/libnode.so         # nodejs-mobile 核心(脚本下载)
   ├─ libnode/include/node/                # nodejs-mobile 头文件
   └─ src/main/
      ├─ cpp/native-lib.cpp                # JNI:调用 node::Start
      ├─ java/com/richman/app/MainActivity.java  # 启动内嵌服务 + 等待就绪
      ├─ assets/nodejs-project/            # 内嵌的 Next standalone 服务(脚本生成)
      ├─ assets/dev.db                     # 预置种子数据库(脚本生成)
      └─ AndroidManifest.xml               # 权限 / cleartext / 网络策略
```

## 环境要求

| 工具 | 版本 | 用途 |
| --- | --- | --- |
| JDK | **21**(17 也能配置但 Capacitor 7 / AGP 8.13 默认按 21 编译) | Android Gradle Plugin |
| Android SDK | compileSdk 36 / build-tools 36 | 编译 APK |
| Android NDK | r24+(本文档用 26.1.10909125) | CMake / 交叉编译 |
| Node.js | 20+ | 构建 Next standalone、bare-make |
| Node.js Mobile | nodejs-mobile v18.20.4(预编译) | 内嵌 Node 运行时 |

### 已验证的构建状态

以下步骤已在本环境实际跑通并产出 APK:

| 事项 | 状态 |
| --- | --- |
| Next.js standalone 构建 | 通过(`output: standalone`) |
| Prisma adapter-better-sqlite3 + better-sqlite3@13 桌面运行 | 通过 |
| Capacitor 安卓工程生成 + Gradle 配置 | 通过 |
| Java 层编译(`MainActivity` 等) | 通过(JDK 21) |
| 原生层编译(CMake + JNI node::Start,3 个 ABI) | 通过 |
| `assembleDebug` 产出 APK(173MB) | 通过,三 ABI + 内嵌服务 assets 齐全 |
| **better-sqlite3 安卓版二进制替换** | **待办**(见步骤 4,当前 APK 内是 x86_64 host 版,Android 上需换 arm64) |
| 真机/模拟器运行验证 | 待你在本机完成(无设备环境) |

> 直接可执行的步骤 4 是让 APK 真正能跑起来的关键:把内嵌服务里
> `node_modules/better-sqlite3/build/Release/better_sqlite3.node` 换成
> 用 Android NDK 交叉编译出的 `arm64-v8a` 版本(宿主机的 x86_64 二进制无法在安卓加载)。

## 构建步骤(在你的开发机上)

### 1. 在 Android Studio 打开本项目

打开 `android/` 目录(以 Gradle 工程导入),Android Studio 会自动配置 SDK/NDK/JDK。

### 2. 准备内嵌服务

```bash
npm install
bash scripts/prepare-server.sh        # 产出 android/app/src/main/assets/nodejs-project
```

### 3. 下载 nodejs-mobile 预编译核心

```bash
# 自动方式(需能访问 GitHub):
bash scripts/fetch-libnode.sh

# 或手动方式:
#   1) https://github.com/nodejs-mobile/nodejs-mobile/releases 下载 v24 行的 Android 包
#   2) 解压,把 bin/ 与 include/ 放到 android/app/libnode/ 下
```

> 若网络受限,可在任意已配好环境的机器上先构建,再把 `android/app/libnode` 与打包好的
> `assets` 一并拷入。

### 4. 交叉编译 better-sqlite3(首次构建需执行)

```bash
bash scripts/cross-compile-better-sqlite3.sh   # 默认 ABI=arm64-v8a
```

> 依赖 `cmake` 与 `bare-make`。若命令不可用:
> `npm i -g bare-make@latest`;Linux 下还需 `apt install cmake`。
> 需要安卓的 `better_sqlite3.node`(N-API,v13+),宿主机器上的 x86 .node 不能用。

### 5. 一键构建 APK

```bash
bash scripts/build-android.sh        # 会自动完成 2/3/4 与 Gradle 打包
# 产物: android/app/build/outputs/apk/debug/app-debug.apk
```

或仅打包:
```bash
cd android && ./gradlew assembleDebug
```

### 6. 安装到设备

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## 常见问题

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 启动白屏 / `ERR_CONNECTION_REFUSED` | 服务未就绪就加载 WebView | 已内置就绪等待,若仍出现请加大 `MainActivity.START_TIMEOUT_MS` |
| 报 `Cannot find module better_sqlite3.node` | 缺少安卓 ABI 的原生二进制 | 重新执行步骤 4 的交叉编译 |
| `libnode.so` not found | 未放置 nodejs-mobile 核心 | 执行步骤 3 |
| 首次安装后很慢 | 需把 60MB+ 服务从 assets 复制到 filesDir | 属正常现象,仅首次 |
| 想清空对局数据 | 缓存了数据库 | 卸载重装,或删除 App 数据 |

## 版本升级 / 更换站点

- 修改端口:同步改 `capacitor.config.ts` 的 `server.url` 与 `MainActivity.NODE_PORT`。
- 强制刷新内嵌服务:先删除 App 数据让 assets 重新复制。
- 若你改为连远程服务器而非内嵌服务:改 `capacitor.config.ts` 的 `server.url` 即可,
  但需自行部署远程的 Next 服务。

## 与网页版的差异

- 服务端由"外置部署"改为"内嵌于 App 运行",原理不变(server-authoritative + SSE)。
- 本地对局:一个设备上建多个窗口/或带机器人游玩(项目已支持 bots)。
- 多设备联机仍建议部署远程服务端,本方案主要用于离线/单机体验。

## 备注:为什么必须内嵌 Node.js

本项目是服务端权威架构,规则引擎与数据库都在服务端(Next.js + Prisma)。安卓端若要
真正"本地可玩",必须运行一个 Node.js 运行时。nodejs-mobile 提供 `libnode.so` 内嵌核心;
`MainActivity` 通过 JNI 调用 `node::Start` 启动 Next standalone 服务,WebView 再连向它。