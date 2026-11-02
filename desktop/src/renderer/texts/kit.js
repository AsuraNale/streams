// The kit gallery (screens/kit.js, development only: `npm start -- --screen kit`). Sample words, so the gallery shows the
// components as the screens will use them — and so that on Friday the three token sets can be compared on one page.

export const KIT = Object.freeze({
  title: '组件一览',
  subtitle: '外壳里的组件，颜色全部来自 tokens.css。',
  sections: Object.freeze({
    text: '文字',
    buttons: '按钮',
    tags: '标签与提示框',
    states: '五种抓取状态',
    steps: '小方块进度',
    cards: '卡片外框',
    icons: '图标',
  }),
  text: Object.freeze({
    heading: '今天抓到 12 条，过关 3 条',
    title: '关于本地优先的笔记工具的一篇综述',
    body: '库是一个 Markdown 文件夹，文件是真相，索引是生成物。',
    small: '来源：某个博客 · 2026-11-02',
    tiny: '上一轮 · 08:00',
    sub: '对这台电脑上的流息都有效',
    muted: '上次更新：昨天',
    wait: '等你看',
    done: '已收藏',
  }),
  buttons: Object.freeze({ primary: '收藏', secondary: '放弃', icon: '新建来源', disabled: '不可用' }),
  tags: Object.freeze({ wait: '待看 3', done: '已收藏', recommend: '推荐', noticeWait: '有 3 条等你看。', noticePlain: '这一轮没有新内容。' }),
  steps: Object.freeze({ label: '抓取 · 打分 · 入库', names: Object.freeze(['抓取', '打分', '入库']) }),
  card: Object.freeze({ label: '待看的条目', status: '等你看', body: '这是什么：一句话说明这条讲什么。', answered: '已收藏' }),
})
