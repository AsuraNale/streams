'use strict';
// 三套主题的线条图标（24 格，3–21 的可视范围）。路径抄自原型：
// 精密国际主义 = templates/精密国际主义-精修/edition.js + shared/round9/edition.js 的 precision；
// 澄明玻璃、研究对话 = shared/round9/edition.js 的 glass / research。原型没有的几个（等你决定、详情、收起右栏、更多…）
// 照同一套的笔法补画，记在 README「和原型的差别」里。
window.STREAMS_ICONS = (() => {
  const base = {
    plus: 'M12 5v14 M5 12h14',
    arrow: 'M4 12h15 M13 6l6 6-6 6',
    back: 'M20 12H5 M11 6l-6 6 6 6',
    down: 'm6 9 6 6 6-6',
    right: 'm9 6 6 6-6 6',
    close: 'm6 6 12 12 M18 6 6 18',
    check: 'm4 12 5 5L20 6',
    external: 'M13 4h7v7 M20 4l-9 9 M8 5H4v15h15v-4',
    more: 'M4.5 11h2v2h-2z M11 11h2v2h-2z M17.5 11h2v2h-2z',
    panel: 'M3 4h18v16H3z M15 4v16',
    warn: 'M12 3 22 20H2z M12 10v4 M12 17v.01',
    queue: 'M4 6h10 M4 12h10 M4 18h6 M18 9v9 M15 15l3 3 3-3',
    bookmark: 'M6 3h12v18l-6-4-6 4z',
    later: 'M12 7v5l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
    shelf: 'M4 4h4v16H4z M10 4h4v16h-4z M16 5l3.5-1 2 15.5-3.5 1z',
    chat: 'M4 5h16v11H10l-5 4v-4H4z M8 9h8 M8 12h5',
    ask: 'M4 5h16v11H10l-5 4v-4H4z M10 9q0-2 2-2t2 2q0 1.5-2 2v1 M12 14v.01',
    decide: 'M4 5h16v14H4z M8 10l2.5 2.5L16 7 M8 16h8',
    detail: 'M4 4h16v16H4z M12 11v6 M12 7.5v.01',
    leaf: 'M5 3h10l4 4v14H5z M15 3v4h4',
    folder: 'M3 6h7l2 2h9v11H3z',
    gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2'
  };
  const precision = {
    ...base,
    file: 'M5 3h9l5 5v13H5z M14 3v5h5 M8 12h8 M8 16h5',
    book: 'M3 5h6l3 2 3-2h6v14h-6l-3 2-3-2H3z M12 7v14',
    note: 'M4 4h16v12l-4 4H4z M16 20v-4h4 M8 9h8 M8 13h5',
    settings: 'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z M10 9h4l1 2v2l-1 2h-4l-1-2v-2z',
    clock: 'M8 3h8l5 5v8l-5 5H8l-5-5V8z M12 7v6h5',
    search: 'M8 4h6l4 4v6l-4 4H8l-4-4V8z M16 16l5 5',
    send: 'M12 20V4 M6 10l6-6 6 6 M7 20h10',
    spark: 'M12 3l3 6 6 3-6 3-3 6-3-6-6-3 6-3z M12 10v4 M10 12h4',
    progress: 'M3 19h18 M5 15h3V9H5z M11 15h3V5h-3z M17 15h3v-4h-3z',
    files: 'M3 5h7l3 3h8v12H3z M3 11h18',
    sources: 'M7 3h14v14H7z M3 7v14h14 M10 7h8 M10 11h5',
    decide: 'M3 4h18v16H3z M7 10l3 3 7-7 M7 16h10',
    detail: 'M3 3h18v18H3z M12 10v7 M11 7h2',
    chat: 'M3 4h18v12h-9l-5 4v-4H3z M7 8h10 M7 12h6',
    ask: 'M3 4h18v12h-9l-5 4v-4H3z M10 8h4v3h-2v2 M12 14v.01',
    later: 'M8 3h8l5 5v8l-5 5H8l-5-5V8z M12 7v5l3 2',
    shelf: 'M3 3h5v18H3z M10 3h5v18h-5z M17 4l4-1 2 17-4 1z'
  };
  const glass = {
    ...base,
    file: 'M7 3h7l5 5v11q0 2-2 2H7q-2 0-2-2V5q0-2 2-2z M14 3v4q0 1 1 1h4 M8 12h8 M8 16h5',
    book: 'M3 5q5-2 9 2 4-4 9-2v14q-5-2-9 2-4-4-9-2z M12 7v14',
    note: 'M7 4h11q2 0 2 2v9l-5 5H7q-3 0-3-3V7q0-3 3-3z M15 20v-5h5 M8 9h8 M8 12h5',
    clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z M12 7v6l4 2',
    settings: 'M4 7h6m5 0h5 M4 17h10m5 0h1 M15 7a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z M19 17a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z',
    search: 'M18 10.5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z M16 16l5 5',
    send: 'M12 20V4 M6 10l6-6 6 6',
    spark: 'M12 3q1 7 8 9-7 2-8 9-1-7-8-9 7-2 8-9z',
    progress: 'M6 5v14 M6 6h12 M6 12h9 M6 18h6',
    files: 'M3 8V6q0-2 2-2h5l3 3h6q2 0 2 2v9q0 2-2 2H5q-2 0-2-2V8z',
    sources: 'M7 4h12q2 0 2 2v10q0 2-2 2H9q-2 0-2-2z M3 8v11q0 2 2 2h11 M11 9h6 M11 12h4',
    decide: 'M6 4h12q2 0 2 2v12q0 2-2 2H6q-2 0-2-2V6q0-2 2-2z M8 11l3 3 5-6',
    detail: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z M12 11v6 M12 7.5v.01',
    chat: 'M5 5h14q2 0 2 2v7q0 2-2 2h-7l-5 4v-4H5q-2 0-2-2V7q0-2 2-2z M8 10h8',
    ask: 'M5 5h14q2 0 2 2v7q0 2-2 2h-7l-5 4v-4H5q-2 0-2-2V7q0-2 2-2z M10 9q0-2 2-2t2 2q0 1.5-2 2 M12 13.5v.01',
    later: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z M12 7v5l3 2',
    shelf: 'M5 4q1-1 2 0v16q-1 1-2 0z M11 4q1-1 2 0v16q-1 1-2 0z M16.5 5.5q.8-1 1.8-.4l2.5 14.4q-.3 1.3-1.6 1z'
  };
  const research = {
    ...base,
    file: 'M5 3h11l3 3v15H5z M8 3v18 M11 9h5 M11 13h4',
    book: 'M3 5h5q3 0 4 2 1-2 4-2h5v14h-5q-3 0-4 2-1-2-4-2H3z M12 7v14',
    note: 'M4 4h16v12H9l-5 4z M8 8h8 M8 12h5',
    settings: 'M3 7h8m4 0h6 M3 17h3m4 0h11 M11 4h4v6h-4z M6 14h4v6H6z',
    clock: 'M3 11a9 9 0 1 1 2 7 M3 6v5h5 M12 7v6l4 2',
    search: 'M17 10a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0z M15 15l6 6',
    send: 'm3 5 18 7-18 7 3-7z M6 12h14',
    spark: 'M3 4h18v12h-9l-6 5v-5H3z M7 8h10 M7 12h6',
    progress: 'm3 7 2 2 4-4 M12 7h9 M4 14h4v4H4z M12 16h9',
    files: 'M3 6h7l2 2h9v12H3z M3 11h18',
    sources: 'M5 3h10v14l-5-3-5 3z M18 7h2v14H8v-2',
    decide: 'M5 3h10v14l-5-3-5 3z M7.5 8l2 2 3.5-4 M18 7h2v14H8v-2',
    detail: 'M5 3h11l3 3v15H5z M8 3v18 M11 9h5 M11 13h5 M11 17h3',
    chat: 'M4 4h16v12H9l-5 4z M8 8h8 M8 12h5',
    ask: 'M4 4h16v12H9l-5 4z M10.5 8q0-1.5 1.5-1.5t1.5 1.5q0 1.2-1.5 1.8v1 M12 13v.01',
    later: 'M3 11a9 9 0 1 1 2 7 M3 6v5h5 M12 7v5l3 2',
    shelf: 'M3 4h5v16H3z M9 4h5v16H9z M15 5h6v15h-6z M3 8h5 M9 16h5 M15 9h6'
  };
  return { precision, glass, research };
})();
