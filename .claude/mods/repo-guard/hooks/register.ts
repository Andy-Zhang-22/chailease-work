/*
 * repo-guard：這個 repo 是公開的，CLAUDE.md 規定不放客戶電話、每次改版三個地方的版號要一起改並寫 README。
 * 以前全靠我自己小心；這個 mod 在兩個地方自動擋：
 *   1. Write／Edit 寫進 repo 的內容有「看起來是真的」台灣電話 → 擋下（leads/ 的公開資料、/tmp 不管）。
 *   2. Bash 跑 git commit 之前：工作樹相對 HEAD 新增的行有真電話 → 擋；改了網站或後台程式但版號沒動、
 *      版號三處不一致、README 沒有這一版的段落 → 擋。
 * 假電話（測試資料）的規則：去掉區碼後有四個一樣的數字（0000、2222）、四個連號（1234、6789、9876）、
 * 三個三個一樣（333444）或四組疊字（22778899）就當假的。
 */
import type { Register } from 'claude-code'

// 市話 0X-XXXX-XXXX（區碼可帶括號，分隔可空白）、手機 09XX-XXX-XXX；前後不能再接數字（避免把統編、版號切一段出來）
const PHONE_RE = /(?<!\d)(?:\(?0[2-8]\)?[-\s]?\d{3,4}[-\s]?\d{4}|09\d{2}[-\s]?\d{3}[-\s]?\d{3})(?!\d)/g
const SKIP_PATH = /(^|\/)(leads|node_modules|\.git)\//
const OUTSIDE = /^\/(tmp|root\/\.claude)\//
const TEXT_EXT = /\.(js|mjs|cjs|ts|tsx|json|md|html|css|ya?ml|csv|txt)$/i
const APP_PATH = /^(assets\/|index\.html$|tools\/|\.github\/|sw\.js$|manifest\.webmanifest$)/

/** 假號碼：去掉區碼後，有四個一樣的數字或四個連號 */
export function looksFake(num: string): boolean {
  const digits = num.replace(/\D/g, '')
  const local = digits.startsWith('09') ? digits.slice(4) : digits.slice(2)
  if (/(\d)\1{3}/.test(local)) return true                       // 0000、2222
  if (/(\d)\1\1(\d)\2\2/.test(local)) return true                 // 333444、000111
  if (/(\d)\1(\d)\2(\d)\3(\d)\4/.test(local)) return true       // 22778899
  for (let i = 0; i + 3 < local.length; i += 1) {
    const a = Number(local[i]); const b = Number(local[i + 1]); const c = Number(local[i + 2]); const d = Number(local[i + 3])
    if ((b === a + 1 && c === a + 2 && d === a + 3) || (b === a - 1 && c === a - 2 && d === a - 3)) return true
  }
  return false
}

/** 文字裡看起來是真的電話（去重） */
export function realPhones(text: string): string[] {
  const out = new Set<string>()
  for (const m of text.matchAll(PHONE_RE)) if (!looksFake(m[0])) out.add(m[0])
  return [...out]
}

const guarded = (path: string) => !OUTSIDE.test(path) && !SKIP_PATH.test(path)

export const register: Register = (on) => {
  on('tool.call', { tool: 'Write' }, ($, e, next) => {
    const found = guarded(e.file_path) ? realPhones(e.content) : []
    return found.length
      ? { deny: `repo-guard：${e.file_path} 裡有 ${found.length} 支看起來是真的電話（${found.slice(0, 3).join('、')}）。repo 是公開的，測試與註解請用假號碼（0000、1234 這種）。` }
      : next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'repo-guard：寫檔的守門檢查本身出錯，先看 debug log。' }))

  on('tool.call', { tool: 'Edit' }, ($, e, next) => {
    const found = guarded(e.file_path) ? realPhones(e.new_string) : []
    return found.length
      ? { deny: `repo-guard：${e.file_path} 的新內容有 ${found.length} 支看起來是真的電話（${found.slice(0, 3).join('、')}）。repo 是公開的，請用假號碼。` }
      : next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'repo-guard：改檔的守門檢查本身出錯，先看 debug log。' }))

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (!/\bgit\b[^|;&\n]*\bcommit\b/.test(e.command)) return next(e)
    const root = (await $.process.run(['git', 'rev-parse', '--show-toplevel'])).stdout.trim()
    if (!root) return next(e)
    const run = (argv: string[]) => $.process.run(argv, { cwd: root })
    const problems: string[] = []

    // 1. 個資：相對 HEAD 新增的行（leads/ 的公開資料不算）＋還沒追蹤的文字檔
    const diff = await run(['git', 'diff', 'HEAD', '--unified=0', '--no-color', '--', '.', ':(exclude)leads'])
    const added = diff.stdout.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).join('\n')
    const phones = realPhones(added).map((p) => `${p}`)
    const untracked = (await run(['git', 'ls-files', '--others', '--exclude-standard'])).stdout.split('\n').filter((p) => p && TEXT_EXT.test(p) && !SKIP_PATH.test(`/${p}`))
    for (const p of untracked) {
      const text = await $.fs.read(`${root}/${p}`).catch(() => '')
      for (const x of realPhones(typeof text === 'string' ? text : '')) phones.push(`${p}: ${x}`)
    }
    if (phones.length) problems.push(`這次要 commit 的內容有 ${phones.length} 支看起來是真的電話（${phones.slice(0, 3).join('、')}）。repo 是公開的，請改成假號碼。`)

    // 2. 版號：改了網站或後台程式就要換版號；三處一致；README 有這一版
    const changed = (await run(['git', 'diff', 'HEAD', '--name-only', '--', '.'])).stdout.split('\n').filter(Boolean).concat(untracked)
    const touchesApp = changed.some((p) => APP_PATH.test(p))
    const text = async (p: string) => { const t = await $.fs.read(`${root}/${p}`).catch(() => ''); return typeof t === 'string' ? t : '' }
    const ver = String((JSON.parse((await text('version.json')) || '{}') as { version?: string }).version || '')
    const headVer = String((JSON.parse((await run(['git', 'show', 'HEAD:version.json'])).stdout || '{}') as { version?: string }).version || '')
    const appVer = ((await text('assets/js/app.js')).match(/APP_VERSION = '([^']+)'/) || [])[1] || ''
    const htmlVers = [...new Set([...(await text('index.html')).matchAll(/\?v=([0-9-]+)/g)].map((m) => m[1]))]
    if (ver && (appVer !== ver || htmlVers.length !== 1 || htmlVers[0] !== ver)) problems.push(`版號三處不一致：version.json ${ver}、app.js ${appVer || '（找不到）'}、index.html ${htmlVers.join('／') || '（找不到）'}。`)
    if (touchesApp && ver && ver === headVer) problems.push(`改了網站或後台的程式，但版號還是 ${ver}：三個地方（app.js 的 APP_VERSION、index.html 的 ?v=、version.json）要一起改成 日期-流水號。`)
    const serial = ver.split('-')[1] || ''
    if (ver !== headVer && serial && !(await text('README.md')).includes(`（版本 ${serial}）`)) problems.push(`README.md 沒有「（版本 ${serial}）」那一段：每次改版最後要加一段寫使用者原話、做了什麼、測試。`)

    if (problems.length) return { deny: `repo-guard 擋下這次 commit：\n${problems.map((p, i) => `${i + 1}. ${p}`).join('\n')}` }
    $.ui.toast('repo-guard：個資、版號都檢查過了')
    return next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'repo-guard：commit 前的守門檢查本身出錯（git 或檔案讀不到），先看 debug log。' }))
}
