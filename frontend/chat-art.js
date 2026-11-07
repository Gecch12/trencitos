"use strict";
// Original Trencitos vector artwork. Only trusted local geometry becomes SVG;
// player names and message text always use textContent in the chat UI.
globalThis.ChatArt = (() => {
  const ink='#214d5b', gold='#f3c65f', shade='#dda340', cream='#fff5d8', coral='#df7562', blue='#81bdc8';
  const svg=body=>`<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><g stroke="${ink}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;
  const face=body=>svg(`<ellipse cx="32" cy="56" rx="18" ry="3" fill="${ink}" opacity=".12" stroke="none"/><circle cx="32" cy="30" r="25" fill="${gold}"/><path d="M12 38a23 23 0 0 0 40-3c-4 17-29 24-40 3" fill="${shade}" stroke="none"/><path d="M17 17c3-4 6-6 11-6" stroke="${cream}" stroke-width="4"/>${body}`);
  const reactions={
    '👍':{name:'Me gusta',art:svg(`<path d="M22 52h25c5 0 6-4 7-9l3-15c1-4-2-6-5-6H38l2-10c1-6-7-8-9-2l-7 15-6 5" fill="${gold}"/><path d="M49 28h6m-8 8h6m-8 8h6" stroke="${shade}"/><path d="M25 45c7 4 13 5 23 4" stroke="${cream}"/><rect x="7" y="27" width="14" height="29" rx="4" fill="${ink}"/><path d="M12 32v16" stroke="${blue}"/><circle cx="14" cy="50" r="1.5" fill="${gold}" stroke="none"/>`)},
    '❤️':{name:'Me encanta',art:svg(`<ellipse cx="32" cy="56" rx="19" ry="3" fill="${ink}" opacity=".12" stroke="none"/><path d="M32 55C21 47 6 36 6 23 6 8 24 4 32 18 40 4 58 8 58 23c0 13-15 24-26 32Z" fill="${coral}"/><path d="M14 24c0-6 5-10 10-7" stroke="${cream}" stroke-width="4"/><path d="M38 46c8-6 14-13 15-20" stroke="#bd5749" stroke-width="4"/>`)},
    '😂':{name:'Me divierte',art:face(`<g transform="rotate(-28 32 30)"><path d="M15 18q7 0 11 5-5 2-10 6l4-6Z M49 18q-7 0-11 5 5 2 10 6l-4-6Z" fill="${ink}" stroke-width="1.4"/><path d="M14 32q18 9 36 0c-1 25-34 25-36 0Z" fill="#995622"/><path d="M15 33q17 8 34 0l-2 8q-15 7-30 0Z" fill="${cream}" stroke-width="1.8"/></g><path d="M14 38C10 40 3 46 5 50c2 5 10 3 11-2 1-4-1-7-2-10ZM50 21c6-5 12-5 11 2-1 7-8 5-11-2Z" fill="${blue}" stroke-width="2"/><path d="m9 48 3-5m43-22 3-1" stroke="${cream}" stroke-width="2"/>`)},
    '😮':{name:'Me sorprende',art:face(`<path d="M17 19q4-3 8 0m14 0q4-3 8 0"/><ellipse cx="23" cy="27" rx="2.5" ry="4" fill="${ink}" stroke="none"/><ellipse cx="41" cy="27" rx="2.5" ry="4" fill="${ink}" stroke="none"/><ellipse cx="32" cy="41" rx="6" ry="8" fill="${ink}"/><path d="M30 45q2-2 4 0" stroke="${coral}" stroke-width="3"/>`)},
    '😢':{name:'Me entristece',art:face(`<path d="M16 21q5 0 9-5m14 0q4 5 9 5M18 29q3-3 7 0m14 0q3-3 7 0M25 44q7-7 14 0"/><path d="M46 31c-4 6-6 8-6 11a6 6 0 0 0 12 0c0-3-2-6-6-11Z" fill="${blue}" stroke-width="2"/><path d="M47 40v4" stroke="${cream}" stroke-width="2"/>`)},
    '👏':{name:'Aplausos',art:svg(`<path d="m32 47-9-15-4-17c-1-5 4-6 6-2l5 12-3-15c-1-5 5-6 6-1l5 15-2-12c-1-4 5-5 6-1l4 16 2-7c1-4 6-3 5 1l-2 17c0 7-4 12-10 15Z" fill="${shade}"/><path d="m17 52-8-15c-3-6 2-9 5-5l5 6-8-19c-2-5 3-7 5-3l10 18-6-20c-1-5 4-6 6-1l8 20-2-14c-1-5 5-5 6-1l4 20c2 8-2 14-7 17Z" fill="${gold}"/><path d="m18 45 5 8m4-12 5 10" stroke="${cream}" stroke-width="3"/><path d="m49 6 3-3m3 10 5-1M10 8 7 4" stroke="${coral}"/><path d="m14 53 5 6 18-5-2-6" fill="${ink}"/>`)},
  };
  const icons={
    react:'<path d="M26 49A23 23 0 1 1 53 26M18 32q6 9 16 4"/><circle cx="20" cy="24" r="1.5" fill="currentColor"/><circle cx="37" cy="24" r="1.5" fill="currentColor"/><circle cx="46" cy="46" r="13" fill="#fffcf5"/><path d="M40 46h12m-6-6v12"/>',
    sound:'<path d="M9 25h11l15-12v38L20 39H9Zm34-3q10 10 0 20m7-27q17 17 0 34"/>',
    muted:'<path d="M9 25h11l15-12v38L20 39H9Zm33 0 15 15m0-15L42 40"/>',
    send:'<path d="m8 9 49 23L8 55l8-23Zm8 23h41"/>',
    close:'<path d="m18 18 28 28m0-28L18 46"/>',
    person:'<circle cx="32" cy="21" r="10"/><path d="M13 54v-6c0-20 38-20 38 0v6Z"/>',
  };
  const colors={orange:'#df9d43',black:'#26434b',white:'#fff9e7',gray:'#97aaa8',red:'#ce6655',blue:'#5b9dbb',yellow:'#e2bf53',green:'#559986',pink:'#b77e9f',purple:'#9c80ad'};
  function route({color='gray',lane=0,lanes=1}={}){
    const count=Math.min(3,Math.max(1,lanes));
    return svg(Array.from({length:count},(_,i)=>{const y=count===1?32:22+i*20/(count-1),active=i===lane;return `<g opacity="${active?1:.25}"><path d="M10 ${y}h44" stroke="${ink}" stroke-width="8"/><path d="M10 ${y}h44" stroke="${active?(colors[color]||colors.gray):'#97aaa8'}" stroke-width="5"/>${[18,28,38,48].map(x=>`<path d="M${x} ${y-5}v10" stroke="${ink}" stroke-width="2"/>`).join('')}</g>`;}).join(''));
  }
  return {reactions,route,icon:name=>svg(icons[name]||icons.person)};
})();
