'use strict';

// Build each new edition from its 80-point baseline. Its glyphs and score key
// are independent of the original, including when both share the trial frame.
(() => {
  const choices = [
    ['glass10', '澄明玻璃 · 第十轮', '澄明玻璃-第十轮'],
    ['precision10', '精密国际主义 · 第十轮', '精密国际主义-第十轮'],
    ['research10', '研究对话 · 第十轮', '研究对话-第十轮']
  ];
  const line = d => ({d});
  const wash = d => ({d, tone:'wash'});
  const fill = d => ({d, tone:'solid'});
  const art = {
    glass10: {
      approve:[wash('M3 13c0-5 4-10 9-10s9 4 9 9-5 9-10 9-8-3-8-8Z'),line('m7 12 3.2 3.2L17 8 M5.5 8.5Q8 4 13 4')],
      file:[wash('M4 6 14 2l6 3v14l-11 3-5-3Z'),line('m4 6 5 3 11-4 M9 9v13m3-9 5-1.5m-5 5 4-1.2')],
      files:[wash('m2 7 8-3 3 2 7-2v12l-13 5-5-3Z'),line('m2 8 5 3 14-5 M7 11v10')],
      sources:[wash('m3 7 10-4 8 4-11 5Z'),line('m3 12 7 4 11-5m-18 6 7 4 11-5')],
      progress:[wash('M2 15a10 10 0 0 1 20 0l-4 4H6Z'),line('m11 14 6-7 M5 13q1-5 5-6')],
      draft:[wash('M4 5 17 2v17L4 22Z'),line('m9 14 9-10 3 2-9 10-4 1Z')],
      newProject:[wash('m2 8 9-5 9 5-9 5Z'),line('m3 13 7 4 4-2 M17 12v9m-4.5-4.5h9')],
      note:[wash('M3 6q0-3 4-3h10q4 0 4 4v6q0 4-4 4h-6l-6 5v-6q-2-1-2-4Z'),line('m8 12 3-4 3 3 3-4')],
      records:[wash('M4 14a8 8 0 1 0 16 0 8 8 0 1 0-16 0'),line('M3 9q1-6 8-7m1 7v5l4 2')],
      arrow:[line('M3 14q4-3 10-3h7m-6-6 6 6-6 6')],
      send:[fill('M2 12 21 3l-6 18-4-7 6-7-8 6Z')]
    },
    precision10: {
      approve:[line('M9 3H3v7m12 11h6v-7'),fill('m4 12 3-3 4 4 8-9 3 3-11 12Z')],
      file:[line('M3 2h13l5 5v15H3Z M15 2v6h6'),fill('M6 11h4v7H6Z M12 11h6v2h-6Z M12 16h4v2h-4Z')],
      files:[line('M2 4h20v16H2Z M2 12h20'),fill('M5 6h6v3H5Z M5 14h6v3H5Z')],
      sources:[line('M7 2h14v15H7Z M3 6v15h14'),fill('M10 5h3v3h-3Z M15 5h3v3h-3Z M10 11h8v2h-8Z')],
      progress:[line('M2 20h20'),fill('M3 13h4v5H3Z M10 9h4v9h-4Z M17 3h4v15h-4Z')],
      draft:[line('M3 3h17v18H3Z M7 3v18'),fill('M10 6h7v4h-7Z M10 13h7v2h-7Z')],
      newProject:[line('M3 4h10v4H7v10h4 M16 9v12m-6-6h12')],
      records:[line('M5 3v18 M9 5h12M9 12h9M9 19h12'),fill('M2 3h5v4H2Z M2 10h5v4H2Z M2 17h5v4H2Z')],
      arrow:[fill('M2 10h12V5l7 7-7 7v-5H2Z')],
      note:[line('M2 3h19v13h-9l-5 5v-5H2Z'),fill('M5 7h13v2H5Z M5 11h7v2H5Z')]
    },
    research10: {
      approve:[fill('M5 14 16 3l5 4-11 11-7 3Z'),line('m5 15 4 3 M13 21q4-2 9-1')],
      file:[wash('M3 3h15l3 3v15H3Z'),line('M7 3v18m3-12h7m-7 5h5'),fill('M13 2h4v6l-2-1.5L13 8Z')],
      files:[line('M2 5h5v14H2Z M9 4h4v15H9Z M15 6l3-1 4 13-3 1Z'),fill('M2 20h20v2H2Z')],
      sources:[line('M2 7h15v14H2Z M6 3h15v15'),fill('M5 10h3v5H5Z M10 10h3v5h-3Z')],
      progress:[line('M3 3v18 M9 6h12M9 12h9M9 18h12'),fill('M2 3h5v7L4.5 8 2 10Z')],
      draft:[line('M2 4q5-1 10 2 5-3 10-2v14q-6-1-10 2-5-3-10-2Z M12 6v14'),fill('M15 4h4v9l-2-2-2 2Z')],
      newProject:[line('M2 4h13v5 M2 4v16h10 M6 4v16 M16 11v10m-5-5h10'),fill('M9 3h3v6l-1.5-1L9 9Z')],
      records:[line('M2 5h16v16H2Z M6 5v16 M9 10h6m-6 4h4 M6 2h15v15')],
      note:[line('M3 3v17h17'),fill('m8 13 9-11 4 4-10 11-5 1Z')],
      arrow:[line('M3 14q8 1 16-4m-7-3 8 3-4 7')]
    }
  };
  const nav = {
    glass10:{allProjects:[wash('m2 8 10-5 10 5-10 5Z'),line('m2 13 10 5 10-5m-17 5 7 3 7-3')],researchProjects:[wash('M3 8V5h8l3 2h7v11L7 21l-4-3Z'),line('m4 10 4 2 12-3 M8 12v8')]},
    precision10:{allProjects:[line('M2 2h20v20H2Z M2 10h20 M10 10v12'),fill('M5 5h6v2H5Z M13 13h6v6h-6Z')],researchProjects:[line('M3 3h18v18H3Z M8 3v18'),fill('M11 6h7v2h-7Z M11 11h7v2h-7Z M11 16h5v2h-5Z')]},
    research10:{allProjects:[line('M2 7h5v12H2Z M9 4h5v15H9Z M16 6l3-1 3 13-3 1Z M2 21h20'),fill('M10 5h3v4h-3Z')],researchProjects:[line('M4 3h16v18H4Z M8 3v18'),fill('M12 3h5v10l-2.5-2-2.5 2Z')]}
  };
  window.yunzhiRound10Edition = id => {
    const baseline=window.yunzhiRound9Edition(id.replace('10','9'));
    return {...baseline, choices, theme:choices.find(t=>t[0]===id),
      controlArt:{...baseline.controlArt,...art[id]}, sidebarIcons:nav[id]};
  };
  if(choices.some(t=>t[0]===document.body.dataset.theme)){
    window.yunzhiVisualEdition=window.yunzhiRound10Edition(document.body.dataset.theme);
  }
})();
