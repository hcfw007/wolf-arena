# AGENTS.md — wolf-arena

9 个 LLM 玩中文狼人杀的对战引擎。**代码控制流程，LLM 只负责决策**：身份分配、死亡、技能结算、胜负判定全在代码里，AI 只输出「说什么」和「投/刀谁」，外加一段 `<thinking>` 内心戏。

## 常用命令

```bash
npm install          # 依赖未随仓库提交，任何校验前先装

npm run typecheck    # tsc --noEmit，改代码后必跑
npm run lint         # eslint src（配置来自 @ddyscn/lint-config）
npm test             # node:test，单元测试 + 假 provider 跑完整局
npm run lint:fix

npm start            # 跑一整局 9 人对局，约 50-70 次 API 调用
npm run smoke        # 冒烟：狼人+预言家各发一段话，只需 2 次调用
npm start -- --provider fake --days 3 --format all   # 不联网跑通全流程（本地调试首选）
```

`npm start` / `npm run smoke` 需要 `.env` 里的 `DEEPSEEK_API_KEY`（见 `.env.example`，可改 `DEEPSEEK_BASE_URL` / `DEEPSEEK_MODEL`）。**`npm test` 和 `--provider fake` 不需要 API key、不花钱**，改完逻辑优先靠它们验证；只有接入真实模型的行为差异才需要 `npm run smoke`。`npm run build`（tsc 输出到 `dist/`）平时用不到，日常都走 tsx，dist 里会连带输出测试文件，不用管。

CLI 参数定义在 `src/cli-args.ts`（纯函数，`parseCliArgs` 有单测）。加新参数时改 ARG_SPEC + `CliOptions`/`DEFAULTS` + `USAGE` 三处，并补 `cli-args.test.ts`。

测试文件与被测模块同目录（`src/**/*.test.ts`）。注意 `tsx --test` 的模式必须**加引号**，否则 shell 会把 `**` 当成单层 `*`，静默漏掉 `src/*.test.ts`。

## 代码结构

```
src/
├── cli.ts              入口：PLAYERS 配置（9 人身份 + 人设）+ 跑满一局 + 落盘复盘
├── cli-args.ts         命令行参数解析；cli-args.test.ts 覆盖各分支
├── smoke.ts            冒烟脚本，5 人简化配置
├── recorder.ts         GameRecorder：收集 ReplayData，按格式渲染落盘
├── replay/
│   ├── types.ts        ReplayData / ReplayDay 等结构化定义
│   ├── markdown.ts     Markdown 渲染 + winnerLabel()
│   └── html.ts         单文件 HTML 渲染（必须转义 LLM 输出）
├── game/
│   ├── master.ts       GameMaster：唯一流程权威，阶段编排 / 投票与 PK / 公开历史渲染
│   ├── master.test.ts  整局流程、死因不泄露、信息隔离、平票 PK
│   ├── winner.ts       evaluateWinner：屠边 / 屠城胜负判定（纯函数）
│   ├── winner.test.ts  两种赛制的边界
│   └── types.ts        Role / Faction / PlayerState / GameState / PublicEvent / PhaseKind
├── ai/
│   ├── player.ts       AIPlayer：speak / vote / chooseTarget / witchSaveDecision
│   ├── player.test.ts  解析兜底、跳过语义、长度截断
│   ├── prompts.ts      ROLE_GUIDE（角色守则）+ 发言 prompt 组装
│   └── parse.ts        parseSpeech / clipText：从原始输出里抠 thinking & speech
└── providers/
    ├── types.ts        ChatMessage / CompleteOptions / CompleteResult / TokenTotals / LLMProvider
    ├── deepseek.ts     DeepSeek 实现，429/5xx/网络错误退避重试 3 次
    └── fake.ts         确定性假 provider，测试与 --provider fake 用
```

数据流：`GameMaster` 每个阶段 → 组装该玩家视角的 `publicHistory` + `privateInfo` → 调 `AIPlayer.*` → provider 请求 → `parse.ts` 解析 → GameMaster 裁决并写 `publicLog`；同时把过程交给 `GameRecorder` 存成 `ReplayData`，最后在 `replay/` 里渲染成三种格式。

## 必须守住的不变量

1. **GameMaster 是唯一裁判**。LLM 说的任何话都不改状态：谁死、谁赢、查验结果只能由 `master.ts` 决定。新增技能逻辑也照此办理，不要让模型返回值直接落状态。
2. **信息隔离靠 `privateInfoFor(id)`**。每个 prompt 只允许拼进该玩家应知道的信息（自己身份、狼队友、查验记录、药剂状态）。新增私密信息时只加在这个方法里，**不要**图省事走 `publicLog`。`master.test.ts` 会按玩家编号断言这三类信息没有串门。
3. **公开信息与复盘故意不对称**。公开历史（`renderPublicHistory()`）里狼刀和女巫毒杀都只是「昨夜倒牌出局」，不写死因；死因只进 `GameRecorder`（上帝视角复盘）。改 `PublicEvent` 时别把死因漏回公开文案。
4. **公开历史统一由 `renderPublicHistory()` 生成**（`sinceDay` 可选）。想让玩家「看到」某事，就 push 一条 `PublicEvent` 到 `state.publicLog`；不要在 prompt 里另起一套叙述。
5. **`ROLE_FACTION` / `ROLE_LABEL_CN` / `PHASE_LABEL_CN` 是角色→阵营、角色→中文名、阶段→中文名的唯一映射**（`game/types.ts`）。别在别处硬编码这些对应关系。
6. **provider 只依赖 `LLMProvider` 接口**（`providers/types.ts`），`GameMaster` / `AIPlayer` 不得 import 具体 provider。新 provider 只需实现一个 `complete()` 加一个 `totals` 计数器。
7. **解析必须有兜底**。LLM 输出不可信：`VOTE:` / `TARGET:` / `SAVE:` 解析失败或编号非法时回退到候选列表里的合法值。新增决策点时照抄这个模式并补测试。
8. **胜负判定只走 `evaluateWinner()`**（`game/winner.ts`，纯函数、有单测）。不要在 `master.ts` 里另写一套人数比较。
9. **复盘只有一份数据源**。过程写进 `ReplayData`（`replay/types.ts`），格式在 `replay/markdown.ts` / `replay/html.ts` 里渲染；不要在 `recorder.ts` 里拼字符串。HTML 渲染必须 `esc()` 所有 LLM 产出的文本。

## 对局流程（master.ts）

每晚：狼人两轮商议（第一轮各自提议 → 第二轮看到队友理由后终投，多数票决定刀谁）→ 预言家查验 → 女巫（救人判定 + 毒药判定）→ 结算夜晚死亡 → 猎人若被狼刀则开枪 → 白天公告 / 依次发言 / 投票 → 平票则平票者补一轮 PK 发言、全体只在平票者之间重投（再平票才无人出局）→ 被投出者若是猎人则开枪 → 判胜负。

胜负（`evaluateWinner`）：狼全死 → 好人胜；屠边（默认）—— 神职全灭或平民全灭 → 狼胜；屠城（`--win-condition city`）—— 狼数 ≥ 好人数 → 狼胜；`run(maxDays)` 默认 8 天打不完则判狼胜。`state.phase` 在每个阶段入口处更新，`endGame()` 置 `game-over`。

## 已知的坑

- **`justSaved` 已不存在**：女巫是否救人的信息由 `runWitchPhase()` 的返回值向上传（`{poisoned, saved}`），不要再往 `GameState` 或类字段里塞临时状态。
- **女巫解药只在 `killedTonight !== null && killedTonight !== witch.id` 时询问**（女巫不能自救）；毒药每夜都问（`allowSkip: true`，不毒输出 `TARGET: none`）。
- **猎人被毒杀不开枪**（`maybeHunterShoot` 只在狼刀和投票出局后调用），这是有意为之。
- **发言长度限制是双层的**：prompt 里写 `SPEECH_MAX_CHARS`，`AIPlayer.speak` 再用 `clipText` 硬截到 `maxChars + 10`（超长加 `…`）。
- **PK 相关**：平票者在 `leading()` 里按编号升序排列（保证发言顺序确定）；PK 发言走 `SpeakContext.note` 而不是新开一个 speak 方法；重投时 `candidates` 就是平票者，`AIPlayer.vote` 会自动排除自己。
- **`ReplayWitch.poison` 的三态**：`undefined` = 当晚没被问到（毒已用 / 女巫已死），`null` = 问了但不用。渲染时别把两者混为一谈。
- **TS 里 import 写 `.js` 后缀**（如 `../game/types.js`），`moduleResolution: "Bundler"` + ESM。新增文件沿用这个写法和目录层级。
- 复盘/日志目录 `logs/`、`replays/` 已在 `.gitignore` 里，别提交产物。

## 代码风格

语句不加分号，但 `interface` / 类型成员行尾保留 `;`；单引号、2 空格缩进、`import {A} from 'x'` 花括号内不加空格。由 `@ddyscn/lint-config` 强制，`no-console` 已关闭（CLI 输出和 chalk 日志是产品的一部分）。对象结构用 `interface`（`PlayerState`、`GameState`、`GameMasterOpts`），联合类型用 `type`（`Role`、`PublicEvent`、`PhaseKind`）。

改人设 / 身份分布只动 `cli.ts` 的 `PLAYERS`（保持 3 狼 / 1 预言家 / 1 女巫 / 1 猎人 / 3 平民的均衡配比）；调 AI 强度或话术动 `src/ai/prompts.ts` 的 `ROLE_GUIDE`；换模型后端实现 `LLMProvider` 并注入 `GameMaster`。
