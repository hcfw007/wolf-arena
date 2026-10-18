export type Role =
  | 'werewolf'
  | 'villager'
  | 'seer'
  | 'witch'
  | 'hunter'

export type Faction = 'wolves' | 'villagers'

export const ROLE_FACTION: Record<Role, Faction> = {
  werewolf: 'wolves',
  villager: 'villagers',
  seer: 'villagers',
  witch: 'villagers',
  hunter: 'villagers',
}

export const ROLE_LABEL_CN: Record<Role, string> = {
  werewolf: '狼人',
  villager: '平民',
  seer: '预言家',
  witch: '女巫',
  hunter: '猎人',
}

export type PlayerId = number

export interface PlayerState {
  id: PlayerId;
  name: string;
  role: Role;
  alive: boolean;
  personality: string;
}

export type PhaseKind =
  | 'night-wolves'
  | 'night-seer'
  | 'night-witch'
  | 'day-announce'
  | 'day-discuss'
  | 'day-vote'
  | 'day-execute'
  | 'hunter-shoot'
  | 'game-over'

export const PHASE_LABEL_CN: Record<PhaseKind, string> = {
  'night-wolves': '夜晚-狼人行动',
  'night-seer': '夜晚-预言家查验',
  'night-witch': '夜晚-女巫行动',
  'day-announce': '白天-公告',
  'day-discuss': '白天-讨论',
  'day-vote': '白天-投票',
  'day-execute': '白天-处决',
  'hunter-shoot': '猎人开枪',
  'game-over': '对局结束',
}

export interface SeerCheckRecord {
  day: number;
  target: PlayerId;
  result: Faction;
}

export interface WitchPotions {
  heal: boolean;
  poison: boolean;
}

export interface GameState {
  day: number;
  phase: PhaseKind;
  players: PlayerState[];
  seerChecks: SeerCheckRecord[];
  witchPotions: WitchPotions;
  publicLog: PublicEvent[];
}

export type PublicEvent =
  | {type: 'speak'; day: number; speaker: PlayerId; text: string}
  | {type: 'death'; day: number; victim: PlayerId; reason: 'wolves' | 'vote' | 'poison' | 'hunter'}
  | {type: 'vote'; day: number; voter: PlayerId; target: PlayerId}
  | {type: 'phase'; day: number; phase: PhaseKind}
  | {type: 'announce'; day: number; text: string}
