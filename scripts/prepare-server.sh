#!/usr/bin/env bash
#
# 准备内嵌服务:构建 Next.js standalone 并把运行产物放到 Android assets。
#
# 产物结构:
#   android/app/src/main/assets/nodejs-project/   <- Next.js standalone 服务(server.js + 依赖 + 静态资源)
#   android/app/src/main/assets/dev.db            <- 预置(已种数据)的 SQLite 数据库
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export DATABASE_URL="${DATABASE_URL:-file:./dev.db}"
# 注意:构建期必须保留 devDependencies(如 @tailwindcss/postcss),
# 因此不要在构建阶段 export NODE_ENV=production(那会让 npm 跳过 devDeps)。
# 生产运行时环境由安卓侧的 bootstrap.js 注入。

echo "[1/4] 安装依赖 & 生成 Prisma Client"
npm install --no-audit --no-fund
DATABASE_URL="$DATABASE_URL" npm run db:generate

echo "[2/4] 构建 Next.js standalone"
npm run build

STANDALONE="$ROOT/.next/standalone"
ASSETS="$ROOT/android/app/src/main/assets"
DST="$ASSETS/nodejs-project"

echo "[3/4] 补齐 standalone 运行所需静态资源(.next/static 与 public)"
mkdir -p "$STANDALONE/public"
cp -r "$ROOT/public/." "$STANDALONE/public/"
mkdir -p "$STANDALONE/.next"
cp -r "$ROOT/.next/static" "$STANDALONE/.next/static"

echo "[4/5] 复制 standalone 服务到 Android assets"
rm -rf "$DST"
mkdir -p "$DST"
cp -r "$STANDALONE/." "$DST/"

echo "[5/5] 生成预置数据库并复制到 Android assets"
# 项目不提交二进制 dev.db;需要时用 db push + seed 从零生成(可复现、干净)。
if [ ! -f "$ROOT/dev.db" ]; then
  echo ">> 生成种子数据库(prisma db push + db:seed)"
  # Prisma 7 的 db push 无 --skip-generate 参数
  DATABASE_URL="$DATABASE_URL" npx prisma db push
  DATABASE_URL="$DATABASE_URL" npm run db:seed
fi
cp "$ROOT/dev.db" "$ASSETS/dev.db"

echo "完成。内嵌服务已就位:"
du -sh "$DST" "$ASSETS/dev.db" 2>/dev/null || true