export type Role =
  | 'werewolf'
  | 'villager'
  | 'seer'
  | 'witch'
  | 'hunter';

export type Faction = 'wolves' | 'villagers';

export const ROLE_FACTION: Record<Role, Faction> = {
  werewolf: 'wolves',
  villager: 'villagers',
  seer: 'villagers',
  witch: 'villagers',
  hunter: 'villagers',
};

export const ROLE_LABEL_CN: Record<Role, string> = {
  werewolf: '狼人',
  villager: '平民',
  seer: '预言家',
  witch: '女巫',
  hunter: '猎人',
};

export type PlayerId = number;

export interface PlayerState {
  id: PlayerId;
  name: string;
  role: Role;
  alive: boolean;
  personality: string;
}

export type Phase =
  | { kind: 'night-wolves' }
  | { kind: 'night-seer' }
  | { kind: 'night-witch'; killedTonight: PlayerId | null }
  | { kind: 'day-announce'; deaths: PlayerId[] }
  | { kind: 'day-discuss'; round: number }
  | { kind: 'day-vote' }
  | { kind: 'day-execute'; executed: PlayerId | null }
  | { kind: 'hunter-shoot'; hunterId: PlayerId }
  | { kind: 'game-over'; winner: Faction };

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
  phase: Phase;
  players: PlayerState[];
  seerChecks: SeerCheckRecord[];
  witchPotions: WitchPotions;
  publicLog: PublicEvent[];
}

export type PublicEvent =
  | { type: 'speak'; day: number; speaker: PlayerId; text: string }
  | { type: 'death'; day: number; victim: PlayerId; reason: 'wolves' | 'vote' | 'poison' | 'hunter' }
  | { type: 'vote'; day: number; voter: PlayerId; target: PlayerId }
  | { type: 'phase'; day: number; phase: Phase['kind'] };
