import { test, expect } from 'claude-code/testing'
// 「看起來是真的」那幾支是隨手編的，只是不符合假號碼的規則；不是任何客戶的電話
import { looksFake, realPhones } from '../hooks/register'

test('假號碼的規則：四個一樣或四個連號', async () => {
  for (const ok of ['02-0000-1234', '02-2222-3331', '0912-345-678', '02 2345 6789', '02-2299-1234', '(02)0000-9999', '0900-000-000', '02 2277 8899', '0922333444', '0933000111']) expect(looksFake(ok)).toBe(true)
  for (const real of ['02-8521-3344', '0932-168-825', '03-5783-911', '(04)2358-1120']) expect(looksFake(real)).toBe(false)
  expect(realPhones('版號 20261010-327、統編 12345678、日期 2026-10-05、金額 02000000 都不是電話').length).toBe(0)
  expect(realPhones('打 02-8521-3344 或 0932-168-825，測試用 02-0000-1234')).toEqual(['02-8521-3344', '0932-168-825'])
})

test('Write：repo 裡有真電話就擋，假電話與 leads/、/tmp 放行', async ($, on) => {
  let wrote = 0
  on('tool.call', { tool: 'Write' }, ($, e) => { wrote += 1; return { result: { type: 'create' as const, filePath: e.file_path, content: e.content, structuredPatch: [] } } })
  const denied = await $.tool.call({ tool: 'Write', file_path: '/home/user/asaaaa/tests/e2e/test-x.js', content: "const REC={phoneRaw:'02-8521-3344'}" })
  expect(String(denied.deny || (denied.isError ? denied.text : ''))).toMatch(/真的電話/)
  expect(wrote).toBe(0)
  const fake = await $.tool.call({ tool: 'Write', file_path: '/home/user/asaaaa/tests/e2e/test-x.js', content: "const REC={phoneRaw:'02-2222-3331'}" })
  expect(fake.deny).toBeUndefined()
  const leads = await $.tool.call({ tool: 'Write', file_path: '/home/user/asaaaa/leads/trade/x.csv', content: '02-8521-3344' })
  expect(leads.deny).toBeUndefined()
  const tmp = await $.tool.call({ tool: 'Write', file_path: '/tmp/x.txt', content: '02-8521-3344' })
  expect(tmp.deny).toBeUndefined()
  expect(wrote).toBe(3)
})

test('Edit：新內容有真電話就擋', async ($, on) => {
  on('tool.call', { tool: 'Edit' }, ($, e) => ({ result: { filePath: e.file_path, oldString: e.old_string, newString: e.new_string, originalFile: '', structuredPatch: [], userModified: false, replaceAll: false } }))
  const denied = await $.tool.call({ tool: 'Edit', file_path: '/home/user/asaaaa/README.md', old_string: 'a', new_string: '客戶電話 0932-168-825' })
  expect(String(denied.deny || (denied.isError ? denied.text : ''))).toMatch(/真的電話/)
  const ok = await $.tool.call({ tool: 'Edit', file_path: '/home/user/asaaaa/README.md', old_string: 'a', new_string: '測試電話 0912-345-678' })
  expect(ok.deny).toBeUndefined()
})

test('Bash：不是 git commit 的指令不檢查', async ($, on) => {
  let ran = 0
  on('tool.call', { tool: 'Bash' }, () => { ran += 1; return { result: { stdout: '', stderr: '', interrupted: false, isImage: false } } })
  const r = await $.tool.call({ tool: 'Bash', command: 'git status' })
  expect(r.deny).toBeUndefined()
  expect(ran).toBe(1)
})
