// 可编辑的主题、布局名称、图标、边框与标签配色。
const TAG_PALETTE = ['#f28b82', '#fbbc04', '#fff475', '#ccff90', '#a7ffeb', '#cbf0f8', '#aecbfa', '#d7aefb', '#fdcfe8', '#a0d2db', '#e8c547', '#c9a0dc'];
// 本模块职责与加载顺序见 docs/架构与配置.md；共享编辑状态在 core/ 中声明。
// 获取关联线的默认样式常量
const ASSOC_LINE_DASH_OPTIONS = [
    { value: '6,4', label: '虚线' },
    { value: 'none', label: '实线' },
    { value: '2,2', label: '点线' },
];
// 风格主题不再只换颜色：连线形态、节点边框、圆角、字号、间距都由这里配置。
const THEMES = [
    { key: 'rainbow', label: '彩虹弧线', description: '多彩曲线 · 分支同色系', badge: '推荐' },
    { key: 'colorfulBubble', label: '缤纷气泡', description: '彩色胶囊 · 柔和底色' },
    { key: 'organic', label: '灵动弧线', description: '舒展曲线 · 线条分支' },
    { key: 'bubble', label: '柔和气泡', description: '平滑弧线 · 胶囊节点' },
    { key: 'minimal', label: '极简曲线', description: '轻盈细线 · 留白排版' },
    { key: 'cards', label: '圆角卡片', description: '圆角折线 · 层级卡片' },
];

// 按主分支顺序循环取色；line 为连线/主节点底色，surface 为子节点浅底色，text 为深色文字。
// 想增加色系，复制一项即可；子孙节点自动继承所属主分支，不会把主题颜色写死到文档中。
const BRANCH_PALETTE = [
    { line: '#397bd5', surface: '#eaf2ff', text: '#24559a' },
    { line: '#209583', surface: '#e5f5ef', text: '#176a5d' },
    { line: '#d98226', surface: '#fff2e2', text: '#915217' },
    { line: '#8d65c5', surface: '#f2ebfb', text: '#67429a' },
    { line: '#d25b87', surface: '#fcebf2', text: '#9e3d62' },
    { line: '#389aaf', surface: '#e7f5f9', text: '#24697a' },
];

// 预览和画布共用配色规则。主分支填实色；普通子节点使用同色文字，可选浅色背景。
function getBranchNodeStyle(theme, index, mainBranch) {
    const palette = theme.branchPalette || [];
    if (!palette.length || index < 0) return {};
    const color = palette[index % palette.length];
    return mainBranch
        ? { fillColor: color.line, borderColor: color.line, color: theme.branchMainTextColor }
        : { fillColor: theme.branchNodeFill ? color.surface : 'transparent', borderColor: color.line, color: color.text };
}

function getRainbowLinesConfig(theme) {
    const colorsList = (theme.branchPalette || []).map(color => color.line);
    return { open: colorsList.length > 0, colorsList };
}

// 每个预设提供完整的基础样式，避免来回切换时残留上一个主题的参数。
function makeVisualTheme(options) {
    const nodeStyle = {
        shape: 'rectangle', fontFamily: '微软雅黑, Microsoft YaHei',
        fontSize: 14, fontWeight: 'normal', fontStyle: 'normal',
        fillColor: 'transparent', color: options.text,
        borderColor: 'transparent', borderWidth: 0, borderDasharray: 'none',
        borderRadius: 0, textDecoration: 'none', paddingX: 14, paddingY: 7,
        marginX: 54, marginY: 14, textAlign: 'left',
    };
    return {
        // 非彩色主题明确清空这些参数，避免切换后继承上一个主题的色系。
        branchPalette: options.branchPalette || [],
        branchMainTextColor: '#ffffff', branchNodeFill: !!options.branchNodeFill,
        backgroundColor: options.background,
        lineStyle: options.lineStyle || 'curve', // curve 是贝塞尔曲线，straight 配合 lineRadius 使用圆角
        lineRadius: options.lineRadius || 0,
        lineColor: options.accent, lineWidth: options.lineWidth,
        lineDasharray: 'none', nodeUseLineStyle: options.underline,
        rootLineKeepSameInCurve: options.uniformCurve,
        rootLineStartPositionKeepSameInCurve: true,
        generalizationLineColor: options.accent, generalizationLineWidth: options.lineWidth,
        root: { ...nodeStyle, fontSize: 21, fontWeight: 'bold', fillColor: options.accent,
            color: '#ffffff', borderRadius: options.radius, paddingX: 25, paddingY: 14, ...options.root },
        second: { ...nodeStyle, fontSize: 16, fontWeight: 'bold', marginX: 90, marginY: 28,
            borderRadius: options.radius, ...options.second },
        node: { ...nodeStyle, borderRadius: options.radius, ...options.node },
        generalization: { ...nodeStyle, fillColor: options.surface, borderRadius: options.radius,
            borderColor: options.accent, borderWidth: 1 },
    };
}

const THEME_CONFIGS = {
    rainbow: makeVisualTheme({
        accent: '#34445f', text: '#35445b', background: '#fcfdff', surface: '#edf2f9',
        branchPalette: BRANCH_PALETTE, branchNodeFill: true,
        lineWidth: 2.8, radius: 10, underline: false, uniformCurve: false,
        second: { paddingX: 23, paddingY: 12, marginY: 32 },
        node: { borderWidth: 0, paddingX: 16, paddingY: 9, marginX: 62, marginY: 17 },
    }),
    colorfulBubble: makeVisualTheme({
        accent: '#34445f', text: '#35445b', background: '#fffdfb', surface: '#f2f4f8',
        branchPalette: BRANCH_PALETTE, branchNodeFill: true,
        lineWidth: 2.2, radius: 25, underline: false, uniformCurve: true,
        root: { borderRadius: 30, paddingX: 30 },
        second: { borderWidth: 1, paddingX: 24, paddingY: 12 },
        node: { borderWidth: 1, paddingX: 19, paddingY: 10 },
    }),
    organic: makeVisualTheme({
        accent: '#388477', text: '#354c49', background: '#fafcfb', surface: '#eaf4f0',
        lineWidth: 2.2, radius: 12, underline: true, uniformCurve: false,
        second: { color: '#286b60', paddingY: 9, marginY: 32 },
        node: { marginX: 58, marginY: 16 },
    }),
    bubble: makeVisualTheme({
        accent: '#7962b4', text: '#51466c', background: '#fcfaff', surface: '#f1ebfb',
        lineWidth: 2, radius: 24, underline: false, uniformCurve: true,
        root: { borderRadius: 28, paddingX: 30 },
        second: { fillColor: '#eee7fa', borderColor: '#c9bae6', borderWidth: 1, paddingX: 22, paddingY: 11 },
        node: { fillColor: '#ffffff', borderColor: '#ded4ed', borderWidth: 1, paddingX: 18, paddingY: 9 },
    }),
    minimal: makeVisualTheme({
        accent: '#596577', text: '#475569', background: '#ffffff', surface: '#f5f7fa',
        lineWidth: 1, radius: 0, underline: true, uniformCurve: true,
        root: { fillColor: 'transparent', color: '#243044', fontSize: 23, paddingX: 16, paddingY: 10 },
        second: { fontSize: 15, fontWeight: 'normal', marginX: 110, marginY: 36 },
        node: { fontSize: 13, marginX: 64, marginY: 20 },
    }),
    cards: makeVisualTheme({
        accent: '#4279b4', text: '#334d68', background: '#f5f8fc', surface: '#eaf1fa',
        lineStyle: 'straight', lineRadius: 18, lineWidth: 1.8,
        radius: 8, underline: false, uniformCurve: true,
        second: { fillColor: '#e6effb', borderColor: '#a8c3e5', borderWidth: 1, paddingX: 20, paddingY: 12 },
        node: { fillColor: '#ffffff', borderColor: '#cad8e9', borderWidth: 1, paddingX: 18, paddingY: 10 },
    }),
};

// 旧版仅换色主题不再出现在选择器中。读取旧文档时映射到新风格，不批量改写磁盘文件。
const LEGACY_THEME_ALIASES = {
    default: 'organic', classic: 'organic', green: 'organic', warm: 'organic',
    pink: 'bubble', purple: 'bubble', minions: 'bubble',
    dark: 'minimal', simple: 'minimal',
    blue: 'cards', light: 'cards', snow: 'cards',
};
function resolveThemeKey(key) {
    if (Object.hasOwn(THEME_CONFIGS, key)) return key;
    return Object.hasOwn(LEGACY_THEME_ALIASES, key) ? LEGACY_THEME_ALIASES[key] : 'organic';
}

const LAYOUT_LABELS = {
    logicalStructure: '逻辑结构图',
    logicalStructureLeft: '逻辑结构图(左)',
    mindMap: '思维导图',
    organizationStructure: '组织结构图',
    catalogOrganization: '目录组织图',
    timeline: '时间轴',
    timeline2: '交替时间轴',
    verticalTimeline: '垂直时间轴',
    fishbone: '鱼骨图',
    fishbone2: '鱼骨图2',
};

const BORDER_STYLES = [
    { value: 'solid', label: '实线' },
    { value: 'dashed', label: '虚线' },
    { value: 'dotted', label: '点线' },
];

// ============ Icons Data ============
const ICONS_DATA = {
    priority: [
        { name: '优先级1', icon: '⬆️' },
        { name: '优先级2', icon: '🔼' },
        { name: '优先级3', icon: '🔽' },
        { name: '优先级4', icon: '⬇️' },
    ],
    progress: [
        { name: '未开始', icon: '⭕' },
        { name: '进行中', icon: '🔄' },
        { name: '已完成', icon: '✅' },
        { name: '暂停', icon: '⏸️' },
        { name: '取消', icon: '❌' },
    ],
    icon: [
        { name: '星星', icon: '⭐' },
        { name: '心', icon: '❤️' },
        { name: '问号', icon: '❓' },
        { name: '感叹号', icon: '❗' },
        { name: '灯泡', icon: '💡' },
        { name: '提示', icon: '💡' },
        { name: '时钟', icon: '⏰' },
        { name: '日历', icon: '📅' },
        { name: '重要', icon: '🔴' },
        { name: '想法', icon: '💭' },
    ],
};

