import chalk from 'chalk';
import { AIPlayer } from '../ai/player.js';
import { formatSeerHistory } from '../ai/prompts.js';
import {
  Faction,
  GameState,
  PlayerId,
  PlayerState,
  PublicEvent,
  ROLE_FACTION,
  ROLE_LABEL_CN,
  Role,
} from './types.js';
import { DeepSeekProvider } from '../providers/deepseek.js';

const SPEECH_MAX_CHARS = 80;

export interface GameMasterOpts {
  players: PlayerState[];
  provider: DeepSeekProvider;
  verbose?: boolean;
}

export class GameMaster {
  state: GameState;
  agents = new Map<PlayerId, AIPlayer>();
  private verbose: boolean;

  constructor(opts: GameMasterOpts) {
    this.verbose = opts.verbose ?? true;
    this.state = {
      day: 0,
      phase: { kind: 'night-wolves' },
      players: opts.players.map((p) => ({ ...p })),
      seerChecks: [],
      witchPotions: { heal: true, poison: true },
      publicLog: [],
    };
    for (const p of this.state.players) {
      this.agents.set(p.id, new AIPlayer(p, opts.provider));
    }
  }

  private alive(): PlayerState[] {
    return this.state.players.filter((p) => p.alive);
  }

  private aliveByRole(role: Role): PlayerState[] {
    return this.alive().filter((p) => p.role === role);
  }

  private byId(id: PlayerId): PlayerState {
    const p = this.state.players.find((x) => x.id === id);
    if (!p) throw new Error(`Player ${id} not found`);
    return p;
  }

  private agent(id: PlayerId): AIPlayer {
    const a = this.agents.get(id);
    if (!a) throw new Error(`Agent ${id} not found`);
    return a;
  }

  private logPublic(ev: PublicEvent) {
    this.state.publicLog.push(ev);
  }

  private renderPublicHistory(sinceDay?: number): string {
    const lines: string[] = [];
    for (const ev of this.state.publicLog) {
      if (sinceDay !== undefined && ev.day < sinceDay) continue;
      switch (ev.type) {
        case 'phase':
          lines.push(`【第 ${ev.day} 天 ${this.phaseLabel(ev.phase)}】`);
          break;
        case 'speak': {
          const p = this.byId(ev.speaker);
          lines.push(`${p.id}号(${p.name})：${ev.text}`);
          break;
        }
        case 'death': {
          const p = this.byId(ev.victim);
          const reason =
            ev.reason === 'wolves'
              ? '昨夜倒牌'
              : ev.reason === 'vote'
                ? '被投票出局'
                : ev.reason === 'poison'
                  ? '昨夜被毒'
                  : '被猎人开枪带走';
          lines.push(`系统：${p.id}号(${p.name}) ${reason}。`);
          break;
        }
        case 'vote': {
          const v = this.byId(ev.voter);
          const t = this.byId(ev.target);
          lines.push(`${v.id}号 → ${t.id}号`);
          break;
        }
      }
    }
    return lines.join('\n');
  }

  private phaseLabel(kind: string): string {
    switch (kind) {
      case 'night-wolves':
        return '夜晚-狼人行动';
      case 'night-seer':
        return '夜晚-预言家查验';
      case 'night-witch':
        return '夜晚-女巫行动';
      case 'day-announce':
        return '白天-公告';
      case 'day-discuss':
        return '白天-讨论';
      case 'day-vote':
        return '白天-投票';
      case 'day-execute':
        return '白天-处决';
      default:
        return kind;
    }
  }

  private privateInfoFor(id: PlayerId): string {
    const me = this.byId(id);
    const lines: string[] = [`你的身份：${ROLE_LABEL_CN[me.role]}。`];
    if (me.role === 'werewolf') {
      const teammates = this.state.players
        .filter((p) => p.role === 'werewolf' && p.id !== id)
        .map((p) => `${p.id}号(${p.name})`);
      lines.push(`你的狼队友：${teammates.join('、') || '无'}。`);
    }
    if (me.role === 'seer' && this.state.seerChecks.length > 0) {
      lines.push(`查验记录：${formatSeerHistory(this.state.seerChecks, this.state.players)}`);
    }
    if (me.role === 'witch') {
      lines.push(
        `药剂状态：解药${this.state.witchPotions.heal ? '可用' : '已用'}，毒药${this.state.witchPotions.poison ? '可用' : '已用'}。`,
      );
    }
    return lines.join('\n');
  }

  private justSaved = new Set<PlayerId>();

  private checkWinner(): Faction | null {
    const aliveWolves = this.aliveByRole('werewolf').length;
    const aliveVillagers = this.alive().filter(
      (p) => ROLE_FACTION[p.role] === 'villagers',
    ).length;
    if (aliveWolves === 0) return 'villagers';
    if (aliveWolves >= aliveVillagers) return 'wolves';
    return null;
  }

  async run(maxDays = 8): Promise<Faction> {
    while (this.state.day < maxDays) {
      this.state.day += 1;
      const day = this.state.day;
      if (this.verbose) console.log(chalk.bgBlue.white(`\n========== 第 ${day} 天 ==========`));

      const killedTonight = await this.runWolvesPhase();
      await this.runSeerPhase();
      const poisoned = await this.runWitchPhase(killedTonight);

      const deaths: PlayerId[] = [];
      if (killedTonight !== null && !this.justSaved.has(killedTonight)) {
        this.byId(killedTonight).alive = false;
        deaths.push(killedTonight);
        this.logPublic({ type: 'death', day, victim: killedTonight, reason: 'wolves' });
      }
      if (poisoned !== null) {
        this.byId(poisoned).alive = false;
        deaths.push(poisoned);
        this.logPublic({ type: 'death', day, victim: poisoned, reason: 'poison' });
      }
      this.justSaved.clear();

      if (this.verbose) {
        console.log(chalk.cyan(`\n[第 ${day} 天 白天]`));
        if (deaths.length === 0) console.log(chalk.green('  平安夜！'));
        else
          deaths.forEach((id) => {
            const p = this.byId(id);
            console.log(chalk.red(`  ${p.id}号(${p.name}) 出局`));
          });
      }

      let winner = this.checkWinner();
      if (winner) return this.endGame(winner);

      await this.runDiscussPhase();
      const executed = await this.runVotePhase();
      if (executed !== null) {
        this.byId(executed).alive = false;
        this.logPublic({ type: 'death', day, victim: executed, reason: 'vote' });
        if (this.verbose) {
          const p = this.byId(executed);
          console.log(chalk.red(`\n  ${p.id}号(${p.name}) 被投票出局`));
        }
      }

      winner = this.checkWinner();
      if (winner) return this.endGame(winner);
    }
    return this.endGame('wolves');
  }

  private async runWolvesPhase(): Promise<PlayerId | null> {
    const wolves = this.aliveByRole('werewolf');
    if (wolves.length === 0) return null;
    if (this.verbose) console.log(chalk.gray('\n[夜晚] 狼人行动中...'));

    const proposals: PlayerId[] = [];
    const candidates = this.alive().filter((p) => p.role !== 'werewolf');

    for (const w of wolves) {
      const out = await this.agent(w.id).chooseTarget({
        candidates,
        instruction: '请选择今晚要刀杀的目标。优先考虑神职（预言家/女巫/猎人）或发言强势的好人。',
        privateInfo: this.privateInfoFor(w.id),
        day: this.state.day,
      });
      if (out.choice !== null) proposals.push(out.choice);
      if (this.verbose)
        console.log(
          chalk.dim(`  狼${w.id}号 提议刀 ${out.choice ?? '?'}号  «${(out.thinking || '').slice(0, 60)}»`),
        );
    }

    if (proposals.length === 0) return null;
    const counts = new Map<PlayerId, number>();
    proposals.forEach((p) => counts.set(p, (counts.get(p) ?? 0) + 1));
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const target = sorted[0]![0];
    if (this.verbose) console.log(chalk.dim(`  → 最终刀杀目标：${target}号`));
    return target;
  }

  private async runSeerPhase(): Promise<void> {
    const seer = this.aliveByRole('seer')[0];
    if (!seer) return;
    if (this.verbose) console.log(chalk.gray('\n[夜晚] 预言家查验中...'));
    const candidates = this.alive().filter((p) => p.id !== seer.id);
    const out = await this.agent(seer.id).chooseTarget({
      candidates,
      instruction: '请选择今晚查验的目标。',
      privateInfo: this.privateInfoFor(seer.id),
      day: this.state.day,
    });
    if (out.choice !== null) {
      const target = this.byId(out.choice);
      this.state.seerChecks.push({
        day: this.state.day,
        target: target.id,
        result: ROLE_FACTION[target.role],
      });
      if (this.verbose)
        console.log(chalk.dim(`  预言家查验 ${target.id}号 → ${ROLE_FACTION[target.role] === 'wolves' ? '查杀' : '金水'}`));
    }
  }

  private async runWitchPhase(killedTonight: PlayerId | null): Promise<PlayerId | null> {
    const witch = this.aliveByRole('witch')[0];
    if (!witch) return null;
    if (this.verbose) console.log(chalk.gray('\n[夜晚] 女巫行动中...'));

    if (killedTonight !== null && this.state.witchPotions.heal && killedTonight !== witch.id) {
      const dec = await this.agent(witch.id).witchSaveDecision({
        killedTonight: this.byId(killedTonight),
        privateInfo: this.privateInfoFor(witch.id),
        day: this.state.day,
      });
      if (dec.choice) {
        this.state.witchPotions.heal = false;
        this.justSaved.add(killedTonight);
        if (this.verbose) console.log(chalk.dim(`  女巫使用解药救 ${killedTonight}号`));
      }
    }

    if (this.state.witchPotions.poison && this.state.day >= 1) {
      const candidates = this.alive().filter((p) => p.id !== witch.id);
      const out = await this.agent(witch.id).chooseTarget({
        candidates,
        instruction: '是否使用毒药毒杀一名玩家？毒药只剩一瓶，可以选择不用。如果不毒输出 TARGET: none。',
        privateInfo: this.privateInfoFor(witch.id),
        allowSkip: true,
        day: this.state.day,
      });
      if (out.choice !== null) {
        this.state.witchPotions.poison = false;
        if (this.verbose) console.log(chalk.dim(`  女巫使用毒药毒 ${out.choice}号`));
        return out.choice;
      }
    }
    return null;
  }

  private async runDiscussPhase(): Promise<void> {
    const day = this.state.day;
    this.logPublic({ type: 'phase', day, phase: 'day-discuss' });
    if (this.verbose) console.log(chalk.cyan('\n[白天] 讨论开始'));
    for (const p of this.alive()) {
      const out = await this.agent(p.id).speak({
        alivePlayers: this.alive(),
        publicHistory: this.renderPublicHistory(),
        privateInfo: this.privateInfoFor(p.id),
        currentDay: day,
        round: 1,
        maxChars: SPEECH_MAX_CHARS,
      });
      this.logPublic({ type: 'speak', day, speaker: p.id, text: out.speech });
      if (this.verbose) {
        console.log(
          chalk.yellow(`  ${p.id}号(${p.name})`) +
            chalk.dim(` [${ROLE_LABEL_CN[p.role]}]`) +
            ': ' +
            chalk.white(out.speech),
        );
      }
    }
  }

  private async runVotePhase(): Promise<PlayerId | null> {
    const day = this.state.day;
    if (this.verbose) console.log(chalk.cyan('\n[白天] 投票'));
    const candidates = this.alive();
    const counts = new Map<PlayerId, number>();
    for (const p of this.alive()) {
      const out = await this.agent(p.id).vote({
        candidates,
        publicHistory: this.renderPublicHistory(day),
        privateInfo: this.privateInfoFor(p.id),
        day,
      });
      counts.set(out.choice, (counts.get(out.choice) ?? 0) + 1);
      this.logPublic({ type: 'vote', day, voter: p.id, target: out.choice });
      if (this.verbose) console.log(chalk.dim(`  ${p.id}号 → ${out.choice}号`));
    }
    if (counts.size === 0) return null;
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted[0]!;
    const tied = sorted.filter((e) => e[1] === top[1]);
    if (tied.length > 1) {
      if (this.verbose) console.log(chalk.gray('  平票，无人出局'));
      return null;
    }
    return top[0];
  }

  private endGame(winner: Faction): Faction {
    this.state.phase = { kind: 'game-over', winner };
    if (this.verbose) {
      console.log(
        chalk.bgGreen.black(`\n========== 游戏结束：${winner === 'wolves' ? '狼人' : '好人'}阵营胜利 ==========`),
      );
      console.log('身份揭晓：');
      this.state.players.forEach((p) => {
        console.log(
          `  ${p.id}号(${p.name}) - ${ROLE_LABEL_CN[p.role]} ${p.alive ? chalk.green('[存活]') : chalk.red('[出局]')}`,
        );
      });
    }
    return winner;
  }
}
