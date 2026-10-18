import {parseArgs} from 'node:util'
import {DEFAULT_WIN_CONDITION, WinCondition} from './game/types.js'
import {ReplayFormat} from './recorder.js'

export type ProviderKind = 'deepseek' | 'fake'
export type OutputFormat = ReplayFormat | 'all'

export interface CliOptions {
  days: number;
  verbose: boolean;
  provider: ProviderKind;
  winCondition: WinCondition;
  format: OutputFormat;
  model?: string;
  baseUrl?: string;
  out?: string;
  help: boolean;
}

export const DEFAULTS: CliOptions = {
  days: 8,
  verbose: true,
  provider: 'deepseek',
  winCondition: DEFAULT_WIN_CONDITION,
  format: 'md',
  help: false,
}

const PROVIDERS: readonly ProviderKind[] = ['deepseek', 'fake']
const FORMATS: readonly OutputFormat[] = ['md', 'json', 'html', 'all']
const WIN_CONDITIONS: readonly WinCondition[] = ['edge', 'city']

export const USAGE = `
Wolf Arena — 9 个 AI 玩狼人杀

用法：
  npm start -- [选项]

选项：
  --days <n>               最多打几天（默认 8）
  --provider <deepseek|fake>
                           模型后端；fake 不联网不花钱，用来跑通流程（默认 deepseek）
  --model <name>           DeepSeek 模型名（默认取 DEEPSEEK_MODEL 或 deepseek-chat）
  --base-url <url>         DeepSeek 兼容端点（默认取 DEEPSEEK_BASE_URL）
  --win-condition <edge|city>
                           屠边（标准 9 人局，默认）或屠城（狼数 ≥ 好人数）
  --format <md|json|html|all>
                           复盘导出格式（默认 md；all 同时导出三种）
  --out <path>             输出文件名；--format all 时按目录处理
  --quiet                  不打印对局过程，只留结果
  -h, --help               显示本帮助

示例：
  npm start -- --provider fake --days 3
  npm start -- --format all --out logs/
  npm start -- --win-condition city --quiet
`.trim()

export function parseCliArgs(argv: string[]): CliOptions {
  const {values} = parse(argv)

  return {
    days: parseDays(values.days),
    verbose: !values.quiet,
    provider: oneOf(values.provider, PROVIDERS, '--provider', DEFAULTS.provider),
    winCondition: oneOf(values['win-condition'], WIN_CONDITIONS, '--win-condition', DEFAULTS.winCondition),
    format: oneOf(values.format, FORMATS, '--format', DEFAULTS.format),
    model: values.model,
    baseUrl: values['base-url'],
    out: values.out,
    help: values.help ?? false,
  }
}

const ARG_SPEC = {
  days: {type: 'string'},
  provider: {type: 'string'},
  model: {type: 'string'},
  'base-url': {type: 'string'},
  'win-condition': {type: 'string'},
  format: {type: 'string'},
  out: {type: 'string'},
  quiet: {type: 'boolean'},
  help: {type: 'boolean', short: 'h'},
} as const

function parse(argv: string[]) {
  try {
    return parseArgs({args: argv, options: ARG_SPEC, allowPositionals: false, strict: true})
  } catch (err) {
    throw new Error(`参数解析失败：${(err as Error).message}`, {cause: err})
  }
}

function parseDays(raw: string | undefined): number {
  if (raw === undefined) return DEFAULTS.days
  const days = Number(raw)
  if (!Number.isInteger(days) || days < 1) {
    throw new Error(`--days 需要是正整数，收到 ${raw}`)
  }
  return days
}

function oneOf<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  flag: string,
  fallback: T,
): T {
  if (value === undefined) return fallback
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`${flag} 只能是 ${allowed.join(' | ')}，收到 ${value}`)
  }
  return value as T
}
