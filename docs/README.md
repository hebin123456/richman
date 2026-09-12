# 掌上大富翁文档索引

本目录用于维护项目的长期文档，面向开发、维护、联调和测试。

建议阅读顺序：

1. `development.md`
   本地开发、环境准备、常用命令、调试入口。
2. `architecture.md`
   目录职责、运行时数据流、服务端权威状态、实时同步模型。
3. `api.md`
   HTTP 接口、SSE 事件格式、鉴权头与主要请求/响应结构。
4. `realtime-sequence.md`
   联机同步与 SSE 时序图，解释动作、快照和事件通知的关系。
5. `testing.md`
   自动化测试策略、手工测试流程、提交流程中的测试要求。
6. `test-cases.md`
   适合回归测试和提测时复用的核心测试用例清单。

## 文档边界

- `development.md` 关注“怎么开发、怎么跑起来”。
- `architecture.md` 关注“系统怎么组织、状态怎么流动”。
- `api.md` 关注“有哪些接口、怎么调用、怎么鉴权”。
- `realtime-sequence.md` 关注“多人联机时状态是怎么同步的”。
- `testing.md` 关注“怎么验证改动是安全的”。
- `test-cases.md` 关注“具体要测哪些场景”。

## 当前项目概览

- 技术栈：Next.js App Router、React、TypeScript、Phaser、Prisma、SQLite、Vitest。
- 运行端口：开发与生产默认均为 `10086`。
- 数据库：默认使用本地 SQLite，连接串默认值见 `src/lib/db.ts`。
- 游戏状态：服务端权威，客户端通过快照渲染。
- 实时同步：SSE 事件通知 + 客户端重新拉取房间快照。

## 维护建议

- 新增规则时，优先同步更新 `architecture.md` 的“规则扩展入口”与 `test-cases.md` 的回归场景。
- 新增自动化测试后，记得补充 `testing.md` 中的覆盖说明。
- 当目录职责或核心数据流变化时，先更新文档再做大规模功能扩展，避免认知漂移。
