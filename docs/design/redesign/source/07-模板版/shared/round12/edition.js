'use strict';
// 单线黑白 · 第十二轮. The fourth theme, drawn in the grammar of the 云织 / 流息 marks: every icon sits on the
// renderer's 24-unit box, 2 units of stroke, flat ends, sharp joins, and only 0 / 90 / 45 degrees.
(() => {
  const icons = {
    plus: 'M12 4v16 M4 12h16',
    arrow: 'M3 12h16 M13 6l6 6-6 6',
    back: 'M21 12H5 M11 6l-6 6 6 6',
    down: 'M5 9l7 7 7-7',
    close: 'M5 5l14 14 M19 5 5 19',
    check: 'M4 12l5 5L20 6',
    stop: 'M6 6h12v12H6z',
    home: 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z',
    book: 'M3 5h7l2 2 2-2h7v14h-7l-2 2-2-2H3z M12 7v14',
    clock: 'M8 3h8l5 5v8l-5 5H8l-5-5V8z M12 7v5l4 4',
    settings: 'M3 7h9 M16 7h5 M3 17h4 M11 17h10 M12 4h4v6h-4z M7 14h4v6H7z',
    file: 'M5 3h10l4 4v14H5z M9 12h6 M9 16h6',
    note: 'M4 4h16v12h-9l-5 5v-5H4z M8 9h8 M8 12h5',
    search: 'M7 4h6l3 3v6l-3 3H7l-3-3V7z M15 15l6 6',
    clip: 'M7 9v8l3 3h4l3-3V6l-2-2h-2l-2 2v9l1 1h1',
    send: 'M12 20V5 M5 12l7-7 7 7',
    download: 'M12 3v12 M6 9l6 6 6-6 M4 20h16',
    spark: 'M12 3l9 9-9 9-9-9z M12 9l3 3-3 3-3-3z',
    external: 'M13 4h7v7 M20 4 10 14 M10 6H4v14h14v-6',
    progress: 'M3 6h6l6 6h6 M3 12h12 M3 18h6l6-6',
    sources: 'M8 3h12v14H8z M4 7v14h12 M11 8h6 M11 12h4',
    files: 'M3 5h7l3 3h8v11H3z',
    draft: 'M4 20h4L20 8l-4-4L4 16z M13 7l4 4'
  };
  const row = ['line12', '单线黑白 · 第十二轮', '单线黑白-第十二轮'];
  const base = window.yunzhiRound9Edition('precision9');
  const listed = window.yunzhiRound11Edition('precision11').choices;
  window.yunzhiVisualEdition = {
    ...base,
    choices: listed.some(choice => choice[0] === row[0]) ? listed : [...listed, row],
    theme: row,
    caption: '按新 logo 的画法 · 本地示例',
    icons,
    controlArt: {}, // kept (empty): the renderer skips its accessibility pass and the phase dots when this is missing
    sidebarIcons: undefined
  };
})();
