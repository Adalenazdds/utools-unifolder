// preload.js
const fs = require('fs');
const path = require('path');

const TAG_FEATURE_PREFIX = 'unifolder_tag__';

const toBase64Url = (text) => {
    return Buffer.from(String(text), 'utf8')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
};

const fromBase64Url = (b64url) => {
    const padded = String(b64url).replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(padded, 'base64').toString('utf8');
};

const getTagFromFeatureCode = (code) => {
    if (typeof code !== 'string') return null;
    if (!code.startsWith(TAG_FEATURE_PREFIX)) return null;
    const encoded = code.slice(TAG_FEATURE_PREFIX.length);
    if (!encoded) return null;
    try {
        const tag = fromBase64Url(encoded);
        const trimmed = typeof tag === 'string' ? tag.trim() : '';
        return trimmed || null;
    } catch (e) {
        return null;
    }
};

const toTagFeatureCode = (tag) => TAG_FEATURE_PREFIX + toBase64Url(tag);

let lastEnterAction = null;

// 捕获进入事件：用于“搜索框直接搜标签 -> 进入插件后自动筛选”
if (window.utools && typeof window.utools.onPluginEnter === 'function') {
    window.utools.onPluginEnter((action) => {
        lastEnterAction = action;
        try {
            window.dispatchEvent(new CustomEvent('unifolder:plugin-enter', { detail: action }));
        } catch (e) {}
    });
}

const normalizeData = (raw) => {
    const empty = { schemaVersion: 2, tagsList: [], items: {} };
    if (!raw || typeof raw !== 'object') return empty;

    const looksLikeNewSchema =
        raw.items && typeof raw.items === 'object' && !Array.isArray(raw.items);

    const itemsIn = looksLikeNewSchema ? raw.items : raw;
    const tagsListIn = looksLikeNewSchema && Array.isArray(raw.tagsList) ? raw.tagsList : [];

    const tagSet = new Set();
    for (const t of tagsListIn) {
        if (typeof t !== 'string') continue;
        const tt = t.trim();
        if (tt) tagSet.add(tt);
    }

    const itemsOut = {};
    if (itemsIn && typeof itemsIn === 'object') {
        for (const [itemPath, item] of Object.entries(itemsIn)) {
            if (!item || typeof item !== 'object') continue;
            const tagsRaw = Array.isArray(item.tags) ? item.tags : [];
            const tagsClean = [];
            const seen = new Set();
            for (const t of tagsRaw) {
                if (typeof t !== 'string') continue;
                const tt = t.trim();
                if (!tt || seen.has(tt)) continue;
                seen.add(tt);
                tagsClean.push(tt);
                tagSet.add(tt);
            }

            itemsOut[itemPath] = {
                alias: typeof item.alias === 'string' ? item.alias : '',
                note: typeof item.note === 'string' ? item.note : '',
                tags: tagsClean,
                hidden: !!item.hidden
            };
        }
    }

    const tagsListOut = Array.from(tagSet).sort((a, b) => a.localeCompare(b, 'zh-CN'));
    return { schemaVersion: 2, tagsList: tagsListOut, items: itemsOut };
};

const pad2 = (n) => String(n).padStart(2, '0');
const formatDate = (ms) => {
    if (!ms || Number.isNaN(Number(ms))) return '';
    const d = new Date(ms);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const formatBytes = (bytes) => {
    const b = Number(bytes);
    if (!Number.isFinite(b) || b < 0) return '';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let v = b;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) {
        v /= 1024;
        i += 1;
    }
    const fixed = v >= 100 || i === 0 ? 0 : v >= 10 ? 1 : 2;
    return `${v.toFixed(fixed)} ${units[i]}`;
};

const toSingleLine = (text) => {
    return String(text == null ? '' : text)
        .replace(/\r\n|\r|\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

const splitLines = (text) => {
    const raw = String(text == null ? '' : text);
    return raw
        .split(/\r\n|\r|\n/)
        .map(s => s.trim())
        .filter(Boolean);
};

// 生成 XMind 友好的 Markdown（纯 Markdown 层级列表；不使用 <br>）
const buildMindmapMarkdown = (rootPath, store, options) => {
    const root = typeof rootPath === 'string' ? rootPath.trim() : '';
    if (!root) return '';
    if (!fs.existsSync(root)) return '';

    const opt = options && typeof options === 'object' ? options : {};
    const maxDepth = Number.isFinite(Number(opt.maxDepth)) ? Number(opt.maxDepth) : 999;
    // -1: 不包含备注；0: 仅顶层；>=1: 对应深度
    const noteMaxDepth = Number.isFinite(Number(opt.noteMaxDepth)) ? Number(opt.noteMaxDepth) : 999;

    const items = store && typeof store === 'object' && store.items && typeof store.items === 'object' ? store.items : {};

    const getMeta = (p) => {
        const it = items && items[p] ? items[p] : null;
        const tags = it && Array.isArray(it.tags) ? it.tags.filter(t => typeof t === 'string' && t.trim()).map(t => t.trim()) : [];
        const note = it && typeof it.note === 'string' ? it.note : '';
        const hidden = !!(it && it.hidden);
        return { tags, note, hidden };
    };

    const walk = (p, depth) => {
        let stat;
        try { stat = fs.statSync(p); } catch (e) { return null; }

        const isDir = stat.isDirectory();
        const name = path.basename(p) || p;
        const createdMs = stat.birthtimeMs || stat.ctimeMs || 0;
        const meta = getMeta(p);
        if (meta.hidden) return null;

        let children = [];
        let sizeBytes = isDir ? 0 : Number(stat.size) || 0;

        if (isDir && depth < maxDepth) {
            try {
                const entries = fs.readdirSync(p, { withFileTypes: true });
                for (const ent of entries) {
                    if (!ent) continue;
                    if (ent.isSymbolicLink && ent.isSymbolicLink()) continue;
                    if (!ent.isDirectory() && !ent.isFile()) continue;
                    const childPath = path.join(p, ent.name);
                    const child = walk(childPath, depth + 1);
                    if (!child) continue;
                    children.push(child);
                    sizeBytes += Number(child.sizeBytes) || 0;
                }
            } catch (e) {}
        }

        children.sort((a, b) => {
            if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
            return String(a.name).localeCompare(String(b.name), 'zh-CN');
        });

        return {
            name,
            path: p,
            isDir,
            depth,
            createdMs,
            sizeBytes,
            tags: meta.tags,
            note: meta.note,
            children
        };
    };

    const rootNode = walk(root, 0);
    if (!rootNode) return '';

    const lines = [];
    lines.push('# UniFolder Mindmap');
    lines.push('');

    const emit = (node, depth) => {
        const indent = '  '.repeat(depth);
        const icon = node.isDir ? '📁' : '📄';
        const name = toSingleLine(node.name) || '(未命名)';
        lines.push(`${indent}- ${icon} ${name}`);

        const metaIndent = '  '.repeat(depth + 1);
        const created = formatDate(node.createdMs) || '未知';
        const size = formatBytes(node.sizeBytes) || '未知';
        const tags = node.tags && node.tags.length ? node.tags.join(', ') : '无';
        lines.push(`${metaIndent}- 创建时间：${created}`);
        lines.push(`${metaIndent}- 大小：${size}`);
        lines.push(`${metaIndent}- 标签：${toSingleLine(tags) || '无'}`);

        if (noteMaxDepth >= 0 && (Number(node.depth) || 0) <= noteMaxDepth) {
            const noteRaw = typeof node.note === 'string' ? node.note : '';
            const noteLines = splitLines(noteRaw);
            if (noteLines.length === 0) {
                lines.push(`${metaIndent}- 备注：无`);
            } else if (noteLines.length === 1) {
                lines.push(`${metaIndent}- 备注：${toSingleLine(noteLines[0])}`);
            } else {
                lines.push(`${metaIndent}- 备注：`);
                const noteIndent = '  '.repeat(depth + 2);
                for (const line of noteLines) {
                    lines.push(`${noteIndent}- ${toSingleLine(line)}`);
                }
            }
        }

        for (const child of node.children || []) {
            emit(child, depth + 1);
        }
    };

    emit(rootNode, 0);
    lines.push('');
    lines.push('> 使用提示：XMind 支持导入该 Markdown 生成思维导图。');
    return lines.join('\n');
};

window.api = {
    // 检查路径是否有效
    isValidPath: (p) => {
        try { return fs.existsSync(p); } catch(e) { return false; }
    },

    // 使用 uTools 原生存储读取数据
    loadData: () => {
        const raw = window.utools.dbStorage.getItem('unifolder_data') || {};
        const normalized = normalizeData(raw);

        const isAlreadyNewSchema =
            raw && typeof raw === 'object' && raw.items && typeof raw.items === 'object' && !Array.isArray(raw.items);

        // 发现旧 schema 或脏数据时，自动迁移并写回
        if (!isAlreadyNewSchema) {
            window.utools.dbStorage.setItem('unifolder_data', normalized);
        }
        return normalized;
    },

    // UI 状态：用于恢复上次关闭时的位置（根目录/筛选/当前选中项）
    loadUIState: () => {
        const raw = window.utools.dbStorage.getItem('unifolder_ui_state') || {};
        if (!raw || typeof raw !== 'object') return {};
        return {
            currentRoot: typeof raw.currentRoot === 'string' ? raw.currentRoot : '',
            currentTagFilter: typeof raw.currentTagFilter === 'string' ? raw.currentTagFilter : null,
            lastSelectedPath: typeof raw.lastSelectedPath === 'string' ? raw.lastSelectedPath : '',
            sidebarHidden: !!raw.sidebarHidden
        };
    },

    saveUIState: (state) => {
        const s = state && typeof state === 'object' ? state : {};
        const out = {
            currentRoot: typeof s.currentRoot === 'string' ? s.currentRoot : '',
            currentTagFilter: typeof s.currentTagFilter === 'string' ? s.currentTagFilter : null,
            lastSelectedPath: typeof s.lastSelectedPath === 'string' ? s.lastSelectedPath : '',
            sidebarHidden: !!s.sidebarHidden
        };
        window.utools.dbStorage.setItem('unifolder_ui_state', out);
        return true;
    },

    // 动态指令：让标签可在 uTools 搜索框直接搜索
    syncTagFeatures: (tagsList) => {
        if (!window.utools) return false;
        if (typeof window.utools.getFeatures !== 'function' || typeof window.utools.setFeature !== 'function') return false;

        const tags = Array.isArray(tagsList) ? tagsList : [];
        const normalizedTags = tags
            .filter(t => typeof t === 'string')
            .map(t => t.trim())
            .filter(Boolean);

        const desiredSet = new Set(normalizedTags);

        // 1) 读取现有动态指令中属于本插件标签的部分
        const existing = window.utools.getFeatures() || [];
        const existingTagFeatures = existing.filter(f => f && typeof f.code === 'string' && f.code.startsWith(TAG_FEATURE_PREFIX));
        const existingMap = new Map();
        for (const f of existingTagFeatures) {
            const tag = getTagFromFeatureCode(f.code);
            if (tag) existingMap.set(tag, f.code);
        }

        // 2) 删除不再存在的标签指令
        if (typeof window.utools.removeFeature === 'function') {
            for (const [tag, code] of existingMap.entries()) {
                if (!desiredSet.has(tag)) {
                    try { window.utools.removeFeature(code); } catch (e) {}
                }
            }
        }

        // 3) 补齐缺失的标签指令
        for (const tag of desiredSet.values()) {
            if (existingMap.has(tag)) continue;
            const code = toTagFeatureCode(tag);
            const cmds = Array.from(new Set([tag, tag.startsWith('#') ? null : `#${tag}`].filter(Boolean)));
            try {
                window.utools.setFeature({
                    code,
                    explain: `筛选标签：${tag}`,
                    cmds
                });
            } catch (e) {}
        }

        return true;
    },

    getTagFromFeatureCode: (code) => getTagFromFeatureCode(code),

    consumeLastEnterAction: () => {
        const a = lastEnterAction;
        lastEnterAction = null;
        return a;
    },
    
    // 使用 uTools 原生存储保存数据
    saveData: (data) => {
        const normalized = normalizeData(data);
        window.utools.dbStorage.setItem('unifolder_data', normalized);
        return true;
    },

    // 暴露给前端：用于导入数据的 normalize/迁移
    normalizeData: (data) => normalizeData(data),

    // 扫描目录（同级文件夹 + 文件）
    scanSubfolders: (rootPath) => {
        if (!fs.existsSync(rootPath)) return [];
        const result = [];
        try {
            const files = fs.readdirSync(rootPath, { withFileTypes: true });
            for (const file of files) {
                if (!file.isDirectory() && !file.isFile()) continue;

                const fullPath = path.join(rootPath, file.name);
                const stat = fs.statSync(fullPath);
                const date = new Date(stat.mtimeMs);
                const timeStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;

                result.push({
                    name: file.name,
                    path: fullPath,
                    mtime_str: timeStr,
                    isDir: file.isDirectory()
                });
            }
        } catch(e) {}
        return result;
    },

    // 调起对话框（选择文件夹）
    openDirectoryPicker: () => {
        const paths = window.utools.showOpenDialog({ properties: ['openDirectory'] });
        return paths ? paths[0] : null;
    },

    // 导出数据：调起保存弹窗并写入本地
    exportData: (data) => {
        const savePath = window.utools.showSaveDialog({
            title: '保存 UniFolder 备份',
            defaultPath: 'UniFolder_Backup.json',
            filters: [{ name: 'JSON', extensions: ['json'] }]
        });
        if (savePath) {
            fs.writeFileSync(savePath, JSON.stringify(data, null, 2), 'utf-8');
            return true;
        }
        return false;
    },

    // Mindmap：生成 Markdown（Markmap 友好）
    buildMindmapMarkdown: (rootPath, store, options) => {
        try {
            return buildMindmapMarkdown(rootPath, store, options);
        } catch (e) {
            return '';
        }
    },


    // 保存文本文件
    saveTextAsFile: (defaultName, content) => {
        const name = typeof defaultName === 'string' && defaultName.trim() ? defaultName.trim() : 'UniFolder_Mindmap.md';
        const text = typeof content === 'string' ? content : '';
        const savePath = window.utools.showSaveDialog({
            title: '导出 UniFolder Mindmap',
            defaultPath: name,
            filters: [{ name: 'Markdown', extensions: ['md'] }]
        });
        if (!savePath) return null;
        try {
            fs.writeFileSync(savePath, text, 'utf-8');
            return savePath;
        } catch (e) {
            return null;
        }
    },

    // 复制到剪贴板
    copyText: (text) => {
        const t = typeof text === 'string' ? text : '';
        if (!t) return false;
        try {
            if (window.utools && typeof window.utools.copyText === 'function') {
                window.utools.copyText(t);
                return true;
            }
        } catch (e) {}
        return false;
    },

    // 导入数据：调起选择文件弹窗并读取内容
    importData: () => {
        const openPath = window.utools.showOpenDialog({
            title: '导入 UniFolder 备份',
            filters: [{ name: 'JSON', extensions: ['json'] }],
            properties: ['openFile']
        });
        if (openPath && openPath.length > 0) {
            try {
                const content = fs.readFileSync(openPath[0], 'utf-8');
                return JSON.parse(content);
            } catch (e) {
                window.utools.showNotification('导入失败：文件格式错误或已损坏');
                return null;
            }
        }
        return null;
    },

    // 原生交互 API
    openInExplorer: (folderPath) => { window.utools.shellOpenItem(folderPath); },
    openExternal: (url) => {
        if (!window.utools) return false;
        let u = typeof url === 'string' ? url.trim() : '';
        if (!u) return false;

        // 仅允许 http(s)
        if (!/^https?:\/\//i.test(u)) {
            if (/^www\./i.test(u)) u = `https://${u}`;
        }
        if (!/^https?:\/\//i.test(u)) return false;

        try {
            if (typeof window.utools.shellOpenExternal === 'function') {
                window.utools.shellOpenExternal(u);
                return true;
            }
        } catch (e) {}

        // 兜底：部分环境下可能也能打开 url
        try {
            window.utools.shellOpenItem(u);
            return true;
        } catch (e) {
            return false;
        }
    },
    showNotification: (msg) => { window.utools.showNotification(msg); }
}