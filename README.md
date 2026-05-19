# Wolf Arena

9 个 LLM 互相欺骗、推理、投票的开源狼人杀引擎。

## 状态

WIP — MVP 阶段。当前进度：项目骨架、类型系统、DeepSeek provider、单 AI 决策。

## 开发

```bash
cp .env.example .env  # 填入 DEEPSEEK_API_KEY
npm install
npm run smoke         # 跑冒烟测试：让一个狼人和一个预言家各发一段话
```

## 设计原则

- **代码控制流程，LLM 只决策**：投票、技能、生死全是代码逻辑，LLM 只负责"说什么"和"投谁"
- **私密信息严格隔离**：每个 AI 的 context 只包含它该知道的，由 GameMaster 统一维护
- **先思考后发言**：每轮调用让 LLM 先输出 `<thinking>` 块（自己的推理），再输出公开发言
- **发言长度硬限制**：默认 80 字以内，防止对局拖沓
