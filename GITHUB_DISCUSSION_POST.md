# 发帖草稿(deepseek-ai/deepseek-harness Discussions · Show and tell)

## 标题(二选一)

- 推荐:`☕️ 分享 DSH 插件:caffeinate-hold —— 任务运行期间自动阻止 Mac 休眠`
- 备选:`[Show and tell] caffeinate-hold:让 Mac 在 Harness 干活时保持清醒的 DSH 插件`

## 正文

---

## 这是什么

**caffeinate-hold** 是一个 DeepSeek Harness(DSH)Host 侧静态插件:当**任意 agent 正在运行,或存在活跃后台任务**时,自动调用 macOS 的 `caffeinate` 命令阻止系统休眠;全部空闲后自动终止释放。

**动机**:跑长任务(headless 批量作业、workflow、多个 subagent 并发)时,Mac 一旦空闲休眠,任务就可能中断或变慢;手动 `caffeinate -i` 又容易忘记释放,一直挂着浪费电。这个插件把"该不该保持清醒"的判断交给 Harness 自己。

## 特性

- ✅ 全自动:agent 运行 / 后台任务存在 → 阻止休眠;全部空闲 → 自动释放
- ✅ 事件驱动:监听 `agent/status` 与 `jobs` 服务变更,无需轮询
- ✅ 冷启动快照:插件加载时枚举已存在的 agent,不漏判插件启动前就在跑的任务
- ✅ 零残留:全程只维护单个 `caffeinate` 进程,空闲即终止,插件停止/更新时同样清理
- ✅ 非 macOS 自动降级:其他平台报一次错即静默失效,不影响 Harness 运行
- ✅ 可调强度:`-i`(默认,阻止空闲休眠)→ `-dimsu`(系统 + 磁盘 + 显示器全保持)

## 安装

通过 DSH 官方插件机制安装(包已发布到 npm):

```bash
dsh plugin --profile web add caffeinate-hold
```

在 `~/.dsh/profiles/web/cordis.patch.yml` 中插入:

```yaml
- insert:
    - id: caffeinate-hold
      name: caffeinate-hold
```

开发调试也可直接用本地路径加载(见 README),配置层与模块文件支持热加载。

## 工作原理

| 触发源 | 机制 |
| --- | --- |
| agent 运行中 | 监听 `agent/status`,任一 agent(主会话 / 子代理 / workflow 派生)进入 `running` 即视为忙碌 |
| 后台任务 | 监听 `jobs` 服务变更,存在 `running` / `stopping` 状态的任务即视为忙碌 |
| 初始快照 | 插件启动时枚举已存在的 agent,避免漏判 |

忙碌 → 通过 `subprocess.spawn` 拉起单个 `caffeinate -i`;全部空闲 → `terminate()` 释放。

## 链接

- npm:[caffeinate-hold@0.1.0](https://www.npmjs.com/package/caffeinate-hold)
- 源码:[github.com/k-dylan/dsh-caffeinate-hold](https://github.com/k-dylan/dsh-caffeinate-hold)
- 许可证:MIT

欢迎试用、提 issue 或 PR(例如:其他平台的 no-sleep 方案、更多触发条件、按 agent 粒度开关)。

---

## 网页发帖步骤(手动路径)

1. 打开 https://github.com/deepseek-ai/deepseek-harness/discussions
2. 点击绿色 **New discussion** 按钮
3. 分类选择 **Show and tell**
4. 粘贴上面标题与正文
5. 点击 **Start discussion**
