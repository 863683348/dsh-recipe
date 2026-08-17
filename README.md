# dsh-recipe — 插件界的 dotfiles（配方聚合）

把 dsh 插件打包成**场景配方**：一次说清"我要一套 XX 环境"，而不是一个一个装插件。V2EX 有人做过"插件组合索引"但没做成可安装插件——本插件把 recipe 做进 DSH 本体。

## 为什么需要它

- 用户要的是**环境**（"浏览器开发环境"、"学术写作套装"、"通知全家桶"），不是单个插件。
- `recipe` 工具：`list`（浏览全部配方）→ `search`（按需求匹配）→ `apply`（展开配方：有序插件 + 安装命令）→ `compose`（多个配方合并去重）。
- recipe 格式即"插件清单 + 顺序 + 可选配置"（JSON），纯本地、零网络、零依赖。

## 安装

```bash
dsh plugin --profile <profile> add dsh-recipe
```

## 内置配方（10 个）

| id | 名称 | 插件数 |
| --- | --- | --- |
| `browser-dev-env` | 浏览器开发环境 | 4 |
| `notification-suite` | 通知全家桶 | 6 |
| `academic-writing` | 学术写作套装 | 5 |
| `mobile-remote` | 移动远程控制 | 3 |
| `security-hardening` | 安全加固套装 | 4 |
| `memory-kit` | 记忆持久化套装 | 5 |
| `fun-break` | 娱乐休闲 | 4 |
| `model-routing` | 模型路由优化 | 5 |
| `workflow-automation` | 工作流自动化 | 5 |
| `market-manager` | 插件市场管理 | 5 |

## 用法（模型侧）

`recipe` 工具：

| action | 参数 | 行为 |
| --- | --- | --- |
| `list` | — | 列出全部配方 |
| `search` | `need` | 按自然语言需求匹配配方 |
| `apply` | `recipeId` 或 `need` | 展开配方：有序插件清单 + 安装命令序列 |
| `compose` | `recipeId`（逗号分隔） | 合并多个配方为整套环境（去重、保序） |

"一键应用整套"输出即点菜单：逐条 `dsh plugin add` 命令 + 一行合并命令；模型可直接执行或交给用户确认。

## 设计

- **纯逻辑**：`lib/recipe.js`（检索/展开/组合/命令序列）零依赖；`lib/recipe-data.json`（配方）+ `lib/plugins.json`（84 个插件目录，与 dsh-need-finder 同源）。
- **配方格式**：`{ id, name, nameZh, description, descriptionZh, tags, plugins: [{name, config?}] }`——依赖顺序即数组顺序；`compose` 做并集去重，天然支持 DAG 化编排的前置。
- **安全**：无网络、无写入、无 secrets。

## 测试

```bash
node test/recipe.test.mjs
```

## License

MIT
