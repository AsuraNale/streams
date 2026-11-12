'use strict';

// The shared renderer uses a 24-unit viewBox for every icon. Keep the paths
// inside the same 3–21 optical bounds, including small status glyphs.
window.yunzhiVisualEdition = {
  theme: ['precision-detail', '精密国际主义 · 精修', '精密国际主义-精修'],
  caption: '精密国际主义 · 本地示例',
  icons: {
    weave: 'M3 14 10 7l5 5 6-6 M3 20l7-7 5 5 6-6 M4 7l4-4',
    file: 'M5 3h9l5 5v13H5z M14 3v5h5 M8 12h8 M8 16h5',
    book: 'M3 5h6l3 2 3-2h6v14h-6l-3 2-3-2H3z M12 7v14',
    note: 'M4 4h16v12l-4 4H4z M16 20v-4h4 M8 9h8 M8 13h5',
    home: 'M3 11l9-8 9 8 M5 10v10h5v-6h4v6h5V10',
    settings: 'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z M10 9h4l1 2v2l-1 2h-4l-1-2v-2z',
    clock: 'M8 3h8l5 5v8l-5 5H8l-5-5V8z M12 7v6h5',
    search: 'M8 4h6l4 4v6l-4 4H8l-4-4V8z M16 16l5 5',
    clip: 'M8 13l7-7h3l1 1v3L9 20H6l-2-2v-4L15 3 M7 15v2h2l7-7',
    plus: 'M12 4v16 M4 12h16',
    arrow: 'M3 12h17 M14 6l6 6-6 6',
    back: 'M21 12H4 M10 6l-6 6 6 6',
    down: 'M6 9l6 6 6-6',
    send: 'M12 20V4 M6 10l6-6 6 6 M7 20h10',
    check: 'M4 12l5 5L20 6',
    close: 'M5 5l14 14 M19 5 5 19',
    download: 'M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5',
    stop: 'M5 5h14v14H5z',
    spark: 'M12 3l3 6 6 3-6 3-3 6-3-6-6-3 6-3z M12 10v4 M10 12h4',
    external: 'M13 4h7v7 M20 4 10 14 M9 5H4v15h15v-5'
  }
};
