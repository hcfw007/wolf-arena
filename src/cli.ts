import 'dotenv/config'
import chalk from 'chalk'
import {CliOptions, parseCliArgs, USAGE} from './cli-args.js'
import {GameMaster} from './game/master.js'
import {PlayerState} from './game/types.js'
import {DeepSeekProvider} from './providers/deepseek.js'
import {FakeProvider} from './providers/fake.js'
import {LLMProvider} from './providers/types.js'
import {GameRecorder, ReplayFormat} from './recorder.js'

const PLAYERS: PlayerState[] = [
  {id: 1, name: '老张', role: 'werewolf', alive: true, personality: '老北京出租车司机，爱聊家长里短，发言喜欢绕弯子混在闲聊里'},
  {id: 2, name: '小美', role: 'werewolf', alive: true, personality: '95后女生，外向活泼，习惯用反问句带节奏'},
  {id: 3, name: '大刘', role: 'werewolf', alive: true, personality: '中年程序员，理性冷静，喜欢用逻辑链条说话'},
  {id: 4, name: '阿珍', role: 'seer', alive: true, personality: '广东阿姨，直率果断，敢于硬刚'},
  {id: 5, name: '陈博', role: 'witch', alive: true, personality: '医生，谨慎多疑，发言留余地，话不多但句句关键'},
  {id: 6, name: '老猎', role: 'hunter', alive: true, personality: '退伍军人，言简意赅，威慑感强'},
  {id: 7, name: '小王', role: 'villager', alive: true, personality: '刚入职的应届生，逻辑清晰但有点紧张'},
  {id: 8, name: '老李', role: 'villager', alive: true, personality: '中学老师，喜欢点评和总结，偶尔好为人师'},
  {id: 9, name: '阿明', role: 'villager', alive: true, personality: '90后摄影师，话少但观察细致'},
]

function buildProvider(opts: CliOptions): LLMProvider {
  if (opts.provider === 'fake') return new FakeProvider()
  return new DeepSeekProvider({chatModel: opts.model, baseURL: opts.baseUrl})
}

/** --format all 时按目录处理 --out，否则当作完整文件名。 */
function outputTargets(opts: CliOptions, stamp: string): {path: string; format: ReplayFormat}[] {
  if (opts.format === 'all') {
    const dir = opts.out ?? 'logs'
    const formats: ReplayFormat[] = ['md', 'json', 'html']
    return formats.map((format) => ({path: `${dir}/game-${stamp}.${format}`, format}))
  }
  const format = opts.format
  return [{path: opts.out ?? `logs/game-${stamp}.${format}`, format}]
}

async function main() {
  const opts = parseCliArgs(process.argv.slice(2))
  if (opts.help) {
    console.log(USAGE)
    return
  }

  if (opts.verbose) {
    console.log(chalk.bgMagenta.white('  WOLF ARENA — 9 个 AI 玩狼人杀  \n'))
    console.log(`后端：${opts.provider} | 赛制：${opts.winCondition === 'city' ? '屠城' : '屠边'} | 上限：${opts.days} 天\n`)
    console.log('身份分配：')
    PLAYERS.forEach((p) => {
      console.log(chalk.dim(`  ${p.id}号(${p.name}) — ${p.personality}`))
    })
  }

  const provider = buildProvider(opts)
  const recorder = new GameRecorder()
  const gm = new GameMaster({
    players: PLAYERS,
    provider,
    verbose: opts.verbose,
    recorder,
    winCondition: opts.winCondition,
  })
  const winner = await gm.run(opts.days)

  const totals = provider.totals
  console.log(
    chalk.cyan(
      `\n=== Token 统计：调用 ${totals.calls} 次，prompt ${totals.promptTokens}，completion ${totals.completionTokens} ===`,
    ),
  )
  console.log(chalk.cyan(`=== 最终胜利方：${winner === 'wolves' ? '狼人' : '好人'} ===`))

  gm.endGameWithStats(winner, {
    calls: totals.calls,
    promptTokens: totals.promptTokens,
    completionTokens: totals.completionTokens,
  })

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
  for (const target of outputTargets(opts, stamp)) {
    const saved = recorder.save(target.path, target.format)
    console.log(chalk.dim(`复盘已保存：${saved}`))
  }
}

main().catch((err) => {
  console.error(chalk.red(String(err instanceof Error ? err.message : err)))
  console.error(chalk.dim('\n用 --help 查看用法。'))
  process.exit(1)
})
