import {DeathReason, Faction, PlayerId, ROLE_LABEL_CN} from '../game/types.js'
import {ReplayData, ReplayDay, ReplaySpeech} from './types.js'

const DEATH_REASON_CN: Record<DeathReason, string> = {
  wolves: '昨夜倒牌',
  poison: '昨夜被毒',
  vote: '被投票出局',
  hunter: '被猎人开枪带走',
}

export function toMarkdown(data: ReplayData): string {
  const ctx: Ctx = {
    data,
    lines: [],
    name: (id) => playerName(data, id),
    role: (id) => playerRole(data, id),
  }
  ctx.lines.push('# Wolf Arena 对局复盘')
  ctx.lines.push(`\n_对局时间：${data.startedAt}_\n`)
  pushRoster(ctx)
  for (const day of data.days) pushDay(ctx, day)
  pushResult(ctx)
  return ctx.lines.join('\n')
}

interface Ctx {
  data: ReplayData;
  lines: string[];
  name: (id: PlayerId) => string;
  role: (id: PlayerId) => string;
}

function playerName(data: ReplayData, id: PlayerId): string {
  return data.players.find((p) => p.id === id)?.name ?? `${id}号`
}

function playerRole(data: ReplayData, id: PlayerId): string {
  const role = data.players.find((p) => p.id === id)?.role
  return role ? ROLE_LABEL_CN[role] : '未知'
}

function pushRoster(ctx: Ctx) {
  ctx.lines.push('## 身份分配\n')
  ctx.lines.push('| 编号 | 名字 | 身份 | 人设 |')
  ctx.lines.push('| ---- | ---- | ---- | ---- |')
  for (const p of ctx.data.players) {
    ctx.lines.push(`| ${p.id} | ${p.name} | ${ROLE_LABEL_CN[p.role]} | ${p.personality} |`)
  }
  ctx.lines.push('')
}

function pushDay(ctx: Ctx, day: ReplayDay) {
  ctx.lines.push(`\n---\n\n## 第 ${day.day} 天\n`)
  pushNight(ctx, day)
  pushDaytime(ctx, day)
}

function pushNight(ctx: Ctx, day: ReplayDay) {
  ctx.lines.push('### 夜晚\n')

  if (day.wolves.proposals.length > 0) {
    ctx.lines.push('**狼队第一轮商议**\n')
    for (const p of day.wolves.proposals) {
      const target = p.choice === null ? '?' : `${p.choice}号`
      ctx.lines.push(`- 狼 ${p.wolfId}号(${ctx.name(p.wolfId)}) 提议刀 **${target}** — ${p.thinking || '（无理由）'}`)
    }
    ctx.lines.push('')
  }

  if (day.wolves.finals.length > 0) {
    ctx.lines.push('**狼队最终投票**\n')
    for (const v of day.wolves.finals) {
      const target = v.choice === null ? '?' : `${v.choice}号`
      ctx.lines.push(`- 狼 ${v.wolfId}号(${ctx.name(v.wolfId)}) 终投 **${target}** — ${v.thinking || ''}`)
    }
  }
  ctx.lines.push(
    day.wolves.target === null
      ? '\n> 狼队未达成有效决策\n'
      : `\n> 🗡 狼队最终刀杀目标：**${day.wolves.target}号(${ctx.name(day.wolves.target)})**\n`,
  )

  if (day.seer) {
    const r = day.seer.result === 'wolves' ? '🔴 查杀' : '🟢 金水'
    ctx.lines.push(
      `**预言家查验**：${day.seer.seerId}号 → ${day.seer.target}号(${ctx.name(day.seer.target)})  ${r}\n`,
    )
  }

  if (day.witch.save) {
    ctx.lines.push(
      day.witch.save.saved
        ? `**女巫**：使用解药救 ${day.witch.save.target}号(${ctx.name(day.witch.save.target)})\n`
        : '**女巫**：不救（解药保留）\n',
    )
  }
  if (day.witch.poison !== undefined) {
    ctx.lines.push(
      day.witch.poison === null
        ? '**女巫**：不使用毒药\n'
        : `**女巫**：💊 毒杀 ${day.witch.poison}号(${ctx.name(day.witch.poison)})\n`,
    )
  }
}

function pushDaytime(ctx: Ctx, day: ReplayDay) {
  ctx.lines.push(`### 第 ${day.day} 天 白天\n`)
  if (day.deaths.length === 0) {
    ctx.lines.push('☀️ **平安夜！**\n')
  } else {
    for (const d of day.deaths) {
      ctx.lines.push(
        `- ☠️ ${d.id}号(${ctx.name(d.id)}) [${ctx.role(d.id)}] — ${DEATH_REASON_CN[d.reason]}`,
      )
    }
    ctx.lines.push('')
  }

  if (day.hunter) {
    ctx.lines.push(`**猎人开枪**：${day.hunter.hunterId}号(${ctx.name(day.hunter.hunterId)})`)
    if (day.hunter.thinking) ctx.lines.push(`> 💭 ${day.hunter.thinking}`)
    ctx.lines.push(
      day.hunter.target === null
        ? '> 选择不开枪\n'
        : `> 💥 带走 **${day.hunter.target}号(${ctx.name(day.hunter.target)})**\n`,
    )
  }

  if (day.speeches.length > 0) {
    ctx.lines.push('#### 讨论\n')
    for (const s of day.speeches) pushSpeech(ctx, s)
  }

  if (day.pkSpeeches.length > 0) {
    ctx.lines.push('#### 平票 PK 发言\n')
    for (const s of day.pkSpeeches) pushSpeech(ctx, s)
  }

  for (const round of day.voteRounds) {
    ctx.lines.push(`#### 投票${round.label ? `（${round.label}）` : ''}\n`)
    const counts = new Map<PlayerId, number>()
    for (const v of round.votes) {
      ctx.lines.push(`- ${v.voter}号(${ctx.name(v.voter)}) → ${v.target}号(${ctx.name(v.target)})`)
      counts.set(v.target, (counts.get(v.target) ?? 0) + 1)
    }
    const tally = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id, n]) => `${id}号: ${n}票`)
      .join('，')
    ctx.lines.push(`\n_统计：${tally}_\n`)
    ctx.lines.push(
      round.executed === null
        ? '> 🤝 平票或无人达成出局票数\n'
        : `> ⚖️ **${round.executed}号(${ctx.name(round.executed)})** 被投票出局\n`,
    )
  }
}

function pushSpeech(ctx: Ctx, s: ReplaySpeech) {
  ctx.lines.push(`**${s.id}号(${ctx.name(s.id)})** _[${ctx.role(s.id)}]_`)
  if (s.thinking) ctx.lines.push(`> 💭 ${s.thinking}`)
  ctx.lines.push(`> 🗣 ${s.speech}\n`)
}

function pushResult(ctx: Ctx) {
  const {winner, players, stats} = ctx.data
  ctx.lines.push('\n---\n\n## 对局结束\n')
  ctx.lines.push(`### 🏆 ${winnerLabel(winner)}阵营胜利\n`)
  ctx.lines.push('### 身份揭晓\n')
  ctx.lines.push('| 编号 | 名字 | 身份 | 结局 |')
  ctx.lines.push('| ---- | ---- | ---- | ---- |')
  for (const p of players) {
    ctx.lines.push(`| ${p.id} | ${p.name} | ${ROLE_LABEL_CN[p.role]} | ${p.alive ? '✅ 存活' : '☠️ 出局'} |`)
  }
  if (stats) {
    ctx.lines.push('\n### Token 统计\n')
    ctx.lines.push(`- 调用次数：${stats.calls}`)
    ctx.lines.push(`- Prompt tokens：${stats.promptTokens}`)
    ctx.lines.push(`- Completion tokens：${stats.completionTokens}`)
  }
}

export function winnerLabel(winner: Faction | null): string {
  if (winner === 'wolves') return '狼人'
  if (winner === 'villagers') return '好人'
  return '未结束'
}
