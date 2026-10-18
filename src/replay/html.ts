import {DeathReason, PlayerId, ROLE_LABEL_CN} from '../game/types.js'
import {winnerLabel} from './markdown.js'
import {ReplayData, ReplayDay, ReplaySpeech} from './types.js'

const DEATH_REASON_CN: Record<DeathReason, string> = {
  wolves: '昨夜倒牌',
  poison: '昨夜被毒',
  vote: '被投票出局',
  hunter: '被猎人开枪带走',
}

const STYLE = `
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0 auto; max-width: 860px; padding: 24px 16px 64px;
  background: #14161a; color: #e6e8ea;
  font: 15px/1.7 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; }
h1 { font-size: 26px; margin: 0 0 4px; }
h2 { font-size: 20px; margin: 36px 0 12px; padding-bottom: 6px; border-bottom: 1px solid #2c3037; }
h3 { font-size: 16px; margin: 24px 0 8px; color: #9fb3c8; }
h4 { font-size: 14px; margin: 20px 0 8px; color: #7f8ea3; }
.meta { color: #8b949e; margin: 0 0 8px; }
.winner { display: inline-block; padding: 2px 10px; border-radius: 10px; font-weight: 600; }
.winner.wolves { background: #4a1f24; color: #ff9aa2; }
.winner.villagers { background: #16351f; color: #7ee2a8; }
table { border-collapse: collapse; width: 100%; font-size: 14px; }
th, td { border: 1px solid #2c3037; padding: 6px 8px; text-align: left; }
th { background: #1c2027; }
.card { background: #1a1e24; border: 1px solid #262b33; border-radius: 8px;
  padding: 10px 12px; margin: 8px 0; }
.card .tag { color: #8b949e; font-size: 12px; margin-right: 6px; }
.death { color: #ff9aa2; }
.safe { color: #7ee2a8; }
.speech { border-left: 3px solid #3a4250; padding-left: 12px; margin: 12px 0; }
.speech .who { font-weight: 600; }
.speech .role { color: #8b949e; font-size: 12px; margin-left: 6px; }
.thinking { color: #8b949e; font-size: 14px; }
.say { margin: 4px 0 0; }
.vote { color: #9fb3c8; font-family: ui-monospace, monospace; font-size: 13px; }
.total { color: #ffd479; }
ul { margin: 6px 0; padding-left: 20px; }
code { background: #22272e; padding: 1px 4px; border-radius: 4px; }
`.trim()

export function toHtml(data: ReplayData): string {
  const ctx: Ctx = {
    name: (id) => data.players.find((p) => p.id === id)?.name ?? `${id}号`,
    role: (id) => {
      const role = data.players.find((p) => p.id === id)?.role
      return role ? ROLE_LABEL_CN[role] : '未知'
    },
  }

  const body: string[] = []
  body.push('<h1>🐺 Wolf Arena 对局复盘</h1>')
  body.push(`<p class="meta">对局时间：${esc(data.startedAt)}</p>`)
  body.push(
    `<p class="meta">结果：<span class="winner ${data.winner ?? ''}">${
      winnerLabel(data.winner)
    }阵营胜利</span></p>`,
  )

  body.push('<h2>身份分配</h2>')
  body.push('<table><tr><th>编号</th><th>名字</th><th>身份</th><th>人设</th></tr>')
  for (const p of data.players) {
    body.push(
      `<tr><td>${p.id}</td><td>${esc(p.name)}</td><td>${ROLE_LABEL_CN[p.role]}</td><td>${esc(p.personality)}</td></tr>`,
    )
  }
  body.push('</table>')

  for (const day of data.days) {
    body.push(`<h2>第 ${day.day} 天</h2>`)
    pushNight(ctx, body, day)
    pushDaytime(ctx, body, day)
  }

  body.push('<h2>身份揭晓</h2>')
  body.push('<table><tr><th>编号</th><th>名字</th><th>身份</th><th>结局</th></tr>')
  for (const p of data.players) {
    body.push(
      `<tr><td>${p.id}</td><td>${esc(p.name)}</td><td>${ROLE_LABEL_CN[p.role]}</td><td>${
        p.alive ? '✅ 存活' : '☠️ 出局'
      }</td></tr>`,
    )
  }
  body.push('</table>')

  if (data.stats) {
    body.push('<h2>Token 统计</h2>')
    body.push(
      '<ul>' +
        `<li>调用次数：${data.stats.calls}</li>` +
        `<li>Prompt tokens：${data.stats.promptTokens}</li>` +
        `<li>Completion tokens：${data.stats.completionTokens}</li>` +
        '</ul>',
    )
  }

  return [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>Wolf Arena 对局复盘</title>',
    `<style>${STYLE}</style>`,
    '</head>',
    '<body>',
    ...body,
    '</body>',
    '</html>',
  ].join('\n')
}

interface Ctx {
  name: (id: PlayerId) => string;
  role: (id: PlayerId) => string;
}

function pushNight(ctx: Ctx, body: string[], day: ReplayDay) {
  body.push('<h3>夜晚</h3>')

  if (day.wolves.proposals.length > 0) {
    body.push('<div class="card"><span class="tag">狼队第一轮商议</span><ul>')
    for (const p of day.wolves.proposals) {
      body.push(
        `<li>狼 ${p.wolfId}号(${esc(ctx.name(p.wolfId))}) 提议刀 <b>${
          p.choice === null ? '?' : `${p.choice}号`
        }</b> — ${esc(p.thinking || '（无理由）')}</li>`,
      )
    }
    body.push('</ul></div>')
  }

  if (day.wolves.finals.length > 0) {
    body.push('<div class="card"><span class="tag">狼队最终投票</span><ul>')
    for (const v of day.wolves.finals) {
      body.push(
        `<li>狼 ${v.wolfId}号(${esc(ctx.name(v.wolfId))}) 终投 <b>${
          v.choice === null ? '?' : `${v.choice}号`
        }</b> — ${esc(v.thinking)}</li>`,
      )
    }
    body.push('</ul></div>')
  }

  body.push(
    day.wolves.target === null
      ? '<div class="card">狼队未达成有效决策</div>'
      : `<div class="card">🗡 狼队最终刀杀目标：<b>${day.wolves.target}号(${esc(
        ctx.name(day.wolves.target),
      )})</b></div>`,
  )

  if (day.seer) {
    const r = day.seer.result === 'wolves' ? '🔴 查杀' : '🟢 金水'
    body.push(
      `<div class="card"><span class="tag">预言家查验</span>${day.seer.seerId}号 → ${
        day.seer.target
      }号(${esc(ctx.name(day.seer.target))}) ${r}</div>`,
    )
  }

  if (day.witch.save) {
    body.push(
      day.witch.save.saved
        ? `<div class="card"><span class="tag">女巫</span>使用解药救 ${day.witch.save.target}号(${esc(
          ctx.name(day.witch.save.target),
        )})</div>`
        : '<div class="card"><span class="tag">女巫</span>不救（解药保留）</div>',
    )
  }
  if (day.witch.poison !== undefined) {
    body.push(
      day.witch.poison === null
        ? '<div class="card"><span class="tag">女巫</span>不使用毒药</div>'
        : `<div class="card"><span class="tag">女巫</span>💊 毒杀 ${day.witch.poison}号(${esc(
          ctx.name(day.witch.poison),
        )})</div>`,
    )
  }
}

function pushDaytime(ctx: Ctx, body: string[], day: ReplayDay) {
  body.push('<h3>白天</h3>')
  if (day.deaths.length === 0) {
    body.push('<div class="card safe">☀️ 平安夜！</div>')
  } else {
    body.push('<div class="card"><ul>')
    for (const d of day.deaths) {
      body.push(
        `<li class="death">☠️ ${d.id}号(${esc(ctx.name(d.id))}) [${ctx.role(d.id)}] — ${
          DEATH_REASON_CN[d.reason]
        }</li>`,
      )
    }
    body.push('</ul></div>')
  }

  if (day.hunter) {
    body.push(
      `<div class="card"><span class="tag">猎人开枪</span>${day.hunter.hunterId}号(${esc(
        ctx.name(day.hunter.hunterId),
      )})` +
        (day.hunter.thinking ? `<div class="thinking">💭 ${esc(day.hunter.thinking)}</div>` : '') +
        (day.hunter.target === null
          ? '<div>选择不开枪</div>'
          : `<div>💥 带走 <b>${day.hunter.target}号(${esc(ctx.name(day.hunter.target))})</b></div>`) +
        '</div>',
    )
  }

  if (day.speeches.length > 0) {
    body.push('<h4>讨论</h4>')
    for (const s of day.speeches) pushSpeech(ctx, body, s)
  }
  if (day.pkSpeeches.length > 0) {
    body.push('<h4>平票 PK 发言</h4>')
    for (const s of day.pkSpeeches) pushSpeech(ctx, body, s)
  }

  for (const round of day.voteRounds) {
    body.push(`<h4>投票${round.label ? `（${esc(round.label)}）` : ''}</h4>`)
    body.push('<div class="card"><ul class="vote">')
    const counts = new Map<PlayerId, number>()
    for (const v of round.votes) {
      body.push(
        `<li>${v.voter}号(${esc(ctx.name(v.voter))}) → ${v.target}号(${esc(ctx.name(v.target))})</li>`,
      )
      counts.set(v.target, (counts.get(v.target) ?? 0) + 1)
    }
    const tally = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id, n]) => `${id}号: ${n}票`)
      .join('，')
    body.push('</ul>')
    body.push(`<div>统计：${tally}</div>`)
    body.push(
      round.executed === null
        ? '<div>🤝 平票或无人达成出局票数</div>'
        : `<div class="total">⚖️ ${round.executed}号(${esc(ctx.name(round.executed))}) 被投票出局</div>`,
    )
    body.push('</div>')
  }
}

function pushSpeech(ctx: Ctx, body: string[], s: ReplaySpeech) {
  body.push('<div class="speech">')
  body.push(
    `<span class="who">${s.id}号(${esc(ctx.name(s.id))})</span><span class="role">[${
      ctx.role(s.id)
    }]</span>`,
  )
  if (s.thinking) body.push(`<div class="thinking">💭 ${esc(s.thinking)}</div>`)
  body.push(`<p class="say">🗣 ${esc(s.speech)}</p>`)
  body.push('</div>')
}

function esc(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
