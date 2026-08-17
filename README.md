# caffeinate-hold

DSH（DeepSeek Harness）Host 侧静态插件：**当有任务运行时，调用 macOS 的 `caffeinate` 命令阻止系统休眠；任务全部结束后自动释放。**

> 已发布到 npm：`caffeinate-hold`。仅适用于 macOS（`caffeinate` 为系统自带命令）。

## 工作原理

| 触发源 | 机制 |
| --- | --- |
| agent 运行中 | 监听 `agent/status` 事件，任一 agent（主会话、子代理、workflow 派生 agent）进入 `running` 即视为忙碌 |
| 后台任务 | 监听 `jobs` 服务变更，存在 `running`/`stopping` 状态的任务即视为忙碌 |
| 初始快照 | 插件启动时枚举已存在的 agent，避免漏判插件加载前就在运行的任务 |

忙碌 → 通过 `subprocess.spawn` 拉起单个 `caffeinate` 进程；全部空闲 → `terminate()` 释放；插件停止/更新时同样清理。

## 目录结构

```
caffeinate-hold/
├── caffeinate-hold.js   # 插件本体（CommonJS）
└── README.md            # 本说明
```

## 安装

### 方式一：npm 包（推荐，随包升级）

```bash
# 在 profile 目录中安装插件依赖（pnpm 转发）
dsh plugin --profile web add caffeinate-hold
```

在 `~/.dsh/profiles/web/cordis.patch.yml` 中 insert 一行（用 npm 包名）：

```yaml
- insert:
    - id: caffeinate-hold
      name: caffeinate-hold
```

### 方式二：本地路径（开发调试）

`name` 直接指向插件文件：

```yaml
- insert:
    - id: caffeinate-hold
      name: /Users/kdylan/Project/deepseek_harnes/caffeinate-hold/caffeinate-hold.js
```

修改配置或插件代码后重启 DSH 生效（配置层与模块文件支持热加载，多数情况无需重启）。

## 参数调整

编辑 `caffeinate-hold.js` 顶部的 `CAFFEINATE_ARGS` 常量：

- `['-i']`（默认）— 阻止空闲休眠（电池 / AC 均有效）
- `['-i', '-s', '-m']` — 额外阻止系统休眠（仅 AC 电源有效）与磁盘休眠
- `['-dimsu']` — 全保持：系统 + 磁盘 + 显示器常亮

## 临时禁用

- 在 patch 行添加 `disabled: true`，或删除整个 insert 块，然后重启 / 等待热加载。

## 验证

```bash
# 插件运行时应能看到 caffeinate 进程
pgrep -fl caffeinate

# 组合树中应包含插件行
dsh web --dump-config | grep caffeinate
```

## 注意事项

- 仅适用于 macOS（`caffeinate` 为系统自带命令）；其他平台插件会报错一次并自动失效，不影响 Harness 运行。
- 本目录位于 DSH 安装之外，升级 DSH 不会覆盖或删除插件。

## 开发者备注

插件通过 `inject: ['subprocess', 'jobs', 'agents']` 声明所需服务：DSH 的各 loader 条目**并发加载**，激活靠服务可用性驱动，若不声明 inject，插件可能先于服务提供者执行 apply 而拿不到服务（`ctx.get` 返回 undefined）导致静默失效。开发自己的 DSH 插件时请务必声明依赖服务。
