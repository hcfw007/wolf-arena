import {Faction, PlayerState, ROLE_KIND, WinCondition} from './types.js'

/**
 * 纯函数版胜负判定（便于单测）：
 * - 狼人全灭 → 好人胜
 * - 屠边（edge，9 人局标准）：神职全灭或平民全灭 → 狼人胜
 * - 屠城（city）：狼人数量 ≥ 好人数量 → 狼人胜
 */
export function evaluateWinner(players: PlayerState[], winCondition: WinCondition): Faction | null {
  const alive = players.filter((p) => p.alive)
  const aliveWolves = alive.filter((p) => ROLE_KIND[p.role] === 'wolf').length
  if (aliveWolves === 0) return 'villagers'

  if (winCondition === 'city') {
    return aliveWolves >= alive.length - aliveWolves ? 'wolves' : null
  }

  const aliveGods = alive.filter((p) => ROLE_KIND[p.role] === 'god').length
  const aliveVillagers = alive.filter((p) => ROLE_KIND[p.role] === 'villager').length
  return aliveGods === 0 || aliveVillagers === 0 ? 'wolves' : null
}
