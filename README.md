# Tick-ZZC · A股季节性周期选股看板

面向 A 股**季节性/周期性板块**的纯前端选股与回测可视化工具，支持一键部署至 **GitHub Pages**，内置 2019 年至今前复权历史日线静态底座，并结合盘中免费实时行情与浏览器 **IndexedDB** 持久化。

## 技术栈

- **构建与框架**：Vite 8 (Rolldown) + Vue 3 + TypeScript + Pinia
- **UI 组件库**：OpenTiny TinyVue 3 (`@opentiny/vue`)
- **图表引擎**：ECharts 6
- **本地存储**：IndexedDB (`idb`) + 仓库静态 JSON (`public/data/`)
- **免费行情源**：东方财富前复权日线（抓取脚本 + 前端 JSONP 在线加股）+ 腾讯财经实时行情（动态 `<script>` 天然无跨域）

## 核心功能

1. **周期雷达（首页）**：全年 12 个月板块轮动日历，自动识别当前月份处于**低谷潜伏区** / **临近潜伏窗** / **高峰兑现区**的板块，并计算近 1 年价格分位与历史窗口回测均值/胜率。
2. **历年周期走势**：按自然年（1月起）或跨年周期（如体育 12 月起、冰雪 7 月起）横向叠加每一年走势，叠画**历年均值曲线**、**25%~75% 波动带**、**低吸/高抛色带**，配**月度涨跌幅热力图**与各月胜率统计。
3. **多股横向对比**：支持板块内多股同屏对比或跨板块等权指数对比，起点归零归一化，支持叠加上证指数基准，输出区间累计涨幅、最大涨幅、最大回撤与近 1 年分位排行。
4. **板块与数据管理**：支持输入任意 6 位 A 股代码在线抓取前复权日线存入 IndexedDB，自定义板块与低吸/高抛观察笔记，支持导出/导入 `sectors.json`。

## 本地运行与数据更新

```bash
# 安装依赖（需要 Node >= 20.19 或 >= 22.12）
pnpm install

# 手动刷新仓库内历史前复权日线（2019年至今）
pnpm fetch-data

# 启动开发服务器
pnpm dev

# 类型检查 + 生产构建（输出到 dist/，base 为 /tick-zzc/）
pnpm build
```

## GitHub Pages 自动部署与定时更新

仓库已内置两条 GitHub Actions 工作流：

- `.github/workflows/deploy.yml`：推送 `main` 分支后自动构建并发布到 GitHub Pages。
- `.github/workflows/sync-stock-data.yml`：每个工作日北京时间 16:10 自动执行 `node scripts/fetch-stocks.mjs`，提交最新收盘日线回仓库并自动触发重新部署。

首次启用只需在 GitHub 仓库完成两步设置：
1. **Settings -> Pages -> Build and deployment -> Source** 选择 **GitHub Actions**。
2. **Settings -> Actions -> General -> Workflow permissions** 勾选 **Read and write permissions**。

> 免责声明：本项目历史数据与季节性规律统计仅作研究与量化学习参考，不构成任何投资建议。
