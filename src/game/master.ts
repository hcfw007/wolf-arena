import chalk from 'chalk'
import {AIPlayer} from '../ai/player.js'
import {formatSeerHistory} from '../ai/prompts.js'
import {LLMProvider} from '../providers/types.js'
import {GameRecorder} from '../recorder.js'
import {
  Faction,
  GameState,
  PHASE_LABEL_CN,
  PlayerId,
  PlayerState,
  PublicEvent,
  ROLE_FACTION,
  ROLE_LABEL_CN,
  Role,
} from './types.js'

const SPEECH_MAX_CHARS = 80

export interface GameMasterOpts {
  players: PlayerState[];
  provider: LLMProvider;
  verbose?: boolean;
  recorder?: GameRecorder;
}

export class GameMaster {
  state: GameState
  agents = new Map<PlayerId, AIPlayer>()
  private verbose: boolean
  private recorder?: GameRecorder

  constructor(opts: GameMasterOpts) {
    this.verbose = opts.verbose ?? true
    this.recorder = opts.recorder
    this.recorder?.start(opts.players)
    this.state = {
      day: 0,
      phase: 'night-wolves',
      players: opts.players.map((p) => ({...p})),
      seerChecks: [],
      witchPotions: {heal: true, poison: true},
      publicLog: [],
    }
    for (const p of this.state.players) {
      this.agents.set(p.id, new AIPlayer(p, opts.provider))
    }
  }

  private alive(): PlayerState[] {
    return this.state.players.filter((p) => p.alive)
  }

  private aliveByRole(role: Role): PlayerState[] {
    return this.alive().filter((p) => p.role === role)
  }

  private byId(id: PlayerId): PlayerState {
    const p = this.state.players.find((x) => x.id === id)
    if (!p) throw new Error(`Player ${id} not found`)
    return p
  }

  private agent(id: PlayerId): AIPlayer {
    const a = this.agents.get(id)
    if (!a) throw new Error(`Agent ${id} not found`)
    return a
  }

  private logPublic(ev: PublicEvent) {
    this.state.publicLog.push(ev)
  }

  private renderPublicHistory(sinceDay?: number): string {
    const lines: string[] = []
    for (const ev of this.state.publicLog) {
      if (sinceDay !== undefined && ev.day < sinceDay) continue
      switch (ev.type) {
        case 'phase':
          lines.push(`【第 ${ev.day} 天 ${PHASE_LABEL_CN[ev.phase]}】`)
          break
        case 'speak': {
          const p = this.byId(ev.speaker)
          lines.push(`${p.id}号(${p.name})：${ev.text}`)
          break
        }
        case 'death': {
          const p = this.byId(ev.victim)
          // 女巫毒杀与狼刀在公开信息里不可区分，死因只写进复盘日志（见 GameRecorder）。
          const reason =
            ev.reason === 'vote'
              ? '被投票出局'
              : ev.reason === 'hunter'
                ? '被猎人开枪带走'
                : '昨夜倒牌出局'
          lines.push(`系统：${p.id}号(${p.name}) ${reason}。`)
          break
        }
        case 'vote': {
          const v = this.byId(ev.voter)
          const t = this.byId(ev.target)
          lines.push(`${v.id}号 → ${t.id}号`)
          break
        }
        case 'announce':
          lines.push(`系统：${ev.text}`)
          break
      }
    }
    return lines.join('\n')
  }

  private privateInfoFor(id: PlayerId): string {
    const me = this.byId(id)
    const lines: string[] = [`你的身份：${ROLE_LABEL_CN[me.role]}。`]
    if (me.role === 'werewolf') {
      const teammates = this.state.players
        .filter((p) => p.role === 'werewolf' && p.id !== id)
        .map((p) => `${p.id}号(${p.name})`)
      lines.push(`你的狼队友：${teammates.join('、') || '无'}。`)
    }
    if (me.role === 'seer' && this.state.seerChecks.length > 0) {
      lines.push(`查验记录：${formatSeerHistory(this.state.seerChecks, this.state.players)}`)
    }
    if (me.role === 'witch') {
      lines.push(
        `药剂状态：解药${this.state.witchPotions.heal ? '可用' : '已用'}，毒药${this.state.witchPotions.poison ? '可用' : '已用'}。`,
      )
    }
    return lines.join('\n')
  }

  private checkWinner(): Faction | null {
    const aliveWolves = this.aliveByRole('werewolf').length
    const aliveVillagers = this.alive().filter(
      (p) => ROLE_FACTION[p.role] === 'villagers',
    ).length
    if (aliveWolves === 0) return 'villagers'
    if (aliveWolves >= aliveVillagers) return 'wolves'
    return null
  }

  async run(maxDays = 8): Promise<Faction> {
    while (this.state.day < maxDays) {
      this.state.day += 1
      const day = this.state.day
      if (this.verbose) console.log(chalk.bgBlue.white(`\n========== 第 ${day} 天 ==========`))
      this.recorder?.dayHeader(day)
      this.recorder?.nightSection()

      const killedTonight = await this.runWolvesPhase()
      await this.runSeerPhase()
      const {poisoned, saved} = await this.runWitchPhase(killedTonight)

      this.state.phase = 'day-announce'
      const deaths: PlayerId[] = []
      const killedByWolves = killedTonight !== null && !saved ? killedTonight : null
      if (killedByWolves !== null) {
        this.byId(killedByWolves).alive = false
        deaths.push(killedByWolves)
        this.logPublic({type: 'death', day, victim: killedByWolves, reason: 'wolves'})
      }
      if (poisoned !== null) {
        this.byId(poisoned).alive = false
        deaths.push(poisoned)
        this.logPublic({type: 'death', day, victim: poisoned, reason: 'poison'})
      }
      if (killedByWolves !== null) {
        const shot = await this.maybeHunterShoot(killedByWolves)
        if (shot !== null) {
          this.byId(shot).alive = false
          deaths.push(shot)
          this.logPublic({type: 'death', day, victim: shot, reason: 'hunter'})
        }
      }

      if (deaths.length === 0) {
        this.logPublic({type: 'announce', day, text: `第 ${day} 天，昨夜平安夜。`})
      }

      if (this.verbose) {
        console.log(chalk.cyan(`\n[第 ${day} 天 白天]`))
        if (deaths.length === 0) console.log(chalk.green('  平安夜！'))
        else
          deaths.forEach((id) => {
            const p = this.byId(id)
            console.log(chalk.red(`  ${p.id}号(${p.name}) 出局`))
          })
      }
      this.recorder?.deaths(
        day,
        deaths.map((id) => {
          const ev = [...this.state.publicLog].reverse().find(
            (e): e is Extract<PublicEvent, {type: 'death'}> =>
              e.type === 'death' && e.day === day && e.victim === id,
          )
          return {id, reason: ev?.reason ?? 'wolves'}
        }),
      )

      let winner = this.checkWinner()
      if (winner) return this.endGame(winner)

      await this.runDiscussPhase()
      const executed = await this.runVotePhase()
      if (executed !== null) {
        this.state.phase = 'day-execute'
        this.byId(executed).alive = false
        this.logPublic({type: 'death', day, victim: executed, reason: 'vote'})
        if (this.verbose) {
          const p = this.byId(executed)
          console.log(chalk.red(`\n  ${p.id}号(${p.name}) 被投票出局`))
        }
        this.recorder?.deaths(day, [{id: executed, reason: 'vote'}])
        const shot = await this.maybeHunterShoot(executed)
        if (shot !== null) {
          this.byId(shot).alive = false
          this.logPublic({type: 'death', day, victim: shot, reason: 'hunter'})
          this.recorder?.deaths(day, [{id: shot, reason: 'hunter'}])
        }
      }

      winner = this.checkWinner()
      if (winner) return this.endGame(winner)
    }
    return this.endGame('wolves')
  }

  private async runWolvesPhase(): Promise<PlayerId | null> {
    this.state.phase = 'night-wolves'
    const wolves = this.aliveByRole('werewolf')
    if (wolves.length === 0) return null
    if (this.verbose) console.log(chalk.gray('\n[夜晚] 狼人行动中...'))

    const candidates = this.alive().filter((p) => p.role !== 'werewolf')
    const publicHistory = this.renderPublicHistory()

    interface WolfProposal {
      wolfId: PlayerId;
      choice: PlayerId | null;
      thinking: string;
    }

    const proposals: WolfProposal[] = []
    const wolfFinals: WolfProposal[] = []
    for (const w of wolves) {
      const out = await this.agent(w.id).chooseTarget({
        candidates,
        instruction: [
          '【狼队第一轮商议】请提议今晚要刀杀的目标，并给出理由。',
          '优先考虑神职（预言家/女巫/猎人）或发言强势的好人。',
          '稍后你会看到狼队友的提议，可以再做最终决策。',
          publicHistory
            ? `\n【全场公开历史】\n${publicHistory}`
            : '',
        ].join('\n'),
        privateInfo: this.privateInfoFor(w.id),
        day: this.state.day,
      })
      proposals.push({wolfId: w.id, choice: out.choice, thinking: out.thinking})
      if (this.verbose)
        console.log(
          chalk.dim(`  [一轮] 狼${w.id}号 提议刀 ${out.choice ?? '?'}号  «${(out.thinking || '').slice(0, 60)}»`),
        )
    }

    this.recorder?.wolfRound1(proposals)

    if (wolves.length === 1) {
      const sole = proposals[0]?.choice ?? null
      if (sole !== null && this.verbose) console.log(chalk.dim(`  → 最终刀杀目标：${sole}号`))
      this.recorder?.wolfFinal([], sole)
      return sole
    }

    const finalVotes: PlayerId[] = []
    for (const w of wolves) {
      const others = proposals.filter((p) => p.wolfId !== w.id)
      const teammateInfo = others
        .map(
          (p) =>
            `  狼${p.wolfId}号 提议刀 ${p.choice ?? '?'}号 — 理由：${(p.thinking || '').slice(0, 120)}`,
        )
        .join('\n')
      const out = await this.agent(w.id).chooseTarget({
        candidates,
        instruction: [
          '【狼队第二轮商议 - 最终投票】你已看到所有狼队友的提议。',
          '请综合所有狼队意见，做出最终选择。可以坚持原选择，也可以改投。',
          '建议狼队尽量集中票，避免一刀都打不中。',
          '',
          '【狼队第一轮提议】',
          teammateInfo,
          publicHistory ? `\n【全场公开历史】\n${publicHistory}` : '',
        ].join('\n'),
        privateInfo: this.privateInfoFor(w.id),
        day: this.state.day,
      })
      if (out.choice !== null) finalVotes.push(out.choice)
      wolfFinals.push({wolfId: w.id, choice: out.choice, thinking: out.thinking})
      if (this.verbose)
        console.log(
          chalk.dim(`  [二轮] 狼${w.id}号 终投 ${out.choice ?? '?'}号  «${(out.thinking || '').slice(0, 60)}»`),
        )
    }

    if (finalVotes.length === 0) {
      this.recorder?.wolfFinal(wolfFinals, null)
      return null
    }
    const counts = new Map<PlayerId, number>()
    finalVotes.forEach((p) => counts.set(p, (counts.get(p) ?? 0) + 1))
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
    const target = sorted[0]![0]
    if (this.verbose) console.log(chalk.dim(`  → 最终刀杀目标：${target}号`))
    this.recorder?.wolfFinal(wolfFinals, target)
    return target
  }

  private async runSeerPhase(): Promise<void> {
    this.state.phase = 'night-seer'
    const seer = this.aliveByRole('seer')[0]
    if (!seer) return
    if (this.verbose) console.log(chalk.gray('\n[夜晚] 预言家查验中...'))
    const candidates = this.alive().filter((p) => p.id !== seer.id)
    const out = await this.agent(seer.id).chooseTarget({
      candidates,
      instruction: '请选择今晚查验的目标。',
      privateInfo: this.privateInfoFor(seer.id),
      day: this.state.day,
    })
    if (out.choice !== null) {
      const target = this.byId(out.choice)
      this.state.seerChecks.push({
        day: this.state.day,
        target: target.id,
        result: ROLE_FACTION[target.role],
      })
      if (this.verbose)
        console.log(chalk.dim(`  预言家查验 ${target.id}号 → ${ROLE_FACTION[target.role] === 'wolves' ? '查杀' : '金水'}`))
      this.recorder?.seerCheck(seer.id, target.id, ROLE_FACTION[target.role])
    }
  }

  private async runWitchPhase(killedTonight: PlayerId | null): Promise<{
    poisoned: PlayerId | null;
    saved: boolean;
  }> {
    this.state.phase = 'night-witch'
    const witch = this.aliveByRole('witch')[0]
    if (!witch) return {poisoned: null, saved: false}
    if (this.verbose) console.log(chalk.gray('\n[夜晚] 女巫行动中...'))

    let saved = false
    if (killedTonight !== null && this.state.witchPotions.heal && killedTonight !== witch.id) {
      const dec = await this.agent(witch.id).witchSaveDecision({
        killedTonight: this.byId(killedTonight),
        privateInfo: this.privateInfoFor(witch.id),
        day: this.state.day,
      })
      if (dec.choice) {
        this.state.witchPotions.heal = false
        saved = true
        if (this.verbose) console.log(chalk.dim(`  女巫使用解药救 ${killedTonight}号`))
        this.recorder?.witchSave(true, killedTonight)
      } else {
        this.recorder?.witchSave(false, killedTonight)
      }
    }

    if (this.state.witchPotions.poison && this.state.day >= 1) {
      const candidates = this.alive().filter((p) => p.id !== witch.id)
      const out = await this.agent(witch.id).chooseTarget({
        candidates,
        instruction: '是否使用毒药毒杀一名玩家？毒药只剩一瓶，可以选择不用。如果不毒输出 TARGET: none。',
        privateInfo: this.privateInfoFor(witch.id),
        allowSkip: true,
        day: this.state.day,
      })
      if (out.choice !== null) {
        this.state.witchPotions.poison = false
        if (this.verbose) console.log(chalk.dim(`  女巫使用毒药毒 ${out.choice}号`))
        this.recorder?.witchPoison(out.choice)
        return {poisoned: out.choice, saved}
      }
      this.recorder?.witchPoison(null)
    }
    return {poisoned: null, saved}
  }

  private async runDiscussPhase(): Promise<void> {
    this.state.phase = 'day-discuss'
    const day = this.state.day
    this.logPublic({type: 'phase', day, phase: 'day-discuss'})
    if (this.verbose) console.log(chalk.cyan('\n[白天] 讨论开始'))
    this.recorder?.discussHeader()
    for (const p of this.alive()) {
      const out = await this.agent(p.id).speak({
        alivePlayers: this.alive(),
        publicHistory: this.renderPublicHistory(),
        privateInfo: this.privateInfoFor(p.id),
        currentDay: day,
        round: 1,
        maxChars: SPEECH_MAX_CHARS,
      })
      this.logPublic({type: 'speak', day, speaker: p.id, text: out.speech})
      if (this.verbose) {
        console.log(
          chalk.yellow(`  ${p.id}号(${p.name})`) +
            chalk.dim(` [${ROLE_LABEL_CN[p.role]}]`) +
            ': ' +
            chalk.white(out.speech),
        )
      }
      this.recorder?.speak(p.id, out.thinking, out.speech)
    }
  }

  private async runVotePhase(): Promise<PlayerId | null> {
    this.state.phase = 'day-vote'
    const day = this.state.day
    if (this.verbose) console.log(chalk.cyan('\n[白天] 投票'))
    const candidates = this.alive()
    const counts = new Map<PlayerId, number>()
    const voteEntries: {voter: PlayerId; target: PlayerId}[] = []
    for (const p of this.alive()) {
      const out = await this.agent(p.id).vote({
        candidates,
        publicHistory: this.renderPublicHistory(day),
        privateInfo: this.privateInfoFor(p.id),
        day,
      })
      counts.set(out.choice, (counts.get(out.choice) ?? 0) + 1)
      voteEntries.push({voter: p.id, target: out.choice})
      this.logPublic({type: 'vote', day, voter: p.id, target: out.choice})
      if (this.verbose) console.log(chalk.dim(`  ${p.id}号 → ${out.choice}号`))
    }
    if (counts.size === 0) {
      this.recorder?.votes(day, voteEntries, null)
      return null
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
    const top = sorted[0]!
    const tied = sorted.filter((e) => e[1] === top[1])
    if (tied.length > 1) {
      if (this.verbose) console.log(chalk.gray('  平票，无人出局'))
      this.recorder?.votes(day, voteEntries, null)
      return null
    }
    this.recorder?.votes(day, voteEntries, top[0])
    return top[0]
  }

  private async maybeHunterShoot(deadId: PlayerId): Promise<PlayerId | null> {
    const dead = this.byId(deadId)
    if (dead.role !== 'hunter') return null
    const candidates = this.alive()
    if (candidates.length === 0) return null
    this.state.phase = 'hunter-shoot'
    if (this.verbose) console.log(chalk.magenta(`\n[猎人] ${dead.id}号(${dead.name}) 出局，是否开枪？`))
    const publicHistory = this.renderPublicHistory()
    const out = await this.agent(deadId).chooseTarget({
      candidates,
      instruction: [
        '你是猎人，刚刚出局！现在是你唯一一次开枪的机会。',
        '不开枪 = 浪费身份，让狼人白嫖。',
        '请基于全场发言和投票表现，选出你最怀疑是狼人的玩家开枪带走。',
        '即使无法完全确认，也要根据当前最大嫌疑出枪。仅在所有玩家都无法判断时才输出 TARGET: none。',
        '',
        '【全场公开历史】',
        publicHistory || '（无）',
      ].join('\n'),
      privateInfo: this.privateInfoFor(deadId),
      allowSkip: true,
      day: this.state.day,
    })
    if (out.choice === null) {
      if (this.verbose) console.log(chalk.dim('  猎人选择不开枪'))
      this.recorder?.hunterShoot(deadId, null, out.thinking)
      return null
    }
    const target = this.byId(out.choice)
    if (this.verbose) console.log(chalk.magenta(`  → 猎人开枪带走 ${target.id}号(${target.name})`))
    this.recorder?.hunterShoot(deadId, out.choice, out.thinking)
    return out.choice
  }

  endGameWithStats(winner: Faction, stats: {calls: number; promptTokens: number; completionTokens: number}): void {
    this.recorder?.end(winner, this.state.players, stats)
  }

  private endGame(winner: Faction): Faction {
    this.state.phase = 'game-over'
    if (this.verbose) {
      console.log(
        chalk.bgGreen.black(`\n========== 游戏结束：${winner === 'wolves' ? '狼人' : '好人'}阵营胜利 ==========`),
      )
      console.log('身份揭晓：')
      this.state.players.forEach((p) => {
        console.log(
          `  ${p.id}号(${p.name}) - ${ROLE_LABEL_CN[p.role]} ${p.alive ? chalk.green('[存活]') : chalk.red('[出局]')}`,
        )
      })
    }
    return winner
  }
}
