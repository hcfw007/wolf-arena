import {mkdirSync, writeFileSync} from 'node:fs'
import {dirname, extname, resolve} from 'node:path'
import {DeathReason, Faction, PlayerId, PlayerState} from './game/types.js'
import {toHtml} from './replay/html.js'
import {toMarkdown} from './replay/markdown.js'
import {ReplayData, ReplayDay, ReplayStats, ReplayWolfChoice} from './replay/types.js'

export type ReplayFormat = 'md' | 'json' | 'html'

const EXT_FORMAT: Record<string, ReplayFormat> = {
  '.md': 'md',
  '.markdown': 'md',
  '.json': 'json',
  '.html': 'html',
  '.htm': 'html',
}

function blankDay(day: number): ReplayDay {
  return {
    day,
    wolves: {proposals: [], finals: [], target: null},
    witch: {},
    deaths: [],
    speeches: [],
    pkSpeeches: [],
    voteRounds: [],
  }
}

/**
 * 收集一局的结构化记录，最后渲染成 Markdown / JSON / HTML。
 * 对局进行中只负责存数据，不拼字符串。
 */
export class GameRecorder {
  private replay: ReplayData
  private currentDay = 0

  constructor() {
    this.replay = {
      startedAt: new Date().toLocaleString('zh-CN', {hour12: false}),
      players: [],
      days: [],
      winner: null,
      stats: null,
    }
  }

  start(players: PlayerState[]): void {
    this.replay.players = players.map((p) => ({...p}))
  }

  dayHeader(day: number): void {
    this.currentDay = day
    this.ensureDay(day)
  }

  wolfRound1(proposals: ReplayWolfChoice[]): void {
    this.ensureDay().wolves.proposals.push(...proposals)
  }

  wolfFinal(votes: ReplayWolfChoice[], target: PlayerId | null): void {
    const day = this.ensureDay()
    day.wolves.finals.push(...votes)
    day.wolves.target = target
  }

  seerCheck(seerId: PlayerId, targetId: PlayerId, result: Faction): void {
    this.ensureDay().seer = {seerId, target: targetId, result}
  }

  witchSave(saved: boolean, target: PlayerId): void {
    this.ensureDay().witch.save = {saved, target}
  }

  witchPoison(target: PlayerId | null): void {
    this.ensureDay().witch.poison = target
  }

  deaths(day: number, deaths: {id: PlayerId; reason: DeathReason}[]): void {
    this.ensureDay(day).deaths.push(...deaths)
  }

  speak(playerId: PlayerId, thinking: string, speech: string): void {
    this.ensureDay().speeches.push({id: playerId, thinking, speech})
  }

  pkSpeak(playerId: PlayerId, thinking: string, speech: string): void {
    this.ensureDay().pkSpeeches.push({id: playerId, thinking, speech})
  }

  votes(
    day: number,
    votes: {voter: PlayerId; target: PlayerId}[],
    executed: PlayerId | null,
    label?: string,
  ): void {
    this.ensureDay(day).voteRounds.push({label, votes, executed})
  }

  hunterShoot(hunterId: PlayerId, target: PlayerId | null, thinking: string): void {
    this.ensureDay().hunter = {hunterId, target, thinking}
  }

  end(winner: Faction, players: PlayerState[], stats: ReplayStats): void {
    this.replay.winner = winner
    this.replay.players = players.map((p) => ({...p}))
    this.replay.stats = stats
  }

  data(): ReplayData {
    return this.replay
  }

  render(format: ReplayFormat): string {
    if (format === 'json') return JSON.stringify(this.replay, null, 2) + '\n'
    if (format === 'html') return toHtml(this.replay)
    return toMarkdown(this.replay)
  }

  /** 不传 format 时按扩展名猜：.json / .html，其余当 Markdown。 */
  save(filePath: string, format?: ReplayFormat): string {
    const abs = resolve(filePath)
    const chosen = format ?? EXT_FORMAT[extname(abs).toLowerCase()] ?? 'md'
    mkdirSync(dirname(abs), {recursive: true})
    writeFileSync(abs, this.render(chosen), 'utf-8')
    return abs
  }

  private ensureDay(day = this.currentDay): ReplayDay {
    const existing = this.replay.days.find((d) => d.day === day)
    if (existing) return existing
    const created = blankDay(day)
    this.replay.days.push(created)
    return created
  }
}
