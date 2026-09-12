# 接口文档

本文档描述当前房间系统、对局系统和实时同步相关的主要接口。

约定：

- Base Path：如项目配置了 `NEXT_PUBLIC_BASE_PATH`，以下路径需要加上对应前缀。
- 鉴权：玩家身份通过 `x-player-token` 传递。
- 主要返回：大部分成功写操作都返回最新的 `RoomSnapshotView`。
- 错误返回：失败时通常返回 `{ "error": "..." }`，并带对应 HTTP 状态码。

## 1. 认证与公共约定

### 1.1 玩家凭证

Header 名称：

```http
x-player-token: <playerToken>
```

服务端解析位置见 `src/lib/session/player-session.ts`。

说明：

- `GET /api/rooms/[roomCode]` 可通过查询参数 `?token=...` 读取玩家视角快照。
- 其他需要玩家身份的接口，建议统一使用 `x-player-token`。

### 1.2 主要响应类型

常见响应体：

- `RoomSnapshotView`
  完整房间快照，包含 lobby 或 in-game 视图。
- `{ roomCode, token, snapshot }`
  创建房间、加入房间的返回结构。
- `{ rooms: RoomListItemView[] }`
  房间列表。
- `{ ok: true }`
  心跳确认。

相关定义见：

- `src/lib/game/types.ts`

## 2. 房间接口

### 2.1 获取可加入房间列表

`GET /api/rooms`

用途：

- 首页房间列表轮询或刷新

成功响应：

```json
{
  "rooms": [
    {
      "code": "1234",
      "hostName": "房主",
      "playerCount": 2,
      "maxPlayers": 4,
      "takenCharacterIds": ["sunwukong"],
      "players": [
        {
          "name": "房主",
          "characterName": "孙悟空",
          "isHost": true
        }
      ],
      "updatedAt": "2026-05-07T04:00:00.000Z"
    }
  ]
}
```

实现：

- `src/app/api/rooms/route.ts`

### 2.2 创建房间

`POST /api/rooms`

请求体：

```json
{
  "hostName": "玩家一",
  "characterId": "sunwukong",
  "settings": {
    "startingCash": 2000,
    "passStartSalary": 200,
    "maxPlayers": 4,
    "parkingJackpotEnabled": true,
    "stocksEnabled": false,
    "turnSeconds": 120
  }
}
```

说明：

- `hostName` 长度要求：2 到 16。
- `characterId` 必填。
- `settings` 为可选局部配置。
- `jailFine` 仍保留在接口 schema 中，主要用于兼容旧配置，但当前监狱规则已改为固定服刑，不再提供保释玩法。

成功响应：

```json
{
  "roomCode": "1234",
  "token": "player_token_here",
  "snapshot": {}
}
```

实现：

- `src/app/api/rooms/route.ts`

### 2.3 获取房间快照

`GET /api/rooms/[roomCode]?token=<playerToken>`

用途：

- 进入房间时拉取初始快照
- SSE 更新后重新拉取全量快照

成功响应：

- `RoomSnapshotView`

说明：

- `token` 可选
- 有 token 时会尽量返回对应玩家视角下的 `currentPlayer`
- 无 token 也可用于房间存在性判断或游客视角读取

实现：

- `src/app/api/rooms/[roomCode]/route.ts`

### 2.4 更新大厅状态

`PATCH /api/rooms/[roomCode]`

Header：

```http
x-player-token: <playerToken>
Content-Type: application/json
```

请求体：

```json
{
  "characterId": "sunwukong",
  "isReady": true
}
```

说明：

- 两个字段都可选
- 用于切换角色、准备/取消准备

成功响应：

- `RoomSnapshotView`

实现：

- `src/app/api/rooms/[roomCode]/route.ts`

### 2.5 加入房间

`POST /api/rooms/[roomCode]/join`

请求体：

```json
{
  "playerName": "玩家二",
  "characterId": "zhugebuliang"
}
```

限制：

- `playerName` 长度要求：2 到 16
- 角色不可与房内已有角色重复

成功响应：

```json
{
  "roomCode": "1234",
  "token": "player_token_here",
  "snapshot": {}
}
```

实现：

- `src/app/api/rooms/[roomCode]/join/route.ts`

### 2.6 更新房间设置

`PATCH /api/rooms/[roomCode]/settings`

Header：

```http
x-player-token: <playerToken>
Content-Type: application/json
```

请求体：

```json
{
  "startingCash": 2000,
  "passStartSalary": 200,
  "maxPlayers": 4,
  "parkingJackpotEnabled": true,
  "stocksEnabled": false,
  "turnSeconds": 120
}
```

说明：

- 所有字段都可选
- 当前 UI 侧不再暴露 `jailFine`，但接口 schema 中仍保留

成功响应：

- `RoomSnapshotView`

实现：

- `src/app/api/rooms/[roomCode]/settings/route.ts`

### 2.7 开始游戏

`POST /api/rooms/[roomCode]/start`

Header：

```http
x-player-token: <playerToken>
```

约束：

- 仅房主可调用
- 至少 2 名玩家
- 所有玩家必须已准备

成功响应：

- `RoomSnapshotView`

副作用：

- 服务端会立即触发自动托管/机器人调度

实现：

- `src/app/api/rooms/[roomCode]/start/route.ts`

### 2.8 托管开关

`PATCH /api/rooms/[roomCode]/control`

Header：

```http
x-player-token: <playerToken>
Content-Type: application/json
```

请求体：

```json
{
  "managed": true
}
```

成功响应：

- `RoomSnapshotView`

说明：

- 当切换后的当前行动玩家是托管或机器人时，服务端会继续调度自动行动

实现：

- `src/app/api/rooms/[roomCode]/control/route.ts`

### 2.9 心跳

`POST /api/rooms/[roomCode]/heartbeat`

Header：

```http
x-player-token: <playerToken>
```

成功响应：

```json
{
  "ok": true
}
```

用途：

- 更新玩家在线状态
- 刷新当前回合玩家的托管超时计时器

实现：

- `src/app/api/rooms/[roomCode]/heartbeat/route.ts`

### 2.10 添加机器人

`POST /api/rooms/[roomCode]/bots`

Header：

```http
x-player-token: <playerToken>
```

成功响应：

- `RoomSnapshotView`

实现：

- `src/app/api/rooms/[roomCode]/bots/route.ts`

### 2.11 移除机器人

`DELETE /api/rooms/[roomCode]/bots/[playerId]`

Header：

```http
x-player-token: <playerToken>
```

成功响应：

- `RoomSnapshotView`

实现：

- `src/app/api/rooms/[roomCode]/bots/[playerId]/route.ts`

## 3. 对局动作接口

### 3.1 提交对局动作

`POST /api/games/[gameId]/actions`

Header：

```http
x-player-token: <playerToken>
Content-Type: application/json
```

请求体结构：

```json
{
  "type": "rollDice",
  "clientVersion": 12
}
```

### 3.2 支持的 `type`

当前动作类型：

- `rollDice`
- `buyProperty`
- `skipPurchase`
- `declineReaction`
- `buyItem`
- `skipShop`
- `buyLotteryTicket`
- `skipLottery`
- `manageBank`
- `skipBank`
- `castMagic`
- `skipMagic`
- `playAmusement`
- `endTurn`
- `payJailFine`
- `useJailFreeCard`
- `buildHouse`
- `mortgage`
- `unmortgage`
- `buyStock`
- `sellStock`
- `useItem`
- `declareBankruptcy`

说明：

- `payJailFine` 仍保留在动作枚举中，但当前规则会直接报错，因为监狱已改成固定服刑。

### 3.3 可选字段

根据不同动作，可能使用这些字段：

- `clientVersion`
- `diceCount`
- `controlledRollTotal`
- `tileIndex`
- `stockSymbol`
- `shares`
- `itemKey`
- `targetPlayerId`
- `lotteryNumber`
- `bankChoice`
- `magicKey`
- `amusementChoice`

定义位置：

- `src/lib/game/types.ts`
- `src/app/api/games/[gameId]/actions/route.ts`

### 3.4 成功响应

成功后返回：

- `RoomSnapshotView`

副作用：

- 动作会写入 `GameEvent`
- 服务端会推送 `room-updated` SSE 事件
- 若需要，服务端会继续调度机器人/托管

实现：

- `src/app/api/games/[gameId]/actions/route.ts`

## 4. SSE 实时接口

### 4.1 建立房间事件流

`GET /api/rooms/[roomCode]/events`

返回：

- `text/event-stream`

当前可能发送的 payload：

#### 连接成功

```json
{
  "type": "connected",
  "roomCode": "1234"
}
```

#### 房间更新

```json
{
  "type": "room-updated",
  "roomCode": "1234",
  "sequence": 15,
  "eventType": "rollDice",
  "summary": "玩家一 掷出了 4 = 4。"
}
```

#### 心跳

```json
{
  "type": "heartbeat",
  "roomCode": "1234",
  "timestamp": 1746590400000
}
```

说明：

- 客户端当前只消费 `room-updated`
- 收到 `room-updated` 后会重新调用 `GET /api/rooms/[roomCode]`
- SSE 本身不推送完整快照

实现：

- `src/app/api/rooms/[roomCode]/events/route.ts`
- `src/lib/game/event-bus.ts`
- `src/game-client/net/roomGateway.ts`

## 5. 常见错误码

常见状态码：

- `400`
  参数错误或业务校验失败
- `401`
  缺少玩家凭证
- `403`
  权限不足，例如非房主开始游戏
- `404`
  房间不存在
- `409`
  客户端版本过期、未轮到当前玩家、当前状态不允许该动作
- `500`
  服务端内部错误或规则上下文异常

返回体通常为：

```json
{
  "error": "还没有轮到你行动。"
}
```

## 6. 客户端实际调用入口

如需查看浏览器侧实际如何消费这些接口，请看：

- `src/game-client/net/roomGateway.ts`
- `src/game-client/phaser/GameRuntime.ts`

这两处基本可以作为“接口调用参考实现”。
