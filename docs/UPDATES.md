# 自动更新与发布

从 v1.3.0 起，`lyrivamusic.js` 是固定的更新加载器，并内置本次发布的完整扩展作为离线兜底。无需额外后台程序。

## 用户更新流程

1. Spotify 启动后及运行期间每 30 分钟检查本仓库最新正式 Release。
2. 发现更新后自动打开更新页，下载并校验运行包。正在编辑其他设置时，等关闭设置后再显示。
3. 下载完成后点「重新加载」启用，或在下一次启动 Spotify 时启用。当前会话不会执行两份扩展。
4. 网络或校验失败保留旧版。新包只有完成启动后才替代已知可用版本；启动失败则下次回退。

首次安装和手动更新都只需下载 Release 附件 `lyrivamusic.js`，放入或覆盖 Spicetify 的 `Extensions/lyrivamusic.js` 后执行 `spicetify apply`。GitHub 自动生成的 `Source code (zip/tar.gz)` 是源码归档，不是安装包。

v1.2.0 及以前没有加载器，需要手动覆盖安装一次。将来的更新如果需要升级加载器协议，更新页也会明确引导手动安装。

## 维护者发布流程

1. 同步修改 `package.json` 和 `project/config.ts` 中的版本号，例如 `1.3.1`。
2. 可在 `docs/releases/v1.3.1.md` 编写更新说明；缺省时使用 GitHub 生成的说明。
3. 推送到 `main`。CI 通过测试、lint、格式、类型检查及构建后，自动发布尚不存在的版本。

同一版本已发布时，后续提交只检查构建，不重复发布或覆盖产物。开发中提交不会自动变成面向用户的新版本；需要发布时提升版本号。

工作流使用 GitHub 自动提供的仓库令牌，无需提交个人 Token。`main` 保留源码，`updates` 分支仅存放按版本划分的分发文件，不混入源码目录。

## 产物和顺序

| 文件                     | 分发位置                             | 用途                                         |
| ------------------------ | ------------------------------------ | -------------------------------------------- |
| `lyrivamusic.js`         | Release 唯一安装附件                 | 首次安装或手动更新的加载器，含离线兜底版本   |
| `lyrivamusic-runtime.js` | `updates/versions/v<版本>/`          | 自动更新下载的完整扩展，含样式               |
| `manifest.json`          | `updates/versions/v<版本>/`          | 版本、加载器协议、运行包地址、大小和 SHA-256 |
| `SHA256SUMS.txt`         | 本地或 CI 的 `dist/`，不上传 Release | 构建产物校验                                 |

新版本 Release 只上传 `lyrivamusic.js`；运行包和清单仍只在 `updates` 分支分发。加载器使用的地址保持不变：`https://raw.githubusercontent.com/okgutta/lyrivaMusic/updates/versions/v<版本>/manifest.json`，以及同目录下的 `lyrivamusic-runtime.js`。

发布任务先上传并校验 Release 草稿中的 `lyrivamusic.js`，再在 `updates` 分支的一次提交中写入运行包与清单；验证分发地址后才公开 Release。重试旧流程创建的草稿时，会清理其中的运行包、清单和校验文件附件。已公开的 Release 和分发文件不会被覆盖，历史版本附件保持原样。

客户端只接受本仓库最新正式 Release，拒绝预发布、回退版本、其他仓库地址、错误大小或摘要的包。运行包保存在 Spotify Origin 下的 IndexedDB，歌词缓存清理不会删除更新缓存。凭据、账号和歌词数据不会随更新检查发送。

自动更新依赖 GitHub API 和 raw.githubusercontent.com 可访问；访问失败可在更新页重试，或使用 Release 中的安装包手动更新。
