'use strict';
// The mark in the sidebar and a demo switch between the two products. The skin is the same for both; only the
// mark, the name and the line under it change. The switch is part of the demo bar, not of the product.
(() => {
  const products = {
    yunzhi: { name: '云织', en: 'CIS', sub: '个人研究空间' },
    streams: { name: '流息', en: 'STREAMS', sub: '个人资料库' }
  };
  const key = 'r12-product';
  let product = 'yunzhi';
  try { if (localStorage.getItem(key) === 'streams') product = 'streams'; } catch {}

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'r12-product';
  const paint = () => {
    const p = products[product];
    document.body.dataset.product = product;
    toggle.textContent = '产品 · ' + p.name + ' ' + p.en;
    document.title = document.title.replace(/云织|流息/, p.name);
    const brand = document.querySelector('.sidebar .brand');
    if (!brand) return;
    const name = brand.querySelector('.brandname'), sub = brand.querySelector('small');
    if (name && name.textContent !== p.name) name.textContent = p.name;
    if (sub && sub.textContent !== p.sub) sub.textContent = p.sub;
    brand.setAttribute('aria-label', p.name + ' ' + p.en);
  };
  toggle.onclick = () => {
    product = product === 'yunzhi' ? 'streams' : 'yunzhi';
    try { localStorage.setItem(key, product); } catch {}
    paint();
  };
  const bar = document.querySelector('.prototype-bar');
  bar.insertBefore(toggle, bar.querySelector('#simulate'));
  // The sidebar is drawn again on every render: put the product's name back each time.
  new MutationObserver(paint).observe(document.querySelector('#sidebar'), { childList: true });
  paint();
})();
