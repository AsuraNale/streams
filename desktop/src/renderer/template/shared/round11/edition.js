'use strict';
(() => {
  const choices=[
    ['glass11','澄明玻璃 · 第十一轮','澄明玻璃-第十一轮'],
    ['precision11','精密国际主义 · 第十一轮','精密国际主义-第十一轮'],
    ['research11','研究对话 · 第十一轮','研究对话-第十一轮'],
    ['line12','单线黑白 · 第十二轮','单线黑白-第十二轮']
  ];
  window.yunzhiRound11Edition=id=>{
    const base=id==='glass11' ? window.yunzhiRound10Edition('glass10') :
      window.yunzhiRound9Edition(id.replace('11','9'));
    return {...base,choices,theme:choices.find(row=>row[0]===id)};
  };
  if(document.body.dataset.theme.endsWith('11'))window.yunzhiVisualEdition=window.yunzhiRound11Edition(document.body.dataset.theme);
})();
