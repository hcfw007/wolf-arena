import 'dotenv/config'
import chalk from 'chalk'
import {AIPlayer} from './ai/player.js'
import {formatSeerHistory} from './ai/prompts.js'
import {PlayerState, ROLE_LABEL_CN} from './game/types.js'
import {DeepSeekProvider} from './providers/deepseek.js'

const players: PlayerState[] = [
  {id: 1, name: '老张', role: 'werewolf', alive: true, personality: '老北京出租车司机，爱聊家长里短，发言喜欢绕弯子混在闲聊里'},
  {id: 2, name: '小美', role: 'seer', alive: true, personality: '大学生，逻辑清晰，说话条理分明，敢于对线'},
  {id: 3, name: '大刘', role: 'villager', alive: true, personality: '中年程序员，理性冷静，喜欢用数据说话'},
  {id: 4, name: '阿珍', role: 'werewolf', alive: true, personality: '广东阿姨，喜欢和稀泥但暗中带节奏'},
  {id: 5, name: '陈博', role: 'witch', alive: true, personality: '医生，谨慎多疑，发言留余地'},
]

async function main() {
  const provider = new DeepSeekProvider()
  const wolfPlayer = new AIPlayer(players[0]!, provider)
  const seerPlayer = new AIPlayer(players[1]!, provider)

  const publicHistory = [
    '【第 1 天 白天】',
    '4 号(阿珍) 发言：天黑了又天亮了，咱也不知道死了谁，先听各位前置位说说看法吧。',
  ].join('\n')

  console.log(chalk.cyan('=== 冒烟测试：狼人 vs 预言家 各发一段话 ===\n'))

  console.log(chalk.yellow(`[1 号 ${players[0]!.name} - ${ROLE_LABEL_CN[players[0]!.role]}] 思考中...`))
  const wolfOut = await wolfPlayer.speak({
    alivePlayers: players,
    publicHistory,
    privateInfo: '你的狼队友是 4 号(阿珍)。今晚你们刀了 3 号。',
    currentDay: 1,
    round: 1,
    maxChars: 100,
  })
  console.log(chalk.gray(`  思考: ${wolfOut.thinking}`))
  console.log(chalk.white(`  发言: ${wolfOut.speech}\n`))

  console.log(chalk.yellow(`[2 号 ${players[1]!.name} - ${ROLE_LABEL_CN[players[1]!.role]}] 思考中...`))
  const seerOut = await seerPlayer.speak({
    alivePlayers: players,
    publicHistory: publicHistory + `\n1 号(老张) 发言：${wolfOut.speech}`,
    privateInfo: `你的查验记录：${formatSeerHistory(
      [{day: 1, target: 1, result: 'wolves'}],
      players,
    )}`,
    currentDay: 1,
    round: 1,
    maxChars: 100,
  })
  console.log(chalk.gray(`  思考: ${seerOut.thinking}`))
  console.log(chalk.white(`  发言: ${seerOut.speech}\n`))

  console.log(
    chalk.cyan(
      `=== Token 使用：调用 ${provider.totals.calls} 次，prompt ${provider.totals.promptTokens}，completion ${provider.totals.completionTokens} ===`,
    ),
  )
}

main().catch((err) => {
  console.error(chalk.red('Smoke test failed:'), err)
  process.exit(1)
})
