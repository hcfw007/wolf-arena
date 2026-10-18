import {DeathReason, Faction, PlayerId, PlayerState} from '../game/types.js'

export interface ReplayWolfChoice {
  wolfId: PlayerId;
  choice: PlayerId | null;
  thinking: string;
}

export interface ReplayWolves {
  proposals: ReplayWolfChoice[];
  finals: ReplayWolfChoice[];
  target: PlayerId | null;
}

export interface ReplaySeerCheck {
  seerId: PlayerId;
  target: PlayerId;
  result: Faction;
}

export interface ReplayWitch {
  /** 没被问到就不会有这个字段（女巫已死 / 解药已用 / 被杀的是女巫自己）。 */
  save?: {saved: boolean; target: PlayerId};
  /** undefined = 没被问到（毒已用 / 女巫已死）；null = 问了但选择不用。 */
  poison?: PlayerId | null;
}

export interface ReplaySpeech {
  id: PlayerId;
  thinking: string;
  speech: string;
}

export interface ReplayVoteRound {
  label?: string;
  votes: {voter: PlayerId; target: PlayerId}[];
  executed: PlayerId | null;
}

export interface ReplayHunterShot {
  hunterId: PlayerId;
  target: PlayerId | null;
  thinking: string;
}

export interface ReplayDay {
  day: number;
  wolves: ReplayWolves;
  seer?: ReplaySeerCheck;
  witch: ReplayWitch;
  deaths: {id: PlayerId; reason: DeathReason}[];
  speeches: ReplaySpeech[];
  pkSpeeches: ReplaySpeech[];
  voteRounds: ReplayVoteRound[];
  hunter?: ReplayHunterShot;
}

export interface ReplayStats {
  calls: number;
  promptTokens: number;
  completionTokens: number;
}

/** 一局对局的完整结构化记录，markdown / json / html 三种导出都从这里渲染。 */
export interface ReplayData {
  startedAt: string;
  players: PlayerState[];
  days: ReplayDay[];
  winner: Faction | null;
  stats: ReplayStats | null;
}
