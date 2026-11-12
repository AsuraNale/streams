'use strict';

(() => {
  const choices = [
    ['glass9', '澄明玻璃 · 第九轮', '澄明玻璃-第九轮'],
    ['precision9', '精密国际主义 · 第九轮', '精密国际主义-第九轮'],
    ['research9', '研究对话 · 第九轮', '研究对话-第九轮']
  ];
  const navigation = {
    weave: 'M3 14 10 7l5 5 6-6 M3 20l7-7 5 5 6-6 M4 7l4-4',
    plus: 'M12 5v14 M5 12h14',
    arrow: 'M4 12h15 M13 6l6 6-6 6',
    back: 'M20 12H5 M11 6l-6 6 6 6',
    down: 'm6 9 6 6 6-6',
    close: 'm6 6 12 12 M18 6 6 18',
    check: 'm4 12 5 5L20 6',
    stop: 'M6 6h12v12H6z',
    external: 'M13 4h7v7 M20 4l-9 9 M8 5H4v15h15v-4'
  };
  const glass = {
    ...navigation,
    file: 'M7 3h7l5 5v11q0 2-2 2H7q-2 0-2-2V5q0-2 2-2z M14 3v4q0 1 1 1h4 M8 12h8 M8 16h5',
    book: 'M3 5q5-2 9 2 4-4 9-2v14q-5-2-9 2-4-4-9-2z M12 7v14',
    note: 'M7 4h11q2 0 2 2v9l-5 5H7q-3 0-3-3V7q0-3 3-3z M15 20v-5h5 M8 9h8 M8 12h5',
    home: 'M3 11l7-7q2-2 4 0l7 7 M5 10v8q0 2 2 2h3v-6h4v6h3q2 0 2-2v-8',
    clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z M12 7v6l4 2',
    settings: 'M4 7h6m5 0h5 M4 17h10m5 0h1 M15 7a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z M19 17a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z',
    search: 'M18 10.5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z M16 16l5 5',
    clip: 'm8 13 7-7q2-2 4 0t0 4L9 20q-3 3-5 0t0-5L15 4',
    send: 'M12 20V4 M6 10l6-6 6 6',
    download: 'M12 3v12m-5-5 5 5 5-5 M4 16v3q0 2 2 2h12q2 0 2-2v-3',
    spark: 'M12 3q1 7 8 9-7 2-8 9-1-7-8-9 7-2 8-9z',
    progress: 'M6 5v14 M6 6h12 M6 12h9 M6 18h6',
    sources: 'M7 4h12q2 0 2 2v10q0 2-2 2H9q-2 0-2-2z M3 8v11q0 2 2 2h11 M11 9h6 M11 12h4',
    files: 'M3 8V6q0-2 2-2h5l3 3h6q2 0 2 2v9q0 2-2 2H5q-2 0-2-2V8z',
    draft: 'M5 4h11l3 3v13H5z M9 9h6 M9 13h6 M9 16h4'
  };
  const research = {
    ...navigation,
    file: 'M5 3h11l3 3v15H5z M8 3v18 M11 9h5 M11 13h4',
    book: 'M3 5h5q3 0 4 2 1-2 4-2h5v14h-5q-3 0-4 2-1-2-4-2H3z M12 7v14',
    note: 'M4 4h16v12H9l-5 4z M8 8h8 M8 12h5',
    home: 'm3 11 9-7 9 7 M5 10v10h5v-6h4v6h5V10',
    settings: 'M3 7h8m4 0h6 M3 17h3m4 0h11 M11 4h4v6h-4z M6 14h4v6H6z',
    clock: 'M3 11a9 9 0 1 1 2 7 M3 6v5h5 M12 7v6l4 2',
    search: 'M17 10a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0z M15 15l6 6',
    clip: 'm9 14 6-6q1-1 2 0t0 2l-8 8q-2 2-4 0t0-4l9-9q3-3 6 0t0 6l-9 9',
    send: 'm3 5 18 7-18 7 3-7z M6 12h14',
    download: 'M12 3v12m-5-5 5 5 5-5 M4 18v3h16v-3',
    spark: 'M3 4h18v12h-9l-6 5v-5H3z M7 8h10 M7 12h6',
    progress: 'm3 7 2 2 4-4 M12 7h9 M4 14h4v4H4z M12 16h9',
    sources: 'M5 3h10v14l-5-3-5 3z M18 7h2v14H8v-2',
    files: 'M3 6h7l2 2h9v12H3z M3 11h18',
    draft: 'M5 3h13v18H5z M8 3v18 M11 8h4 M11 12h4 M11 16h3'
  };
  const precision = {
    ...window.yunzhiVisualEdition?.icons,
    progress: 'M3 19h18 M5 15h3V9H5z M11 15h3V5h-3z M17 15h3v-4h-3z',
    sources: 'M7 3h14v14H7z M3 7v14h14 M10 7h8 M10 11h5',
    files: 'M3 5h7l3 3h8v12H3z M3 11h18',
    draft: 'M5 3h10l4 4v14H5z M15 3v4h4 M8 11h8 M8 14h8 M8 17h5'
  };
  const icons = {glass9: glass, precision9: precision, research9: research};
  // Each pair is drawn for the two sidebar roles at 18 CSS pixels.
  // The reader and the empty sources view keep their own book symbol.
  const sidebarIcons = {
    glass9: {
      allProjects: [
        { tone: 'wash', d: 'M12 3 22 9 12 15 2 9Z' },
        { d: 'M3 13.5 12 19l9-5.5' }
      ],
      researchProjects: [
        { tone: 'wash', d: 'M3 8V6q0-2 2-2h5l3 3h6q2 0 2 2v2H3Z' },
        { tone: 'wash', d: 'M3 10h18l-1.5 8q-.3 2-2.5 2H6.5q-2 0-2.4-2Z' }
      ]
    },
    precision9: {
      allProjects: [
        { tone: 'solid', d: 'M3 3h7v7H3Z' },
        { d: 'M14 3h7v7h-7Z M3 14h7v7H3Z M14 14h7v7h-7Z' }
      ],
      researchProjects: [
        { tone: 'solid', d: 'M3 4h4v4H3Z M3 10h4v4H3Z M3 16h4v4H3Z' },
        { d: 'M10 6h11 M10 12h11 M10 18h8' }
      ]
    },
    research9: {
      allProjects: [
        { d: 'M3 5h4v14H3Z M9 4h4v15H9Z M15 6l3-1 4 13-3 1Z M2 21h20' }
      ],
      researchProjects: [
        { tone: 'wash', d: 'M6 3h14v18H6Z' },
        { tone: 'solid', d: 'M13 3h4v8l-2-1.8-2 1.8Z' },
        { d: 'M3 7h5 M3 12h5 M3 17h5' }
      ]
    }
  };
  const line = d => ({d});
  const wash = d => ({d, tone: 'wash'});
  const solid = d => ({d, tone: 'solid'});

  const glassControls = {
    book: [wash('M2 6q5-3 10 0 5-3 10 0v13q-5-3-10 0-5-3-10 0Z'),line('M12 7v12')],
    clock: [wash('M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0Z'),line('M12 6v6l4 2')],
    spark: [wash('M2 10q0-6 7-6h6q7 0 7 6v2q0 5-6 5h-5l-5 4v-5q-4-1-4-6Z'),line('M7 11h2m3 0h2m3 0h1')],
    down: [wash('M3 9q0-5 5-5h8q5 0 5 5v5q0 5-5 5H8q-5 0-5-5Z'),line('m8 10 4 4 4-4')],
    check: [wash('M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0Z'),line('m7 12 3 3 7-7')],
    search: [wash('M3 10a7 7 0 1 0 14 0 7 7 0 1 0-14 0Z'),line('m16 16 5 5')],
    newProject: [wash('M3 7a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z'), line('M10 15h10m-5-5v10')],
    records: [wash('M3 12a9 9 0 1 0 9-9 9 9 0 0 0-9 9Z'), line('M12 6v6l4 2 M2 8q1-4 5-6')],
    approve: [wash('M2 12a10 10 0 1 0 20 0 10 10 0 1 0-20 0Z'), line('m7 12 3.5 3.5 6.5-7')],
    attach: [line('m7 14 7-8a3.5 3.5 0 0 1 5 5l-7 8a5 5 0 0 1-7.5-6.5L12 4 M9 14l6-7')],
    file: [wash('M7 4h10q3 0 3 3v11q0 3-3 3H9q-3 0-3-3V7Z'), line('M3 16V6q0-4 4-4h7 M10 10h6m-6 4h4')],
    send: [solid('M3 12Q2 11 4 10l16-7q2-.5 1.5 1.5l-6 16q-.7 2-2 .2l-2-6.5 6-7-8 6Z')],
    stop: [solid('M5 8q0-3 3-3h8q3 0 3 3v8q0 3-3 3H8q-3 0-3-3Z')],
    settings: [wash('M3 5h18v5H3z M3 14h18v5H3z'), solid('M6 7.5a3 3 0 1 0 6 0 3 3 0 1 0-6 0 M13 16.5a3 3 0 1 0 6 0 3 3 0 1 0-6 0')],
    arrow: [wash('M2 12a10 10 0 1 0 20 0 10 10 0 1 0-20 0Z'),line('m10 7 5 5-5 5')],
    back: [wash('M2 12a10 10 0 1 0 20 0 10 10 0 1 0-20 0Z'),line('m14 7-5 5 5 5')],
    close: [wash('M2 12a10 10 0 1 0 20 0 10 10 0 1 0-20 0Z'),line('m8 8 8 8m0-8-8 8')],
    note: [wash('M3 7q0-4 4-4h10q4 0 4 4v7q0 4-4 4h-6l-6 4v-5q-2-1-2-4Z'),line('M8 9h8m-8 4h5')],
    progress: [wash('M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0Z'),line('M6 12a6 6 0 0 1 6-6m0 6 4-4')],
    sources: [wash('M7 4h13v13H7Z'),line('M3 8v13h13 M10 9h7m-7 4h4')],
    files: [wash('M2 8q0-3 3-3h5l3 3h6q3 0 3 3l-2 7q-.5 2-3 2H5q-3 0-3-3Z'),line('M4 11h15')],
    draft: [wash('M4 3h11l4 4v13H4Z'),line('m11 15 8-8 2 2-8 8-3 1Z')],
    download: [wash('M2 15q0 5 4 5h12q4 0 4-5Z'),line('M12 3v11m-4-4 4 4 4-4')]
  };

  const precisionControls = {
    book: [line('M2 3h8l2 2 2-2h8v16h-8l-2 2-2-2H2Z M12 5v16'),solid('M4 7h5v2H4z M15 7h5v2h-5z')],
    clock: [line('M4 3h16 M4 21h16 M6 4v3l5 5-5 5v3 M18 4v3l-5 5 5 5v3'),solid('M8 17h8v3H8Z')],
    spark: [line('M7 4H2v16h5 M17 4h5v16h-5'),solid('M6 10h3v4H6z M11 8h3v8h-3z M16 10h3v4h-3z')],
    down: [solid('M3 6h5l4 5 4-5h5l-9 11Z')],
    check: [solid('m2 12 3-3 5 5L19 4l3 3-12 13Z')],
    search: [line('M3 6 6 3h7l3 3v7l-3 3H6l-3-3Z'),solid('m14 16 2-2 7 6-3 3Z')],
    newProject: [solid('M2 2h8v8H2z M2 13h8v8H2z M13 2h8v8h-8z'),line('M17 13v9m-4.5-4.5h9')],
    records: [solid('M2 3h5v5H2z M2 10h5v5H2z M2 17h5v5H2z'),line('M10 5h12m-12 7h9m-9 7h12')],
    approve: [line('M10 3H3v18h18v-7'),solid('m6 11 3-3 3 3 7-8 3 3-10 11Z')],
    attach: [line('M8 15V5l2-2h7l3 3v12l-3 3H7l-3-3V8 M12 7h3v9h-3Z')],
    file: [line('M3 2h12l5 5v15H3z M14 2v6h6'),solid('M6 12h10v2H6z M6 17h2v3H6z M10 17h1v3h-1z M13 17h3v3h-3z')],
    send: [solid('M3 4h6l7 8-7 8H3l7-8Z M12 4h4l7 8-7 8h-4l7-8Z')],
    stop: [solid('M5 5h14v14H5Z')],
    settings: [line('M2 6h20M2 12h20M2 18h20'),solid('M5 3h4v6H5z M14 9h4v6h-4z M7 15h4v6H7z')],
    arrow: [line('M2 12h16m-6-6 6 6-6 6 M21 5v14')],
    back: [line('M22 12H6m6-6-6 6 6 6 M3 5v14')],
    close: [line('M3 9V3h6 M21 15v6h-6 M7 7l10 10M17 7 7 17')],
    note: [line('M3 3h18v15h-9l-5 4v-4H3Z'),solid('M6 7h12v2H6z M6 12h7v2H6z')],
    progress: [solid('M3 12h4v8H3z M10 4h4v16h-4z M17 8h4v12h-4z')],
    sources: [line('M2 3h20v17H2Z M8 3v17'),solid('M11 7h8v2h-8z M11 12h5v2h-5z')],
    files: [line('M2 4h20v16H2z M2 12h20'),solid('M9 6h6v3H9z M9 14h6v3H9z')],
    draft: [line('M3 3h14l4 4v14H3Z'),solid('M6 7h7v5H6z M6 15h12v2H6z')],
    download: [line('M3 16v5h18v-5'),solid('M10 2h4v8h5l-7 7-7-7h5Z')]
  };

  const researchControls = {
    book: [line('M2 5q5-2 10 1 5-3 10-1v14q-5-2-10 1-5-3-10-1Z M12 6v14'),solid('M16 4h3v8l-1.5-1-1.5 1Z')],
    clock: [line('M4 13a8 8 0 1 0 16 0 8 8 0 1 0-16 0Z M12 8v5l-3 2 M9 2h6')],
    spark: [line('M3 4h17v12h-9l-5 4v-4H3Z'),solid('M6 7h3v5H6z M12 7h3v5h-3z')],
    down: [line('M5 5h14v8l-7 6-7-6Z')],
    check: [solid('m2 11 2-2 6 4q4-7 12-11-5 5-11 15Z')],
    search: [line('M3 10a7 7 0 1 0 14 0 7 7 0 1 0-14 0Z M7 10h6'),solid('m14 16 2-2 6 5-3 3Z')],
    newProject: [line('M4 3h12v7 M4 3v18h9 M7 3v18 M12 15h10m-5-5v10')],
    records: [line('M4 3h15v18H4z M8 3v18 M11 8h5m-5 5h5'),solid('M12 2h4v5l-2-1-2 1Z')],
    approve: [line('M3 19q8-2 17 0'),solid('m3 11 2-2 5 4q4-7 12-11-6 6-11 15Z')],
    attach: [line('M4 6h6 M4 6v16h14v-6 M13 11V5q0-3 3-3t3 3v7q0 4-4 4t-4-4V7')],
    file: [line('M3 3h17v18H3z M7 3v18 M10 13h7m-7 4h5'),solid('M12 3h5v7l-2.5-2-2.5 2Z')],
    send: [solid('M2 10 22 3l-6 18-5-6 6-8-8 6Z'),line('M3 19l4-3')],
    stop: [line('M3 20h18'),solid('M7 5h10v11H7Z')],
    settings: [line('M3 3h14v7 M3 3v18h9 M6 3v18'),solid('m11 16 7-8 3 3-7 8-4 2Z')],
    arrow: [line('M3 6v4q0 4 4 4h13m-6-6 6 6-6 6')],
    back: [line('M21 6v4q0 4-4 4H4m6-6-6 6 6 6')],
    close: [line('m6 6 12 12 M18 6 6 18 M4 21h16')],
    note: [solid('m4 15 11-12 4 4L8 19l-6 2Z'),line('M11 20h10')],
    progress: [line('M3 4v16 M7 6h14M7 12h10M7 18h14'),solid('M1 4h4v4H1Z')],
    sources: [line('M3 5h12v15l-6-4-6 4Z M18 3h3v15'),solid('M6 7h6v2H6Z')],
    files: [line('M2 5h4v14H2z M8 4h4v15H8z M15 6l3-1 4 13-3 1z M2 21h20')],
    draft: [line('M2 4q6-1 10 2 4-3 10-2v14q-6-1-10 2-4-3-10-2Z M12 6v14'),solid('M16 4h3v8l-1.5-1-1.5 1Z')],
    download: [line('M3 19q5-2 9 1 4-3 9-1 M12 2v12m-4-4 4 4 4-4')]
  };

  const controls = {glass9: glassControls, precision9: precisionControls, research9: researchControls};
  window.yunzhiRound9Edition = id => ({
    controlArt: controls[id],
    theme: choices.find(choice => choice[0] === id), choices,
    caption: '本地示例',
    icons: icons[id],
    sidebarIcons: sidebarIcons[id],
    tabIcons: {progress: 'progress', sources: 'sources', files: 'files', draft: 'draft'}
  });
  window.yunzhiVisualEdition = window.yunzhiRound9Edition(document.body.dataset.theme);
})();
