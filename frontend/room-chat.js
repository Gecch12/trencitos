"use strict";
globalThis.RoomChatUI = (() => {
  const t=text=>I18n.t(text);
  function create({send,routes,focusRoute,available}) {
    let info=null,messages=[],pending=null,needsSync=true,syncing=false,before=null,more=false;
    let revision=0,draft='',refs=[],unread=0,lastRead=0,panels=[],popup=null,resizeFrame=null;
    const readKey=()=>info?'rr-chat-read-'+info.chatId:'';
    const node=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
    const art=(markup,cls='')=>{const el=node('span',cls);el.innerHTML=markup;el.setAttribute('aria-hidden','true');return el;};
    function button(label,action,cls='') {const b=node('button',cls,label);b.type='button';b.onclick=action;return b;}
    function iconButton(icon,label,action,cls='') {const b=button('',action,cls);b.append(art(ChatArt.icon(icon)));b.setAttribute('aria-label',t(label));b.title=t(label);return b;}
    function avatar(person) {const el=art(ProfileUI.avatar(person.avatar),'chat-avatar');el.style.setProperty('--chat-color',person.color||'#779296');return el;}
    function request(type,fields={}) {
      if(!info||!available())return;
      const message={type,chatId:info.chatId,id:crypto.randomUUID(),...fields};send(message);return message;
    }
    function sync() {if(!info||!available()||syncing)return;syncing=true;send({type:'chat_sync',chatId:info.chatId});}
    function panelVisible(p) {return p.root.getClientRects().length>0&&
      (!p.root.closest('#tableChat')||document.querySelector('#tableChat').open)&&!document.hidden;}
    function shown(p) {return panelVisible(p)&&p.log.clientHeight>0;}
    function atBottom(p) {return p.log.scrollHeight-p.log.scrollTop-p.log.clientHeight<32;}
    function badges() {
      document.querySelectorAll('[data-chat-badge]').forEach(el=>{el.hidden=!unread;el.textContent=String(unread);});
      for(const p of panels){p.latest.hidden=!unread;p.latest.textContent=t('Mensajes nuevos')+' ('+unread+')';}
    }
    function markRead() {
      if(!info||!panels.some(p=>shown(p)&&atBottom(p)))return;
      lastRead=Math.max(lastRead,...messages.map(m=>m.seq));unread=0;badges();
      try{sessionStorage.setItem(readKey(),String(lastRead));}catch{}
    }
    function fitInput(p) {
      if(!p.input.clientWidth)return;
      const follow=p.following,s=getComputedStyle(p.input),line=parseFloat(s.lineHeight),padding=parseFloat(s.paddingTop)+parseFloat(s.paddingBottom),border=parseFloat(s.borderTopWidth)+parseFloat(s.borderBottomWidth);
      p.input.style.height='auto';
      const desired=p.input.scrollHeight+border,max=line*5+padding+border,min=line*2+padding+border;
      p.input.style.height=Math.ceil(Math.min(max,Math.max(min,desired)))+'px';p.input.style.overflowY=desired>max+1?'auto':'hidden';
      if(follow&&shown(p))p.log.scrollTop=p.log.scrollHeight;
    }
    function changed() {
      renderControls();if(needsSync)sync();cancelAnimationFrame(resizeFrame);
      resizeFrame=requestAnimationFrame(()=>{for(const p of panels){fitInput(p);if(shown(p)&&p.following)p.log.scrollTop=p.log.scrollHeight;}positionPopup();markRead();});
    }
    function closePopup(restore=false) {
      if(!popup)return;const old=popup;popup=null;
      if(old.el.matches(':popover-open'))old.el.hidePopover();old.el.hidden=true;
      old.anchor?.setAttribute('aria-expanded','false');old.p.input.setAttribute('aria-expanded','false');old.p.input.removeAttribute('aria-activedescendant');
      if(restore&&old.anchor?.isConnected)old.anchor.focus();
    }
    function positionPopup() {
      if(!popup)return;const {p,kind,el}=popup;
      if(!panelVisible(p)){closePopup();return;}
      if(kind==='reactions')popup.anchor=[...p.log.querySelectorAll('.chat-message')].find(row=>row.dataset.messageId===popup.messageId)?.querySelector('.chat-react-add');
      if(!popup.anchor?.isConnected){closePopup();return;}
      const viewport=window.visualViewport,left=(viewport?.offsetLeft||0)+8,top=(viewport?.offsetTop||0)+8,width=(viewport?.width||innerWidth)-16,bottom=top+(viewport?.height||innerHeight)-16;
      const anchor=popup.anchor.getBoundingClientRect();
      el.style.width=Math.min(kind==='reactions'?284:Math.max(p.root.clientWidth,260),width)+'px';
      const above=kind==='suggestions'||kind==='reactions'&&anchor.top-top>=76;
      el.style.maxHeight=Math.max(0,Math.min(kind==='suggestions'?260:300,above?anchor.top-top-8:bottom-anchor.bottom-8))+'px';
      const rect=el.getBoundingClientRect();
      el.style.left=Math.min(Math.max(left,anchor.right-rect.width),left+width-rect.width)+'px';
      el.style.top=(above?Math.max(top,anchor.top-rect.height-8):Math.min(bottom-rect.height,anchor.bottom+8))+'px';
    }
    function openPopup(p,kind,el,anchor,fields={}) {
      if(popup?.el!==el)closePopup();popup={p,kind,el,anchor,...fields};el.hidden=false;
      if(el.showPopover&&!el.matches(':popover-open'))el.showPopover();
      anchor.setAttribute('aria-expanded','true');positionPopup();
    }
    function reset() {
      closePopup();info=null;messages=[];pending=null;draft='';refs=[];unread=lastRead=revision=0;needsSync=true;syncing=false;before=null;more=false;
      panels.forEach(p=>{p.input.value='';p.feedback.textContent='';});render();
    }
    function disconnected() {needsSync=true;syncing=false;closePopup();renderControls();}
    function receive(m) {
      if(typeof m.type!=='string'||!m.type.startsWith('chat_'))return false;
      if(m.type==='chat_result') {
        if(pending?.id===m.id){if(m.ok){draft='';refs=[];panels.forEach(p=>p.input.value='');}pending=null;}
        panels.forEach(p=>p.feedback.textContent=m.ok?'':t(m.message||'No se pudo procesar el mensaje.'));
        if(m.code==='CHAT_STALE')needsSync=true;renderControls();panels.forEach(fitInput);return true;
      }
      if(m.type==='chat_context'||m.type==='chat_snapshot') {
        const fresh=info?.chatId!==m.chatId,permissionsChanged=info?.canWrite!==m.canWrite;
        if(fresh){reset();try{lastRead=Number(sessionStorage.getItem('rr-chat-read-'+m.chatId))||0;}catch{}}
        info=m;
        if(m.type==='chat_snapshot') {
          syncing=false;needsSync=false;
          if(m.older){const seen=new Set(messages.map(x=>x.id));messages=[...m.messages.filter(x=>!seen.has(x.id)),...messages];}
          else {messages=m.messages;revision=m.revision;}
          before=m.before;more=m.more;unread=messages.filter(x=>x.seq>lastRead&&x.author?.id!==info.self).length;
          render(!m.older,!!m.older);if(pending)send(pending);
        } else {if(permissionsChanged)render();else renderControls();if(needsSync||m.revision>revision)sync();}
      } else if(m.type==='chat_event'&&info?.chatId===m.chatId) {
        if(m.revision>revision+1){sync();return true;}
        revision=Math.max(revision,m.revision);
        if(m.message){const index=messages.findIndex(x=>x.id===m.message.id);
          if(index>=0)messages[index]=m.message;else {messages.push(m.message);if(m.message.author?.id!==info.self&&m.message.seq>lastRead)unread++;}
          render(false,false,m.message.id);
        }
      }
      return true;
    }
    function renderPeople(p) {
      const people=new Map([...(info?.people||[]),...(info?.mutedPeople||[])].map(x=>[x.id,x]));
      for(const m of messages)if(m.author&&!people.has(m.author.id))people.set(m.author.id,m.author);
      const items=[...people.values()].filter(person=>person.id!==info?.self),signature=JSON.stringify([items,info?.muted,available()]);
      if(signature===p.peopleSignature)return;p.peopleSignature=signature;
      const focused=document.activeElement?.dataset.person;p.people.replaceChildren(node('strong','chat-popup-title',t('Silenciar jugadores')));
      if(!items.length)p.people.append(node('p','chat-empty',t('Aún no hay otros jugadores.')));
      for(const person of items){const muted=info.muted.includes(person.id);
        const b=button('',()=>request('chat_mute',{target:person.id,muted:!muted}),'chat-person-option');b.dataset.person=person.id;
        b.append(avatar(person),node('span','chat-option-label',person.name),art(ChatArt.icon(muted?'muted':'sound'),'chat-person-sound'));
        b.disabled=!available();b.setAttribute('aria-pressed',String(muted));b.setAttribute('aria-label',t(muted?'Volver a escuchar':'Silenciar')+' '+person.name);p.people.append(b);
        if(focused===person.id)b.focus();
      }
    }
    function renderControls() {
      for(const p of panels){
        const enabled=!!info&&info.canWrite&&available()&&!pending;
        p.input.disabled=!enabled;p.send.disabled=!enabled||!draft.trim();
        for(const b of p.log.querySelectorAll('.chat-reactions button,.chat-react-add'))b.disabled=!info?.canWrite||!available();
        p.input.placeholder=t(!info?'Entra a una sala para conversar':!info.canWrite?'Podrás escribir al terminar la partida':'Enviar un mensaje');
        p.mute.disabled=!info;p.mute.dataset.active=String(!!info?.muted.length);p.mute.title=t('Silenciar jugadores')+(info?.muted.length?' ('+info.muted.length+')':'');
        if(p.root.id!=='roomChatPanel'){
          const header=p.root.closest('.compact-panel')?.querySelector('.table-panel-heading');
          const parent=header||document.querySelector('#tableChat > summary');
          if(p.mute.parentElement!==parent)parent.insertBefore(p.mute,parent.lastElementChild);
        }
        renderPeople(p);p.older.hidden=!more;p.older.disabled=syncing;p.count.textContent=[...draft].length+'/'+(info?.limit||500);
        p.root.classList.toggle('chat-offline',!available());
      }
      if(popup){if(popup.kind==='reactions'&&(!available()||!info?.canWrite))closePopup();else positionPopup();}badges();
    }
    function reactionButton(emoji,mine,onClick,cls) {
      const reaction=ChatArt.reactions[emoji],b=button('',onClick,cls);b.dataset.emoji=emoji;
      b.append(art(reaction.art,'chat-reaction-art'));b.setAttribute('aria-label',t(reaction.name));b.title=t(reaction.name);b.setAttribute('aria-pressed',String(!!mine));return b;
    }
    function showReactions(p,messageId,anchor,focus=false) {
      if(!info?.canWrite||!available())return;
      const message=messages.find(m=>m.id===messageId);if(!message?.author)return;
      p.reactions.replaceChildren();
      for(const emoji of info.reactions){const mine=message.reactions?.some(r=>r.emoji===emoji&&r.mine);
        const b=reactionButton(emoji,mine,()=>{closePopup(true);request('chat_react',{messageId,emoji:mine?null:emoji});},'chat-reaction-choice');p.reactions.append(b);
      }
      openPopup(p,'reactions',p.reactions,anchor,{messageId});if(focus)p.reactions.querySelector('button').focus();
    }
    function longPress(row,p,messageId,trigger) {
      let timer=null,start=null,ignoreUntil=0;
      const cancel=()=>{clearTimeout(timer);timer=null;};
      row.addEventListener('pointerdown',event=>{
        if(event.pointerType!=='touch'||event.target.closest('button'))return;start={x:event.clientX,y:event.clientY};cancel();
        timer=setTimeout(()=>{timer=null;ignoreUntil=Date.now()+750;showReactions(p,messageId,trigger);},450);
      });
      row.addEventListener('pointermove',event=>{if(start&&Math.hypot(event.clientX-start.x,event.clientY-start.y)>10)cancel();});
      for(const type of ['pointerup','pointercancel','pointerleave'])row.addEventListener(type,cancel);
      row.addEventListener('contextmenu',event=>{if(start||Date.now()<ignoreUntil){event.preventDefault();cancel();showReactions(p,messageId,trigger);}});
      row.addEventListener('click',event=>{if(Date.now()<ignoreUntil){event.preventDefault();event.stopPropagation();}},true);
    }
    function routeVisual(route,label) {const el=art(ChatArt.route(route),'chat-route-art');el.title=label;return el;}
    function render(followInitial=false,prepend=false,animatedId=null) {
      for(const p of panels){
        const follow=followInitial||p.following,top=p.log.scrollTop,height=p.log.scrollHeight;
        p.log.replaceChildren();
        if(!messages.length)p.log.append(node('p','chat-empty',t('Este es el chat de la mesa. Se elimina al cerrar la sala.')));
        const routeList=routes();
        for(const message of messages){
          if(message.author&&info?.muted.includes(message.author.id))continue;
          const row=node('article','chat-message'+(message.system?' chat-system':''));row.dataset.messageId=message.id;
          if(message.system){row.append(node('p','',t(message.text)));p.log.append(row);continue;}
          if(message.parts.some(x=>x.type==='player'&&x.id===info?.self))row.classList.add('chat-mentioned');
          const header=node('div','chat-message-header'),author=node('span','chat-author');author.append(avatar(message.author),node('span','',message.author.name));
          const time=node('time','',new Date(message.at).toLocaleTimeString(I18n.language,{hour:'2-digit',minute:'2-digit'}));time.dateTime=new Date(message.at).toISOString();header.append(author,time);row.append(header);
          const body=node('p','chat-text');
          for(const part of message.parts){
            if(part.type==='text')body.append(document.createTextNode(part.text));
            else if(part.type==='player')body.append(node('span','chat-mention','@'+part.label));
            else if(part.type==='route'){
              const route=routeList.find(r=>r.id===part.id),label=route?.label||part.a+' – '+part.b;
              const b=button('',()=>focusRoute(part.id),'chat-route');b.append(routeVisual(route||part,label),node('span','',label));b.disabled=!route;b.title=t('Resaltar tramo');b.dataset.routeId=part.id;body.append(b);
            }
          }
          row.append(body);
          const trigger=iconButton('react','Añadir reacción',event=>{event.stopPropagation();if(popup?.messageId===message.id&&popup.p===p)closePopup();else showReactions(p,message.id,trigger,event.detail===0);},'chat-react-add');
          trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-controls',p.reactions.id);row.append(trigger);longPress(row,p,message.id,trigger);
          const reactions=node('div','chat-reactions');
          for(const reaction of message.reactions||[]){if(!ChatArt.reactions[reaction.emoji])continue;
            const b=reactionButton(reaction.emoji,reaction.mine,()=>request('chat_react',{messageId:message.id,emoji:reaction.mine?null:reaction.emoji}),'chat-reaction-used');
            b.append(node('span','chat-reaction-count',String(reaction.count)));if(animatedId===message.id)b.classList.add('chat-reaction-pop');reactions.append(b);
          }
          if(reactions.childElementCount)row.append(reactions);p.log.append(row);
        }
        if(follow)p.log.scrollTop=p.log.scrollHeight;else p.log.scrollTop=top+(prepend?Math.max(0,p.log.scrollHeight-height):0);
      }
      renderControls();requestAnimationFrame(()=>{panels.forEach(fitInput);markRead();});
    }
    // References have ranges, so two visually identical parallel-route labels
    // keep their distinct route IDs. Editing a reference converts it to text.
    function editDraft(next) {
      let start=0;while(start<draft.length&&start<next.length&&draft[start]===next[start])start++;
      let end=draft.length,nextEnd=next.length;while(end>start&&nextEnd>start&&draft[end-1]===next[nextEnd-1]){end--;nextEnd--;}
      const shift=next.length-draft.length;
      refs=refs.flatMap(ref=>ref.end<=start?[ref]:ref.start>=end?[{...ref,start:ref.start+shift,end:ref.end+shift}]:[]);draft=next;
    }
    function parts() {
      const result=[];let start=0;
      for(const ref of [...refs].sort((a,b)=>a.start-b.start)){
        if(ref.start<start||draft.slice(ref.start,ref.end)!==ref.text)continue;
        if(ref.start>start)result.push({type:'text',text:draft.slice(start,ref.start)});result.push(ref.part);start=ref.end;
      }
      if(start<draft.length)result.push({type:'text',text:draft.slice(start)});return result;
    }
    function submit() {if(!info?.canWrite||!available()||pending||!draft.trim())return;closePopup();pending=request('chat_send',{parts:parts()});renderControls();}
    function suggestions(p) {
      const caret=p.input.selectionStart,prefix=draft.slice(0,caret),match=prefix.match(/(?:^|[\s(])@([^@\n[\]]{0,60})$/),at=prefix.lastIndexOf('@');
      const hide=()=>{if(popup?.p===p&&popup.kind==='suggestions')closePopup();};
      if(!match||!info||refs.some(ref=>ref.start===at&&ref.end<=caret)){hide();return;}
      const normalize=value=>value.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase(),q=normalize(match[1]);
      const choices=[...(info.people||[]).map(person=>({kind:'player',label:person.name,text:'@'+person.name,person,part:{type:'player',id:person.id}})),
        ...routes().map(route=>({kind:'route',label:route.label,text:'@['+route.label+']',route,part:{type:'route',id:route.id}}))]
        .filter(item=>normalize(item.label).includes(q)).slice(0,12);
      p.suggestions.replaceChildren();p.options=[];p.selected=0;
      if(!choices.length){hide();return;}
      for(const item of choices){
        const b=button('',()=>{
          const next=draft.slice(0,at)+item.text+' '+draft.slice(caret);editDraft(next);refs.push({start:at,end:at+item.text.length,text:item.text,part:item.part});
          panels.forEach(panel=>panel.input.value=draft);closePopup();p.input.focus();p.input.setSelectionRange(at+item.text.length+1,at+item.text.length+1);panels.forEach(fitInput);renderControls();
        },'chat-option chat-option-'+item.kind);
        b.dataset.kind=item.kind;b.dataset.referenceId=item.part.id;b.id=p.input.id+'Option'+p.options.length;
        b.append(item.person?avatar(item.person):routeVisual(item.route,item.label),node('span','chat-option-label',item.label));
        b.setAttribute('role','option');b.setAttribute('aria-selected',String(p.options.length===0));
        if(item.route?.lanes>1)b.setAttribute('aria-label',item.label+' · '+t('Vía paralela')+' '+(item.route.lane+1));
        b.onpointerdown=event=>event.preventDefault();p.options.push(b);p.suggestions.append(b);
      }
      openPopup(p,'suggestions',p.suggestions,p.composer);p.input.setAttribute('aria-expanded','true');p.input.setAttribute('aria-activedescendant',p.options[0].id);
    }
    function floating(cls,id,role,label) {const el=node('div','chat-popover '+cls);el.id=id;el.hidden=true;el.setAttribute('popover','manual');el.setAttribute('role',role);el.setAttribute('aria-label',t(label));document.body.append(el);return el;}
    function mount(root,id) {
      root.replaceChildren();root.classList.add('chat-panel');
      const toolbar=node('div','chat-toolbar'),log=node('div','chat-messages');log.setAttribute('role','log');log.setAttribute('aria-live','polite');log.setAttribute('aria-label',t('Mensajes'));log.tabIndex=0;
      const older=button(t('Mensajes anteriores'),()=>{if(!info||syncing)return;syncing=true;p.following=false;send({type:'chat_sync',chatId:info.chatId,before});renderControls();},'chat-older');
      const latest=button(t('Mensajes nuevos'),()=>{p.following=true;log.scrollTop=log.scrollHeight;markRead();},'chat-latest');latest.hidden=true;
      const feedback=node('p','chat-feedback');feedback.setAttribute('role','status');
      const composer=node('form','chat-composer'),input=node('textarea','');input.id=id+'Input';input.rows=2;input.maxLength=1200;input.setAttribute('aria-label',t('Escribir mensaje'));
      const suggestionList=floating('chat-suggestions',id+'Suggestions','listbox','Mencionar jugador o tramo');input.setAttribute('aria-controls',suggestionList.id);input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-expanded','false');
      const people=floating('chat-people',id+'People','dialog','Silenciar jugadores'),reactions=floating('chat-reaction-picker',id+'Reactions','dialog','Reaccionar al mensaje'),count=node('small','chat-count');
      const p={root,toolbar,log,older,latest,people,reactions,feedback,composer,input,count,suggestions:suggestionList,options:[],selected:0,following:true};
      const mute=iconButton('sound','Silenciar jugadores',event=>{event.preventDefault();event.stopPropagation();if(popup?.el===people)closePopup();else{renderPeople(p);openPopup(p,'people',people,mute);people.querySelector('button')?.focus();}},'chat-mute-button');
      mute.setAttribute('aria-haspopup','dialog');mute.setAttribute('aria-expanded','false');mute.setAttribute('aria-controls',people.id);p.mute=mute;
      const sendButton=iconButton('send','Enviar mensaje',submit,'chat-send');p.send=sendButton;
      composer.onsubmit=event=>{event.preventDefault();submit();};composer.append(input,sendButton);
      input.oninput=()=>{editDraft(input.value);panels.filter(x=>x!==p).forEach(x=>x.input.value=draft);feedback.textContent='';panels.forEach(fitInput);suggestions(p);renderControls();};
      input.onclick=()=>suggestions(p);
      input.onkeydown=event=>{
        if(event.isComposing)return;
        if(popup?.el===p.suggestions&&['ArrowDown','ArrowUp'].includes(event.key)){
          event.preventDefault();event.stopPropagation();p.selected=(p.selected+(event.key==='ArrowDown'?1:-1)+p.options.length)%p.options.length;
          p.options.forEach((b,i)=>b.setAttribute('aria-selected',String(i===p.selected)));p.input.setAttribute('aria-activedescendant',p.options[p.selected].id);p.options[p.selected].scrollIntoView({block:'nearest'});return;
        }
        if(event.key==='Escape'&&popup){event.preventDefault();event.stopPropagation();closePopup();return;}
        if(event.key==='Enter'&&!event.shiftKey){
          if(popup?.el===p.suggestions){event.preventDefault();event.stopPropagation();p.options[p.selected]?.click();}
          else if(!matchMedia('(pointer:coarse)').matches){event.preventDefault();event.stopPropagation();submit();}
        }
      };
      input.onblur=()=>setTimeout(()=>{if(popup?.kind==='suggestions'&&popup.p===p&&document.activeElement!==p.input&&!p.suggestions.contains(document.activeElement))closePopup();},150);
      log.onscroll=()=>{if(shown(p))p.following=atBottom(p);markRead();positionPopup();};
      toolbar.append(node('strong','',t('Chat')),mute);if(id==='roomChat')root.append(toolbar);
      root.append(older,log,latest,feedback,composer,count);panels.push(p);
      let width=0;new ResizeObserver(entries=>{const next=entries[0].contentRect.width;if(next!==width){width=next;changed();}}).observe(root);
    }
    mount(document.querySelector('#roomChatPanel'),'roomChat');mount(document.querySelector('#tableChat .chat-body'),'tableChat');
    for(const target of [document.querySelector('#tableChat summary > span'),document.querySelector('[data-panel="chat"]'),document.querySelector('[data-room-tab="chat"]')]){
      const badge=node('span','chat-badge');badge.dataset.chatBadge='';badge.hidden=true;target?.append(badge);
    }
    document.querySelector('#tableChat').addEventListener('toggle',()=>{if(document.querySelector('#tableChat').open)panels[1].following=true;changed();});
    document.addEventListener('pointerdown',event=>{if(popup&&!popup.el.contains(event.target)&&!popup.anchor.contains(event.target))closePopup();},true);
    document.addEventListener('keydown',event=>{
      if(!popup)return;
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closePopup(true);}
      else if(popup.el.contains(event.target)&&['ArrowRight','ArrowLeft','ArrowDown','ArrowUp'].includes(event.key)){
        const buttons=[...popup.el.querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(document.activeElement);if(!buttons.length)return;
        event.preventDefault();event.stopPropagation();buttons[(index+(['ArrowRight','ArrowDown'].includes(event.key)?1:-1)+buttons.length)%buttons.length].focus();
      }
    },true);
    document.addEventListener('click',()=>requestAnimationFrame(markRead));document.addEventListener('visibilitychange',()=>{if(!document.hidden)changed();else closePopup();});
    window.addEventListener('resize',changed);window.visualViewport?.addEventListener('resize',changed);window.visualViewport?.addEventListener('scroll',positionPopup);
    render();return {receive,reset,disconnected,changed,refresh:()=>render(),get info(){return info;}};
  }
  return {create};
})();
