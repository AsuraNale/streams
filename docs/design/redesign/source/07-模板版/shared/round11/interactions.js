'use strict';
// The same media path serves an independent prototype and the comparison frame.
(() => {
  const appearance=document.createElement('button');
  appearance.type='button';
  appearance.className='r11-appearance';
  appearance.setAttribute('aria-label','深色外观');
  const applyAppearance=dark=>{
    document.body.dataset.appearance=dark?'dark':'light';
    appearance.setAttribute('aria-pressed',String(dark));
    appearance.textContent=dark?'深色 · 开':'深色 · 关';
  };
  let dark=false;
  try{dark=localStorage.getItem('yunzhi-r11-dark')==='true'}catch{}
  applyAppearance(dark);
  appearance.onclick=()=>{
    dark=document.body.dataset.appearance!=='dark';applyAppearance(dark);
    try{localStorage.setItem('yunzhi-r11-dark',String(dark))}catch{}
  };
  document.querySelector('.prototype-bar').insertBefore(appearance,document.querySelector('#simulate'));

  window.r11StreamReply=(p,text)=>{
    const message={role:'assistant',text:''};
    const chars=Array.from(text);
    const job=pending;
    p.messages.push(message);
    job.message=message;
    const visible=()=>current===p.id && page()==='project' && !reader;
    if(visible()){
      const waitingLine=document.querySelector('.thread .writing');
      if(waitingLine)waitingLine.outerHTML='<div class="assistant-message">'+speaker()+'<p class="intro-copy ink-stream" aria-busy="true"></p></div>';
    }
    let index=0;
    const tick=()=>{
      if(pending!==job)return;
      const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches||!document.body.classList.contains('r11');
      const target=visible()?document.querySelector('.thread .ink-stream'):null;
      const scroll=target?.closest('.thread-scroll');
      const following=scroll && scroll.scrollHeight-scroll.clientHeight-scroll.scrollTop<42;
      const chunk=reduced?chars.slice(index).join(''):chars[index];
      index+=reduced?chars.length-index:1;
      message.text+=chunk;
      if(target){
        if(reduced)target.textContent=message.text;
        else{const glyph=document.createElement('span');glyph.className='ink-glyph';glyph.textContent=chunk;target.append(glyph)}
      }
      if(following)scroll.scrollTop=scroll.scrollHeight;
      if(index<chars.length){job.timer=setTimeout(tick,30);return}
      pending=null;save();
      if(target){
        target.removeAttribute('aria-busy');
        // Keep the last glyph's arrival before restoring normal selectable prose.
        setTimeout(()=>{target.textContent=message.text;target.classList.remove('ink-stream')},reduced?0:100);
      }
      const send=visible()?document.querySelector('.send-btn'):null;
      if(send){send.type='submit';delete send.dataset.action;send.setAttribute('aria-label','发送消息');send.innerHTML=icon('send')}
    };
    tick();
  };

  let reset;
  const clearPulse=()=>{
    document.querySelectorAll('.r11-ack').forEach(el=>el.classList.remove('r11-ack'));
  };
  document.addEventListener('click',e=>{
    if(!document.body.classList.contains('r11'))return;
    const control=e.target.closest('button');
    if(!control)return;
    const sample=control.matches('[data-sample]') && control.querySelector('[data-glyph="approve"]');
    if(!sample && control.dataset.action!=='approve')return;
    const feedback=sample?document.querySelector('#trialRail .trial-feedback'):document.querySelector('#toast');
    if(!feedback)return;
    clearTimeout(reset);clearPulse();
    feedback.prepend(Object.assign(document.createElement('span'),{className:'r11-stamp',textContent:'✓'}));
    feedback.classList.add('r11-ack');
    reset=setTimeout(()=>{
      feedback.classList.remove('r11-ack');
      if(feedback.querySelector('.r11-stamp'))feedback.textContent=sample?'松开后可再次试按。':'';
    },2500);
  });
})();
