import {writeFileSync, mkdirSync} from 'fs'
import {dirname, resolve} from 'path'
import {Faction, PlayerId, PlayerState, ROLE_LABEL_CN} from './game/types.js'

export interface WolfProposal {
  wolfId: PlayerId;
  choice: PlayerId | null;
  thinking: string;
}

export class GameRecorder {
  private lines: string[] = []
  private players: PlayerState[] = []

  start(players: PlayerState[]): void {
    this.players = players.map((p) => ({...p}))
    const ts = new Date().toLocaleString('zh-CN', {hour12: false})
    this.push('# Wolf Arena 对局复盘')
    this.push(`\n_对局时间：${ts}_\n`)
    this.push('## 身份分配\n')
    this.push('| 编号 | 名字 | 身份 | 人设 |')
    this.push('| ---- | ---- | ---- | ---- |')
    for (const p of players) {
      this.push(`| ${p.id} | ${p.name} | ${ROLE_LABEL_CN[p.role]} | ${p.personality} |`)
    }
    this.push('')
  }

  dayHeader(day: number): void {
    this.push(`\n---\n\n## 第 ${day} 天\n`)
  }

  nightSection(): void {
    this.push('### 夜晚\n')
  }

  wolfRound1(proposals: WolfProposal[]): void {
    if (proposals.length === 0) return
    this.push('**狼队第一轮商议**\n')
    for (const p of proposals) {
      const target = p.choice === null ? '?' : `${p.choice}号`
      this.push(`- 狼 ${p.wolfId}号(${this.name(p.wolfId)}) 提议刀 **${target}** — ${p.thinking || '（无理由）'}`)
    }
    this.push('')
  }

  wolfFinal(votes: {wolfId: PlayerId; choice: PlayerId | null; thinking: string}[], target: PlayerId | null): void {
    if (votes.length > 0) {
      this.push('**狼队最终投票**\n')
      for (const v of votes) {
        const t = v.choice === null ? '?' : `${v.choice}号`
        this.push(`- 狼 ${v.wolfId}号(${this.name(v.wolfId)}) 终投 **${t}** — ${v.thinking || ''}`)
      }
    }
    if (target !== null) {
      this.push(`\n> 🗡 狼队最终刀杀目标：**${target}号(${this.name(target)})**\n`)
    } else {
      this.push('\n> 狼队未达成有效决策\n')
    }
  }

  seerCheck(seerId: PlayerId, targetId: PlayerId, result: 'wolves' | 'villagers'): void {
    const r = result === 'wolves' ? '🔴 查杀' : '🟢 金水'
    this.push(`**预言家查验**：${seerId}号 → ${targetId}号(${this.name(targetId)})  ${r}\n`)
  }

  witchSave(saved: boolean, target: PlayerId): void {
    if (saved) {
      this.push(`**女巫**：使用解药救 ${target}号(${this.name(target)})\n`)
    } else {
      this.push('**女巫**：不救（解药保留）\n')
    }
  }

  witchPoison(target: PlayerId | null): void {
    if (target === null) {
      this.push('**女巫**：不使用毒药\n')
    } else {
      this.push(`**女巫**：💊 毒杀 ${target}号(${this.name(target)})\n`)
    }
  }

  deaths(day: number, deaths: {id: PlayerId; reason: 'wolves' | 'vote' | 'poison' | 'hunter'}[]): void {
    this.push(`### 第 ${day} 天 白天\n`)
    if (deaths.length === 0) {
      this.push('☀️ **平安夜！**\n')
      return
    }
    for (const d of deaths) {
      const reason =
        d.reason === 'wolves'
          ? '昨夜倒牌'
          : d.reason === 'vote'
            ? '被投票出局'
            : d.reason === 'poison'
              ? '昨夜被毒'
              : '被猎人开枪带走'
      this.push(`- ☠️ ${d.id}号(${this.name(d.id)}) [${ROLE_LABEL_CN[this.role(d.id)]}] — ${reason}`)
    }
    this.push('')
  }

  discussHeader(): void {
    this.push('#### 讨论\n')
  }

  speak(playerId: PlayerId, thinking: string, speech: string): void {
    const p = this.player(playerId)
    this.push(`**${p.id}号(${p.name})** _[${ROLE_LABEL_CN[p.role]}]_`)
    if (thinking) this.push(`> 💭 ${thinking}`)
    this.push(`> 🗣 ${speech}\n`)
  }

  votes(day: number, votes: {voter: PlayerId; target: PlayerId}[], executed: PlayerId | null): void {
    this.push('#### 投票\n')
    const counts = new Map<PlayerId, number>()
    for (const v of votes) {
      this.push(`- ${v.voter}号(${this.name(v.voter)}) → ${v.target}号(${this.name(v.target)})`)
      counts.set(v.target, (counts.get(v.target) ?? 0) + 1)
    }
    const tally = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id, n]) => `${id}号: ${n}票`)
      .join('，')
    this.push(`\n_统计：${tally}_\n`)
    if (executed === null) {
      this.push('> 🤝 平票或无人达成出局票数\n')
    } else {
      this.push(`> ⚖️ **${executed}号(${this.name(executed)})** 被投票出局\n`)
    }
  }

  hunterShoot(hunterId: PlayerId, target: PlayerId | null, thinking: string): void {
    this.push(`**猎人开枪**：${hunterId}号(${this.name(hunterId)})`)
    if (thinking) this.push(`> 💭 ${thinking}`)
    if (target === null) {
      this.push('> 选择不开枪\n')
    } else {
      this.push(`> 💥 带走 **${target}号(${this.name(target)})**\n`)
    }
  }

  end(winner: Faction, players: PlayerState[], stats: {calls: number; promptTokens: number; completionTokens: number}): void {
    this.push('\n---\n\n## 对局结束\n')
    this.push(`### 🏆 ${winner === 'wolves' ? '狼人' : '好人'}阵营胜利\n`)
    this.push('### 身份揭晓\n')
    this.push('| 编号 | 名字 | 身份 | 结局 |')
    this.push('| ---- | ---- | ---- | ---- |')
    for (const p of players) {
      this.push(`| ${p.id} | ${p.name} | ${ROLE_LABEL_CN[p.role]} | ${p.alive ? '✅ 存活' : '☠️ 出局'} |`)
    }
    this.push('\n### Token 统计\n')
    this.push(`- 调用次数：${stats.calls}`)
    this.push(`- Prompt tokens：${stats.promptTokens}`)
    this.push(`- Completion tokens：${stats.completionTokens}`)
  }

  save(filePath: string): string {
    const abs = resolve(filePath)
    mkdirSync(dirname(abs), {recursive: true})
    writeFileSync(abs, this.lines.join('\n'), 'utf-8')
    return abs
  }

  private push(line: string): void {
    this.lines.push(line)
  }

  private player(id: PlayerId): PlayerState {
    const p = this.players.find((x) => x.id === id)
    if (!p) throw new Error(`Recorder: player ${id} not registered`)
    return p
  }

  private name(id: PlayerId): string {
    return this.player(id).name
  }

  private role(id: PlayerId) {
    return this.player(id).role
  }
}
