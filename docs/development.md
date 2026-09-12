# 开发文档

本文档面向项目开发者，说明如何在本地启动、调试、改动和验证 `掌上大富翁`。

## 1. 技术栈

- 前端框架：Next.js 16 + React 19
- 游戏客户端：Phaser 4
- 语言：TypeScript
- 数据库与 ORM：SQLite + Prisma
- 自动化测试：Vitest
- 实时同步：Server-Sent Events（SSE）

## 2. 目录速览

- `src/app`
  Next.js 页面与 API 路由。
- `src/game-client`
  浏览器端运行时、Phaser 场景、网关与状态管理。
- `src/lib/game`
  核心规则、服务端游戏引擎、快照转换、自动托管、测试文件。
- `src/lib`
  数据库、HTTP、session、base-path 等公共基础设施。
- `prisma`
  Prisma schema、数据库脚本、种子数据。
- `public`
  角色素材、棋盘图标等静态资源。
- `docs`
  开发、架构、测试相关文档。

## 3. 环境要求

- Node.js 20+
- npm 10+
- Windows / macOS / Linux 均可，当前仓库主要按 Node 本地开发方式组织

## 4. 安装依赖

```bash
npm install
```

说明：

- `postinstall` 会自动执行 `prisma generate`。
- 如果 Prisma Client 类型异常，优先执行一次：

```bash
npm run db:generate
```

## 5. 环境变量与数据库

默认数据库连接位于 `src/lib/db.ts`：

- 默认值：`file:./dev.db`

如果希望切换数据库文件位置，可设置：

```bash
DATABASE_URL="file:./dev.db"
```

常用数据库命令：

```bash
npm run db:generate
npm run db:push
npm run db:migrate
npm run db:seed
```

推荐本地开发流程：

1. 修改 `prisma/schema.prisma`
2. 执行 `npm run db:push`
3. 执行 `npm run db:generate`
4. 再运行开发服务或测试

## 6. 启动项目

开发环境：

```bash
npm run dev
```

默认端口：

- `http://localhost:10086`

生产构建与启动：

```bash
npm run build
npm run start
```

## 7. 常用命令

```bash
npm run dev
npm run build
npm run lint
npm test
npm run test:watch
npm run db:push
npm run db:generate
```

## 8. 主要开发入口

### 8.1 页面与 API

- `src/app/page.tsx`
  首页入口。
- `src/app/rooms/[roomCode]/page.tsx`
  房间页入口。
- `src/app/api/rooms/**`
  房间、加入、开始、设置、托管、SSE 事件流。
- `src/app/api/games/[gameId]/actions/route.ts`
  局内动作入口。

### 8.2 客户端运行时

- `src/game-client/phaser/GameHost.tsx`
  React 宿主组件，负责创建 `GameRuntime`。
- `src/game-client/phaser/GameRuntime.ts`
  前端编排核心，统一处理加载快照、SSE、心跳与动作提交。
- `src/game-client/net/roomGateway.ts`
  所有房间与对局请求的 HTTP/SSE 封装。
- `src/game-client/state/runtimeStore.ts`
  客户端状态容器。

### 8.3 游戏规则

- `src/lib/game/engine.ts`
  核心引擎，绝大部分规则修改都从这里进入。
- `src/lib/game/snapshot.ts`
  DB 状态转前端快照。
- `src/lib/game/types.ts`
  前后端共享视图类型与动作类型。
- `src/lib/game/board.ts`
  棋盘格定义与图标配置。
- `src/lib/game/items.ts`
  道具定义。
- `src/lib/game/gods.ts`
  神明定义。
- `src/lib/game/cards.ts`
  机会/命运卡定义。
- `src/lib/game/autoplay.ts`
  机器人与托管逻辑。

## 9. 推荐开发流程

### 9.1 修改纯规则

适用：经济、道具、神明、机会/命运、监狱、新闻等。

推荐顺序：

1. 修改 `src/lib/game/*` 中对应规则模块
2. 如涉及落地结算，更新 `engine.ts`
3. 如影响快照字段，更新 `types.ts` 和 `snapshot.ts`
4. 如影响展示，更新 `MatchScene.ts` / `HudScene.ts`
5. 增补或调整测试
6. 执行 `npm test` 或针对性测试
7. 执行 `npm run build`

### 9.2 修改棋盘或格子

推荐顺序：

1. 修改 `board.ts`
2. 如新增格子类型，同步更新：
   - `src/game-client/utils/boardLayout.ts`
   - `src/game-client/scenes/BootScene.ts`
   - `src/game-client/scenes/MatchScene.ts`
   - 相关引擎落地逻辑
3. 检查图标资源是否存在于 `public/tile-icons`
4. 更新测试与文档

### 9.3 修改局内交互 UI

重点文件：

- `src/game-client/scenes/HudScene.ts`
- `src/game-client/scenes/MatchScene.ts`
- `src/app/globals.css`

建议：

- 先确认动作类型和快照字段是否已经具备。
- 再补 HUD / 棋盘文案与弹窗。
- 涉及自动弹窗时，注意不要和现有 `新闻快报`、道具弹窗、更多面板冲突。

## 10. 调试建议

### 10.1 服务端规则问题

优先看：

- `src/lib/game/engine.ts`
- `src/lib/game/snapshot.ts`
- `src/app/api/games/[gameId]/actions/route.ts`

常见症状：

- 规则没有生效：多半是 `engine.ts` 未更新或分支未命中
- 客户端状态不对：多半是 `snapshot.ts` 未把字段映射出去
- 动作报“当前不能...” ：多半是 phase 没切到正确状态

### 10.2 实时同步问题

优先看：

- `src/lib/game/event-bus.ts`
- `src/app/api/rooms/[roomCode]/events/route.ts`
- `src/game-client/net/roomGateway.ts`
- `src/game-client/phaser/GameRuntime.ts`

当前同步模型不是“推送完整状态”，而是：

1. 服务端发布房间更新事件
2. 客户端收到 SSE
3. 客户端重新拉取整份房间快照

因此如果 UI 不刷新，要同时检查“事件有没有发出”和“快照有没有更新”。

### 10.3 客户端表现问题

优先看：

- `src/game-client/scenes/MatchScene.ts`
- `src/game-client/scenes/HudScene.ts`
- `src/app/globals.css`

常见类别：

- 棋子位置/动画：`MatchScene.ts`
- 侧边 HUD 和弹窗：`HudScene.ts`
- 样式重叠或尺寸：`globals.css`

## 11. 提交前最小检查

建议至少执行：

```bash
npm run lint
npm test
npm run build
```

如果改动范围较大，建议再人工验证：

- 创建房间
- 开始游戏
- 掷骰并触发一个特殊格
- 查看 HUD、棋盘中心信息、事件记录

## 12. 开发注意事项

- 本项目采用“服务端权威状态”，不要把核心规则只写在前端。
- 新增规则时，优先考虑是否需要进入 `RoomSnapshotView`。
- 大多数可见变化都应该能从 `snapshot.ts` 追踪到来源。
- 新增棋盘类型时，要同步更新图标、颜色、标签、落地逻辑与测试。
- 修改回合 / 状态机时，务必检查：
  - `GamePhase`
  - `HudScene` 按钮显示
  - `MatchScene` 文案
  - `autoplay.ts` 托管行为
