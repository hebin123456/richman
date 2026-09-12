# 架构文档

本文档描述 `掌上大富翁` 的核心架构、状态流与模块边界，帮助开发者理解系统如何组织与扩展。

## 1. 架构目标

项目当前的核心目标：

- 使用服务端权威状态，避免前端各端状态漂移
- 使用统一快照作为前后端契约
- 将游戏规则集中在领域层，避免散落在 UI 中
- 保持 Phaser 表现层与业务规则解耦
- 用轻量实时同步机制支持多人对局

## 2. 整体分层

从上到下可以概括为四层：

1. **页面与 API 层**
   Next.js App Router 页面和 Route Handler。
2. **客户端运行时层**
   `GameRuntime`、`RoomGateway`、`RuntimeStore`、Phaser Scenes。
3. **领域规则层**
   `src/lib/game` 中的引擎、快照与规则模块。
4. **持久化与事件层**
   Prisma + SQLite + `GameEvent` + 进程内事件总线。

## 3. 目录职责

### 3.1 `src/app`

- 负责页面路由和 HTTP API。
- 页面层不承载核心游戏规则，只负责挂载宿主组件。
- Route Handler 调用领域层函数，返回快照或操作结果。

关键路径：

- `src/app/page.tsx`
- `src/app/rooms/[roomCode]/page.tsx`
- `src/app/api/rooms/**`
- `src/app/api/games/[gameId]/actions/route.ts`

### 3.2 `src/game-client`

- 负责浏览器侧运行时和 Phaser UI。
- 不直接维护“最终正确”的游戏状态。
- 所有场景都依赖 `GameRuntime` 和 `RuntimeStore` 中的快照。

关键路径：

- `src/game-client/phaser/GameHost.tsx`
- `src/game-client/phaser/GameRuntime.ts`
- `src/game-client/net/roomGateway.ts`
- `src/game-client/state/runtimeStore.ts`
- `src/game-client/scenes/*.ts`

### 3.3 `src/lib/game`

- 负责所有核心规则与服务端权威状态变更。
- `engine.ts` 是主要写入口。
- `snapshot.ts` 是主要读/组装入口。

关键路径：

- `src/lib/game/engine.ts`
- `src/lib/game/snapshot.ts`
- `src/lib/game/types.ts`
- `src/lib/game/board.ts`
- `src/lib/game/items.ts`
- `src/lib/game/gods.ts`
- `src/lib/game/cards.ts`
- `src/lib/game/autoplay.ts`

### 3.4 `prisma`

- 负责数据模型。
- `Game`、`PlayerState`、`PropertyState`、`GameEvent` 等都是权威状态来源。

关键路径：

- `prisma/schema.prisma`

## 4. 服务端权威模型

本项目采用 **服务端权威（server-authoritative）** 模型。

含义：

- 真正的对局状态只存在于数据库和服务端事务上下文里。
- 客户端提交的是“动作请求”，不是直接修改状态。
- 客户端收到的是快照，用来渲染与交互。

### 4.1 权威状态落点

主要存储在以下模型：

- `Room`
- `RoomSettings`
- `Game`
- `PlayerState`
- `PropertyState`
- `StockState`
- `PlayerStockHolding`
- `PlayerInventoryItem`
- `GameEvent`

### 4.2 为什么这样做

优点：

- 多人同步更稳定
- 托管 / 机器人可以直接复用服务端规则
- 不容易出现“前端看起来成功，服务端其实拒绝”的双写分叉
- 回放事件和排查问题更直接

代价：

- 客户端大部分交互都要依赖服务端 phase
- 规则变更需要同时考虑快照与 UI 展示

## 5. 快照模型

客户端使用的主契约是 `RoomSnapshotView`，定义位于：

- `src/lib/game/types.ts`

快照由：

- `src/lib/game/snapshot.ts`

统一组装。

### 5.1 快照的作用

- 为房间页提供统一的读取模型
- 让客户端不直接依赖 Prisma 实体
- 对不同阶段 UI 提供稳定字段
- 隔离 DB schema 细节

### 5.2 设计意义

这使得：

- API route 返回值统一
- 前端切场景逻辑更简单
- 新增服务端字段时，可以按需暴露给客户端，而不是直接穿透 ORM 数据

## 6. 运行时数据流

## 6.1 启动流程

1. 页面渲染 `GameHost`
2. `GameHost` 创建 `GameRuntime`
3. `GameRuntime.start()` 根据当前路由初始化
4. `BootScene` 根据 `RuntimeStore` 中的状态决定进入 `HomeScene`、`LobbyScene` 或 `MatchScene`

## 6.2 房间同步流程

1. `GameRuntime` 调用 `RoomGateway.connectRoomEvents`
2. 浏览器建立 SSE 到 `GET /api/rooms/[roomCode]/events`
3. 服务端有变化时，通过事件总线推送房间更新通知
4. 客户端收到通知后调用 `refreshRoom(false)`
5. `RoomGateway.loadRoomSnapshot` 拉取完整 `RoomSnapshotView`
6. `RuntimeStore.patchState` 更新状态
7. Phaser 场景重新渲染

### 6.3 关键原则

实时通道只负责“通知你有变化”，真正的状态来源仍然是快照。

这意味着：

- 不需要在 SSE 里复刻完整业务 DTO
- 客户端只需要维护一个状态来源
- 更适合规则频繁变化的项目

## 7. 局内动作流

以掷骰为例：

1. 玩家在 `HudScene` 点击按钮
2. `HudScene` 调用 `runtime.performGameAction({ type: "rollDice" })`
3. `GameRuntime` 通过 `RoomGateway` 调用动作 API
4. API route 调用 `performGameAction`
5. `engine.ts` 在 Prisma 事务中：
   - 校验当前玩家
   - 校验 phase
   - 修改 `Game` / `PlayerState` / 其它状态
   - 持久化
   - 追加 `GameEvent`
   - 重新生成 snapshot
6. API 把 snapshot 返回给当前请求方
7. 同时服务端发布房间更新事件
8. 房间中其他客户端收到 SSE 后重新拉取 snapshot

## 8. 并发控制

局内动作使用 `Game.version` 作为乐观并发控制的一部分。

相关位置：

- `src/lib/game/types.ts`
- `src/lib/game/engine.ts`

基本思路：

- 客户端请求可以带 `clientVersion`
- 服务端比对当前 `Game.version`
- 不一致时拒绝，提示客户端等待同步

这能避免：

- 同一玩家连续点击造成的过期动作
- 网络延迟下的旧状态覆盖新状态

## 9. 事件与实时同步

### 9.1 事件存储

业务操作会写入 `GameEvent` 表，包括：

- `sequence`
- `eventType`
- `summary`
- `payload`

这让事件既可用于：

- HUD 事件列表
- 自动弹窗
- 调试追踪
- 实时通知触发点

### 9.2 事件总线

当前使用：

- `src/lib/game/event-bus.ts`

它是 **单进程内事件总线**。

优点：

- 简单
- 延迟低
- 易于接入 SSE

限制：

- 如果未来需要多实例部署，必须替换为 Redis Pub/Sub、消息队列或其它跨进程方案

## 10. Phaser 客户端架构

客户端表现层被拆成多个场景：

- `BootScene`
  资源预加载与视图切换。
- `HomeScene`
  首页与建房入口。
- `LobbyScene`
  房间准备与设置。
- `MatchScene`
  棋盘、棋子、动画、中心信息。
- `HudScene`
  操作按钮、面板、弹窗、事件提示。

### 10.1 为什么拆成两个对局场景

对局中采用：

- `MatchScene` 负责“棋盘表现”
- `HudScene` 负责“操作与信息”

优点：

- 视觉逻辑和交互逻辑分离
- DOM HUD 和 Phaser 棋盘互不干扰
- 弹窗体系更容易维护

## 11. 规则模块化

虽然 `engine.ts` 仍是主入口，但规则已经开始按领域拆分：

- `economy.ts`
  价格、租金、税金、通胀等。
- `cards.ts`
  机会 / 命运牌定义。
- `items.ts`
  道具定义。
- `gods.ts`
  神明定义。
- `lottery.ts`
  彩票规则。
- `shop.ts`
  商店货架逻辑。
- `map-gods.ts`
  地图神明生成与轮转。
- `travel-gods.ts`
  路径型神明处理。
- `reaction.ts`
  免费卡 / 免罪卡等响应状态。
- `recovery.ts`
  现金不足后的抵押恢复上下文。

### 11.1 当前边界

推荐理解方式是：

- **定义型模块**：描述数据结构和计算工具
- **引擎型模块**：由 `engine.ts` 串起来完成完整动作

也就是说：

- 新规则可以先落在专用模块
- 最后仍需要在 `engine.ts` 接入 phase 与持久化流程

## 12. 自动托管与机器人

托管/机器人逻辑在服务端完成，而不是前端模拟。

关键文件：

- `src/lib/game/autoplay.ts`

优点：

- 不依赖玩家页面是否打开
- 多人房间行为一致
- 规则判断和真实动作走同一套接口

要点：

- 自动托管最终仍通过 `performAutomatedGameAction` 走引擎
- 因此机器人与玩家共享同一套规则约束

## 13. 资源与展示约束

棋盘格图标来自：

- `public/tile-icons`

角色素材来自：

- `public/characters`
  或角色配置中对应路径

若新增格子类型，需要同步更新：

- `board.ts`
- `boardLayout.ts`
- `BootScene.ts`
- `MatchScene.ts`
- 对应图标资源

## 14. 典型扩展点

### 14.1 新增一个特殊格

通常需要改动：

1. `board.ts`
2. 图标与颜色
3. `MatchScene` 的格子说明
4. `engine.ts` 的落地结算
5. 相关测试
6. 文档

### 14.2 新增一个新道具 / 神明 / 牌

通常需要改动：

1. 定义模块
2. 引擎接线
3. 快照字段（如果客户端要看见）
4. UI 文案与交互
5. 自动托管策略
6. 测试

## 15. 当前架构最重要的约束

开发时最需要记住的 8 点：

1. 核心规则不要只写在前端。
2. 前端状态不是权威状态，快照才是。
3. 实时同步是 SSE 通知 + refetch，不是状态直推。
4. `snapshot.ts` 是前后端视图契约的单一出口。
5. `engine.ts` 是动作状态机的主入口。
6. 新 phase 需要同步更新 HUD、托管和文本展示。
7. 新格子 / 新规则要同步更新图标、文案和测试。
8. 当前事件总线是单进程方案，多实例部署前必须先升级同步基础设施。
