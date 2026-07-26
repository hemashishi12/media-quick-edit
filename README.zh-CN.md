# Media Quick Edit

[English](README.md) | [简体中文](README.zh-CN.md)

Media Quick Edit 是一款 Obsidian 插件，可以把 Obsidian Bases 视图变成可直接编辑的书影音资料库。它支持五星评分、两种阅读/观看状态、短评自动保存、状态历史、TMDB 电影与剧集搜索，以及 Open Library 图书搜索。

![Media Quick Edit 视图](docs/media-quick-edit.svg)

## 环境要求

- Obsidian 1.10.2 或更高版本。
- 已启用 Obsidian Bases。
- 搜索电影和剧集需要 TMDB v3 API Key。
- 使用 Open Library 搜索图书不需要 API Key。

## 安装

### 手动安装

1. 从 GitHub Release 下载 `main.js`、`manifest.json` 和 `styles.css`。
2. 创建文件夹 `<仓库>/.obsidian/plugins/media-quick-edit/`。
3. 将上述三个文件复制到该文件夹中。
4. 重启 Obsidian，然后前往 **设置 → 第三方插件**，启用 **Media Quick Edit**。

### 通过 BRAT 安装

在 BRAT 中添加本仓库地址并安装最新版本。BRAT 安装要求 GitHub Release 中包含 `main.js`、`manifest.json` 和 `styles.css`。

## 初始设置

打开 **设置 → 第三方插件 → Media Quick Edit**，配置以下项目：

- **TMDB API Key**：只会保存在当前仓库的插件本地配置 `data.json` 中。
- **电影/剧集文件夹**：TMDB 条目的保存位置。
- **图书文件夹**：Open Library 条目的保存位置。
- **默认 Base**：点击左侧栏快捷按钮时打开的 Base。
- **新增后自动打开条目**。
- **默认新增类型**：电影/剧集或图书。
- 电影和图书各自使用的状态文字。

如需获取 TMDB v3 API Key，请注册 TMDB 账号，在账号设置中打开 API 页面，完成 API 申请，然后把 **API Key（v3 auth）** 填入插件设置。搜索前可以点击 **测试连接**。该 Key 仅会在请求 TMDB 时直接发送给 TMDB；使用 Open Library 时不需要它。

文件夹和 Base 设置均提供当前 Obsidian 仓库内的选择器。插件中不包含任何个人仓库路径。

### 创建兼容的 Base

1. 在 Obsidian 中新建一个 Base，并在视图类型中选择 **Media Quick Edit**。
2. 为 Base 添加筛选条件，使其包含所设置的电影/剧集和图书文件夹。默认路径为 `Media DB/movies` 与 `Media DB/books`。
3. 在插件设置中把该 `.base` 文件选为 **默认 Base**。

插件不会自行猜测哪个 Base 是你的书影音库。明确指定 Base 可以避免插件打开或编辑无关的 Base；自定义视图仍会遵循当前 Base 的筛选条件。

## 新增条目

点击 **标题** 列首右侧的 `+`：

- 选择 **电影/剧集**，通过 TMDB 搜索。
- 选择 **图书**，通过 Open Library 搜索。
- 选择搜索结果，并指定初始状态为“想看/想读”或“看过/读过”。
- 插件会在所设置的文件夹中创建笔记；筛选条件包含该文件夹的 Base 会自动收录它。

Open Library 搜索结果会显示书名、作者和首次出版年份。没有封面的条目会使用本地 SVG 占位图。

## 编辑条目

- 五颗星分别写入 `2、4、6、8、10` 分。
- 点击评分会把条目标为完成，并更新 `finished_date`。
- 状态只有两个内部值：`planned` 和 `completed`。
- 电影与图书的状态显示文字可以分别设置。
- 短评会自动保存；写入短评也会把条目标为完成。
- 列宽和排序方式会保存在 Base 的视图配置中。
- 未评分条目在按评分排序时始终排在已评分条目之后。
- 完成日期相同时，以文件修改时间作为次级排序依据。

## 状态历史

每次覆盖 `finished_date` 的操作都会追加到 `status_history`：

```yaml
status_history:
  - 2026-07-25 | 想看
  - 2026-07-26 | 评分：8分
```

插件会将所设置媒体文件夹中的笔记迁移到结构版本 2：

- `completed` 保持为 `completed`。
- `in-progress`、`on-hold`、`dropped`、缺失值和未知状态会改为 `planned`。
- 缺少 `status_history` 时，会初始化为兼容 Obsidian 的文本列表。
- `mediaQuickEditSchema: 2` 用于避免重复迁移。

启用带有数据结构迁移的新版本前，建议先备份 Obsidian 仓库。

## 隐私

- 插件没有开发者运营的服务器。
- 包括 TMDB API Key 在内的设置，只保存在当前 Obsidian 仓库的插件配置 `data.json` 中。
- `.gitignore` 已排除 `data.json`，请勿将其提交到代码仓库。
- 电影和剧集搜索词会直接发送给 TMDB。
- 图书搜索词会直接发送给 Open Library。
- 除非用户另行下载，海报和封面会通过 TMDB 或 Open Library 的图片链接加载。

## 数据来源与署名

电影和剧集元数据由 [The Movie Database（TMDB）](https://www.themoviedb.org/)提供。本产品使用 TMDB API，但未经 TMDB 认可或认证。用户应自行遵守当前 TMDB API 条款和署名要求。

图书元数据和封面由互联网档案馆项目 [Open Library](https://openlibrary.org/) 提供。Open Library 的内容与 API 可用性受其相应条款和政策约束。

Media Quick Edit 不拥有也不转售这些服务返回的元数据。

## 常见问题

### 左侧栏按钮找不到我的 Base

请在插件设置中选择有效的 `.base` 文件。如果未设置默认 Base，插件会在可行时使用当前打开的 Base。

### 新增条目没有出现在 Base 中

请确认 Base 的筛选条件包含所设置的电影/剧集与图书文件夹。修改筛选条件后，重新打开 Base。

### 大型仓库第一次打开时显示零条目

Obsidian Bases 会先扫描整个仓库，再把筛选后的结果交给自定义视图。如果仓库中有大量生成文件或依赖文件夹，第一次打开时可能暂时显示零条目。请等待扫描完成；如果合适，可以在 Obsidian 的排除文件设置中加入生成目录或归档目录，避免 Bases 反复索引。

### TMDB 搜索失败

使用设置中的 **测试连接** 按钮，并检查 v3 API Key 和网络连接。

### Open Library 搜索超时

Open Library 需要直接访问网络。请稍后重试，或检查当前网络能否访问 `openlibrary.org`。

### 视图仍显示旧版插件

停用后重新启用 Media Quick Edit，再重新打开 Base。

## 开发

```bash
npm install
npm run typecheck
npm test
npm run build
```

运行 `npm run check` 可以执行完整的本地检查流程。自动测试覆盖空仓库启动、中英文可移植路径、旧状态迁移、TMDB Key 缺失、Open Library 超时和历史记录更新等情况。

开发监听模式：

```bash
npm run dev
```

准备本地 Release 文件：

```bash
npm run release:prepare
```

该命令会生成 `release/<版本>/main.js`、`manifest.json` 和 `styles.css`，但不会自动上传。

## 许可证

[MIT](LICENSE)

## 作者

FlyingNeko
