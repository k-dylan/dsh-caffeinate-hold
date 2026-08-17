// 独立冒烟测试:caffeinate-hold 插件逻辑(带 mock 服务)
'use strict'
const plugin = require('/Users/kdylan/Project/deepseek_harnes/caffeinate-hold/caffeinate-hold.js')

const calls = []
const handlers = {}
let jobSub = null
let cleanup = null
let jobList = () => [{ id: 'j1', status: 'running' }]

// 稳定 mock 对象:插件 apply 时捕获的引用与测试后续修改的是同一个对象
const mockJobs = {
  list(agent) { return jobList() },
  onJobsChanged(fn) { jobSub = fn; return () => {} },
}
const mockSubprocess = {
  spawn(spec) {
    calls.push({ kind: 'spawn', argv: spec.argv })
    return {
      pid: 4242,
      terminate() { calls.push({ kind: 'terminate' }) },
      done: new Promise(() => {}), // 永不结束,模拟常驻进程
    }
  },
}
const mockAgents = {
  list() { return [{ id: 'a1', status: 'running' }] },
}

const fakeCtx = {
  get(key) {
    if (key === 'subprocess') return mockSubprocess
    if (key === 'jobs') return mockJobs
    if (key === 'agents') return mockAgents
    return undefined
  },
  on(ev, fn) { handlers[ev] = fn },
  effect(fn) {
    const ret = fn()
    if (typeof ret === 'function') cleanup = ret
    return () => {}
  },
}

const count = (kind) => calls.filter(c => c.kind === kind).length

console.log('0. 插件 inject 声明:', JSON.stringify(plugin.inject))

try {
  plugin.apply(fakeCtx)
  console.log('1. apply() 执行成功,无异常')

  // 初始快照:agent a1 running + 任务 running → 应立即 spawn
  console.log('2. 初始快照 spawn 次数:', count('spawn'), '| argv:', JSON.stringify(calls[0]?.argv))

  // 事件:a1 转 idle(任务仍在跑)→ 不应 terminate
  handlers['agent/status']({ agent: { id: 'a1', status: 'idle' } })
  console.log('3. agent idle 但任务仍在 → terminate 次数(应 0):', count('terminate'))

  // 任务清空 → 应 terminate
  jobList = () => []
  if (jobSub) jobSub()
  console.log('4. 任务清空后 terminate 次数(应 1):', count('terminate'))

  // 事件:再次 running → 应重新 spawn(第 2 次)
  jobList = () => [{ id: 'j1', status: 'running' }]
  handlers['agent/status']({ agent: { id: 'a1', status: 'running' } })
  console.log('5. 再次忙碌后 spawn 次数(应 2):', count('spawn'))

  // 插件停止 → cleanup 应 terminate(第 2 次)
  if (cleanup) cleanup()
  console.log('6. 插件停止后 terminate 次数(应 2):', count('terminate'))

  const pass =
    count('spawn') === 2 &&
    count('terminate') === 2 &&
    JSON.stringify(calls[0]?.argv) === JSON.stringify(['caffeinate', '-i'])
  console.log(pass ? '=== 全部通过:插件逻辑正常 ===' : '=== 存在失败项 ===')
  process.exit(pass ? 0 : 1)
} catch (err) {
  console.error('插件 apply 抛异常:', err)
  process.exit(2)
}
