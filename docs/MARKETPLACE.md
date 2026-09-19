# Marketplace 发布说明

lyrivaMusic 正在准备 Spicetify Marketplace 发布，尚未确认正式收录。仓库 Topic 尚待添加，Spotify 中的 Marketplace 安装尚未实测；当前可使用 [README 中的手动安装方式](../README.md#手动安装)。

## 官方规则

发布前以 [Spicetify Marketplace 官方发布 Wiki](https://github.com/spicetify/marketplace/wiki/Publishing-to-Marketplace) 和 [官方仓库](https://github.com/spicetify/marketplace) 的当前规则为准。

- 扩展通过公开 GitHub 仓库的 `spicetify-extensions` Topic 被发现。
- Marketplace 从仓库默认分支读取根目录 `manifest.json`。
- 官方 Wiki 列出的必填字段为 `name`、`description`、`preview`、`main`、`readme`；`authors` 和 `tags` 也是支持的字段。
- `main`、`preview` 和 `readme` 支持仓库内路径或完整 HTTP(S) 地址。
- 安装时 Marketplace 加载 `main` 指向的脚本，并可能追加时间戳参数。下载成功并不等于已经在 Spotify 内安装成功，应完成客户端验证。

GitHub 搜索索引及 Marketplace 缓存可能延迟更新，不承诺固定的收录时间。只有确认可以搜索并完成安装验证后，才将 README 状态更新为已收录。

## 发布文件

| 文件或地址                                         | 用途                                           |
| -------------------------------------------------- | ---------------------------------------------- |
| [根目录 manifest.json](../manifest.json)           | Marketplace 展示与安装清单。                   |
| [README.md](../README.md)                          | 简体中文项目介绍、安装与使用说明。             |
| [docs/marketplace.png](marketplace.png)            | 当前 lyrivaMusic 在 Spotify 中的实际界面预览。 |
| `lyrivamusic.js`                                   | Release 中的单文件安装附件。                   |
| [LICENSE](../LICENSE) 与 [NOTICE.md](../NOTICE.md) | 主许可证、上游归属与第三方许可声明。           |

根清单的 `main` 使用稳定安装地址：

```text
https://github.com/okgutta/lyrivaMusic/releases/latest/download/lyrivamusic.js
```

每次正式发布都应保留 `lyrivamusic.js` 文件名。Marketplace 的安装标识包含 `main`，不要随版本更换清单中的地址，以免产生重复条目；源码分支也无需再保存一份编译安装包。

根清单的 `preview` 使用 `docs/marketplace.png`，`readme` 使用 `README.md`。更新截图时应展示真实的歌词主体和 Spotify 场景，不包含账号、私密播放列表或密钥。

根 `manifest.json` 与构建生成的 `dist/manifest.json` 用途不同：后者及 `updates` 分支中的清单属于扩展自身的自动更新协议，包含运行包地址、大小和校验信息，不可互相替换。

## 构建与发布

1. 同步更新 `package.json` 和 `project/config.ts` 的版本号，并在 `docs/releases/` 编写对应版本的中文更新说明。发布新版本，不覆盖已有正式 Release。
2. 执行现有检查和构建命令：

   ```sh
   bun install --frozen-lockfile
   bun run check
   bun run build --no-copy
   ```

3. 检查根清单是合法 JSON，所有引用文件存在，`dist/lyrivamusic.js` 正常生成，版本与源码一致。
4. 将审核后的改动提交并推送到默认分支 `main`。现有 GitHub Actions 完成检查、构建和发布，等待工作流成功并核对正式 Release 中的 `lyrivamusic.js`。
5. 验证 [远程根清单](https://raw.githubusercontent.com/okgutta/lyrivaMusic/main/manifest.json)、[预览图](https://raw.githubusercontent.com/okgutta/lyrivaMusic/main/docs/marketplace.png)、README 和稳定安装地址均可访问；安装地址追加时间戳后也应正常返回脚本内容。
6. 在 GitHub 仓库的 **About → Topics** 添加 `spicetify-extensions`，使仓库具备被 Marketplace 发现的条件。
7. 完成下面的 Marketplace 安装验证，再更新项目的收录状态。

保持现有构建和发布流程，不另建一套 Marketplace 构建系统。自动更新的分发与失败回退机制见 [自动更新文档](UPDATES.md)。

## Marketplace 安装验证

1. 打开 Spotify 的 **Marketplace → Extensions**，刷新并搜索 **lyrivaMusic**。
2. 核对维护者为 **okgutta**，确认中文描述、预览图和 README 正确显示。
3. 如果已经手动安装，先移除原有 Spicetify 扩展配置条目，避免同时启用两份；然后通过 Marketplace 安装并按提示重新加载。
4. 播放歌曲，检查歌词页、逐字或逐行同步、译文、设置面板与版本更新页。
5. 重新启动 Spotify，确认扩展仍能加载，再将安装结果和必要的兼容性信息补充到项目文档。
