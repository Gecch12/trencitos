"use strict";

// Presentation only: the confirmed room reference determines the checked card.
const RoomMapPicker = (() => {
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function thumbnail(layout) {
    if (!layout) return '';
    const {x,y,width,height} = layout.bounds;
    return `<svg viewBox="${x} ${y} ${width} ${height}" aria-hidden="true" focusable="false">
      ${layout.land.map(d=>`<path d="${escape(d)}" fill="#f4e6c7" stroke="#a99875" stroke-width="2"/>`).join('')}
      ${Object.values(layout.cities).map(([cx,cy])=>`<circle cx="${cx}" cy="${cy}" r="${Math.max(width,height)/170}" fill="#386674"/>`).join('')}
    </svg>`;
  }
  function create({container, hint, options, layouts, select, translate}) {
    let locked = true, selectedKey = null;
    // Keep the playable continental maps together, followed by the test board.
    const ordered = options.filter(o=>o.id!=='laboratory').concat(options.filter(o=>o.id==='laboratory'));
    container.innerHTML = ordered.map(option => {
      const layout=layouts.find(l=>l.mapRef.id===option.id&&l.mapRef.version===option.version);
      const badge=option.id==='laboratory'?'Pruebas':option.id==='south-america'?'Beta':'';
      const title=option.id==='south-america'?'Sudamérica':option.name;
      return `<button type="button" class="map-choice" role="radio" aria-checked="false" aria-disabled="true" tabindex="-1" data-map-id="${escape(option.id)}" data-map-version="${escape(option.version)}">
        <span class="map-choice-art">${thumbnail(layout)}</span>
        <span class="map-choice-name">${escape(translate(title))}</span>
        ${badge?`<span class="map-choice-badge">${escape(translate(badge))}</span>`:''}
        <span class="map-choice-check" aria-hidden="true">✓</span>
      </button>`;
    }).join('');
    const buttons=[...container.querySelectorAll('[role="radio"]')];
    buttons.forEach((button,i)=>{
      button.onclick=()=>{if(!locked)select(ordered[i]);};
      button.onkeydown=event=>{
        const next=event.key==='ArrowRight'||event.key==='ArrowDown'?(i+1)%buttons.length:
          event.key==='ArrowLeft'||event.key==='ArrowUp'?(i+buttons.length-1)%buttons.length:
          event.key==='Home'?0:event.key==='End'?buttons.length-1:null;
        if(next===null)return;
        event.preventDefault();buttons[next].focus();buttons[next].scrollIntoView({block:'nearest',inline:'nearest'});
        if(!locked)select(ordered[next]);
      };
    });
    function revealSelected() {
      if (!container.clientWidth) return;
      const selected=buttons.find(button=>button.getAttribute('aria-checked')==='true');
      if (!selected) return;
      const card=selected.getBoundingClientRect(), rail=container.getBoundingClientRect();
      if (card.left<rail.left) container.scrollLeft-=rail.left-card.left;
      else if (card.right>rail.right) container.scrollLeft+=card.right-rail.right;
    }
    const overflow=()=>{hint.hidden=container.scrollWidth<=container.clientWidth+2;};
    new ResizeObserver(()=>{overflow();revealSelected();}).observe(container);
    return {render(ref, disabled){
      locked=disabled;
      buttons.forEach((button,i)=>{
        const checked=ordered[i].id===ref?.id&&ordered[i].version===ref?.version;
        button.setAttribute('aria-checked',String(checked));
        button.setAttribute('aria-disabled',String(locked));
        button.tabIndex=checked?0:-1;
      });
      overflow();
      const key=ref?.id+':'+ref?.version;
      if(key!==selectedKey){selectedKey=key;revealSelected();}
    }};
  }
  return {create};
})();
