// caffeinate-hold —— DSH 静态插件（Host 侧）
//
// 功能：当任一 agent 正在运行，或存在活跃后台任务时，调用 macOS 的
//       caffeinate 命令阻止系统休眠；全部空闲后自动终止释放。
//       详细说明见同目录 README.md。
//
// 加载方式（发布版）：~/.dsh/profiles/web/cordis.patch.yml 中 insert 一行，
// 需先执行 dsh plugin --profile web add caffeinate-hold 安装 npm 包：
//   - insert:
//       - id: caffeinate-hold
//         name: caffeinate-hold
// 本地开发：name 指向本文件绝对路径即可。
//
// 注意：包内无 "type": "module"，Node 按 CommonJS 处理（module.exports）。

'use strict'

module.exports = {
  name: 'caffeinate-hold',
  // 声明所需服务：Loader 会等服务就绪后再启动本插件
  // （各 bundle 条目并发加载，不声明 inject 可能先于服务提供者 apply，
  //   导致 ctx.get 全部为 undefined 而静默失效）
  inject: ['subprocess', 'jobs', 'agents'],

  apply(ctx) {
    // 可选服务：缺失时插件静默失效（例如非 macOS 或未挂载对应服务）
    const subprocess = ctx.get('subprocess')
    const jobs = ctx.get('jobs')
    const agentsSvc = ctx.get('agents')
    console.log(`[caffeinate-hold] apply: subprocess=${subprocess !== undefined} jobs=${jobs !== undefined} agents=${agentsSvc !== undefined}`)
    if (subprocess === undefined || jobs === undefined) return

    // caffeinate 参数：-i 阻止空闲休眠（macOS 专用，电池/AC 均有效）
    // 如需更强可改为 ['-i', '-s', '-m']（含系统休眠+磁盘）或 ['-dimsu']（含显示器常亮）
    const CAFFEINATE_ARGS = ['-i']

    // sessionId -> Agent：所有已知 live agent（用于按 owner 查询其后台任务）
    const agents = new Map()
    // 当前处于 running 状态的 agent id
    const running = new Set()

    // 当前 caffeinate 进程句柄
    let proc = null
    let spawnFailed = false

    const stopCaffeinate = () => {
      if (proc !== null) {
        proc.terminate()
        proc = null
      }
    }

    const startCaffeinate = () => {
      if (spawnFailed || proc !== null) return
      try {
        proc = subprocess.spawn({
          argv: ['caffeinate', ...CAFFEINATE_ARGS],
          cwd: '/',
          stdio: {
            stdin: 'ignore',
            stdout: { maxBytes: 1024 },
            stderr: { maxBytes: 4096 },
          },
          graceMs: 2000,
        })
        // spawn 级失败（如非 macOS、无 caffeinate 命令）只报一次，不再重试
        proc.done.then(
          () => { proc = null },
          (err) => {
            spawnFailed = true
            proc = null
            console.error(`[caffeinate-hold] spawn failed: ${String(err)}`)
          },
        )
        console.log(`[caffeinate-hold] started (pid ${proc.pid})`)
      } catch (err) {
        spawnFailed = true
        proc = null
        console.error(`[caffeinate-hold] spawn failed: ${String(err)}`)
      }
    }

    const activeJobs = () => {
      let n = 0
      for (const agent of agents.values()) {
        try {
          for (const job of jobs.list(agent)) {
            if (job.status === 'running' || job.status === 'stopping') n += 1
          }
        } catch {
          // agent 已销毁等瞬时错误，忽略
        }
      }
      return n
    }

    const refresh = () => {
      const n = activeJobs()
      console.log(`[caffeinate-hold] refresh: running=${running.size} jobs=${n} -> ${running.size > 0 || n > 0 ? 'start' : 'stop'}`)
      if (running.size > 0 || n > 0) startCaffeinate()
      else stopCaffeinate()
    }

    // 初始快照：插件启动时可能已有 agent 在运行/后台任务在跑
    if (agentsSvc !== undefined) {
      for (const agent of agentsSvc.list()) {
        agents.set(agent.id, agent)
        if (agent.status === 'running') running.add(agent.id)
      }
    }

    // 事件订阅：agent 生命周期 + 状态切换 + 后台任务变更
    ctx.on('agent/created', (payload) => {
      agents.set(payload.agent.id, payload.agent)
    })
    ctx.on('agent/disposed', (payload) => {
      const id = payload.agent.id
      agents.delete(id)
      running.delete(id)
      refresh()
    })
    ctx.on('agent/status', (payload) => {
      console.log(`[caffeinate-hold] agent/status: ${payload.agent.id} -> ${payload.status}`)
      const id = payload.agent.id
      if (!agents.has(id)) agents.set(id, payload.agent)
      if (payload.status === 'running') running.add(id)
      else running.delete(id)
      refresh()
    })
    ctx.effect(() => jobs.onJobsChanged(() => {
      console.log('[caffeinate-hold] jobs changed')
      refresh()
    }))

    refresh()

    // 插件停止/更新时终止 caffeinate
    ctx.effect(() => () => stopCaffeinate())
  },
}
