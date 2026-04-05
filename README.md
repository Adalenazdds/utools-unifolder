# UniFolder 📁✨

UniFolder 是一个 uTools 插件：为文件/文件夹添加别名、标签与备注，并按标签快速筛选。

## 功能 ✅

- 🗂️ 条目管理：文件/文件夹的别名、标签、长备注
- 🏷️ 全局标签库：侧栏可新增/删除；删除会级联清理所有条目引用
- 🔎 标签筛选 + uTools 搜索直达：全局标签注册为动态指令，进入后自动按该标签筛选
- 📝 备注体验：空备注直接可编辑；有内容默认预览，点“编辑备注”才解锁；预览支持 URL 点击打开
- 🧠 Mindmap 导出：一键导出当前工作目录的 Markdown 思维导图（XMind 友好），可选“递归深度/备注层级”
- 💾 位置记忆 + 🫥 侧栏隐藏：记住上次根目录/筛选/选中项，布局可折叠

## 使用 🚀

1. 📂 点击“选择工作目录”
2. 🧾 在列表选择文件/文件夹，右侧编辑别名/标签/备注
3. 📤 需要分享时点“导出文件”生成 mindmap `.md`

## 开发（Dev 模式）🛠️

1. 安装 uTools +「uTools 开发者工具」
2. 在开发者工具中“加载本地插件应用”，指向本仓库目录（包含 `plugin.json`）
3. 在 uTools 搜索框输入 `unifolder` 启动

## 数据 💽

- 🗃️ 存储：`utools.dbStorage`（自动迁移旧数据）
- 🧩 Schema（v2）：

```json
{
  "schemaVersion": 2,
  "tagsList": ["tag1"],
  "items": {
    "C:/path/to/item": {
      "alias": "",
      "note": "",
      "tags": ["tag1"],
      "hidden": false
    }
  }
}
```

## 离线说明 📴

- 📦 UI 依赖已本地化：`vendor/vue.global.prod.js`、`vendor/tailwindcss.js`，打开插件不再请求外网 CDN
