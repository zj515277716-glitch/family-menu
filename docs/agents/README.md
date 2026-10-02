# TRAE 智能体提示词

三个自定义智能体的提示词以本目录为准。**改提示词先改这里、提交，再粘贴到 TRAE**（TRAE 中 @ → 创建智能体 / 编辑智能体）。
所有智能体共同遵守的规矩在 `.trae/rules/project_rules.md`，这里只写角色差异。

| 文件 | TRAE 智能体名 | 工具 |
|---|---|---|
| [dev.md](dev.md) | fm-dev | 读写文件、终端 |
| [reviewer.md](reviewer.md) | fm-reviewer | 读文件、**终端（必须开启）**；不开写文件工具 |
| [verify.md](verify.md) | fm-verify | 读文件、终端、写 `evidence/` 与 `tests/e2e/`；Playwright 脚本 |

主控就是 TRAE 主会话（SOLO），不单独建智能体。主控的职责见 `docs/AI协作开发流程_V2.1.md` 第 1 章。

建好后在一个新会话里问一句"你是谁、现在的规则入口是哪个文件、当前任务是什么"，能答出 fm-xxx、`.trae/rules/project_rules.md`、CURRENT.md 里的当前任务，才算配置生效。
