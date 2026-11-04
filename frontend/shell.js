"use strict";
const AppShell = (() => {
  const $ = id => document.getElementById(id);
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function create({ state, send, saveProfile, joinRoom, watchRoom, leaveRoom }) {
    let page = 'rooms', joinedRoom = null, directory = [], directoryTab = 'open', directoryUnavailable = false;
    const groups = [
      ['Game', [['Patch Notes','settings'],['Language','globe'],['Rules','book'],['FAQ','help']]],
      ['Community', [['Creators','edit'],['Tournaments','trophy'],['Join Discord','discord']]],
      ['Blog', []],
      ['Company', [['About','info'],['Careers','briefcase'],['Privacy','shield']]],
    ];
    const slug = name => name.toLowerCase().replaceAll(' ', '-');
    const titles = new Map(groups.flatMap(([,items]) => items.map(([name]) => [slug(name),name])));
    $('moreGroups').innerHTML = groups.map(([name, items]) => `<section class="more-group"><h2>${I18n.t(name)}</h2>${items.length ? `<div class="menu-list">${items.map(([label,icon]) => {
      if (label === 'Language') return `<button type="button" class="menu-row" data-language>${ShellIcons.svg(icon)}<span>${I18n.t(label)}</span><small>ESP</small>${ShellIcons.svg('chevron')}</button>`;
      return `<a class="menu-row" href="${label === 'Privacy' ? '/privacy.html' : '/more?section='+slug(label)}" ${label === 'Privacy' ? '' : `data-content="${slug(label)}"`}>${ShellIcons.svg(icon)}<span>${I18n.t(label)}</span>${ShellIcons.svg('chevron')}</a>`;
    }).join('')}</div>` : ''}</section>`).join('');
    $('socialIcons').innerHTML = ['Discord','YouTube','Reddit','Instagram','Facebook','X'].map(name => `<span class="social-icon" role="img" aria-label="${name}" title="${name}">${ShellIcons.svg(name.toLowerCase())}</span>`).join('');
    ShellIcons.mount();
    for (const el of document.querySelectorAll('.sidebar-language span, [data-language] small')) el.textContent = I18n.language === 'en' ? 'ENG' : 'ESP';
    $('languageSelect').value = I18n.language;
    $('languageSelect').onchange = event => { if (event.target.value !== I18n.language && I18n.select(event.target.value)) location.reload(); };

    function identity() { for (const el of document.querySelectorAll('[data-username]')) el.textContent = $('nickname').value || I18n.t('Jugador'); }
    function route(url = new URL(location.href), push = false) {
      if (state().game) return;
      page = url.pathname.split('/')[1] || 'rooms';
      if (!['rooms','play','more','profile'].includes(page)) page = 'rooms';
      const section = page === 'more' && titles.has(url.searchParams.get('section')) ? url.searchParams.get('section') : null;
      if (push) history.pushState(null, '', url.pathname + url.search);
      for (const el of document.querySelectorAll('.shell-page')) el.hidden = true;
      $('roompanel').classList.add('hidden');
      document.body.classList.toggle('in-room', page === 'rooms' && !!state().room);
      if (page === 'rooms' && state().room) $('roompanel').classList.remove('hidden');
      else $(section ? 'contentPage' : page+'Page').hidden = false;
      if (section) $('contentTitle').textContent = I18n.t(titles.get(section));
      for (const link of document.querySelectorAll('.app-nav [data-page]')) {
        link.classList.toggle('active', link.dataset.page === page);
        if (link.dataset.page === page) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current');
      }
      $('returnRoom').hidden = !state().room || page === 'rooms';
      if (page === 'profile') {
        const tab = ['account','friends','history','overview'].includes(url.searchParams.get('tab')) ? url.searchParams.get('tab') : 'account';
        $('profileTitle').textContent = I18n.t(tab[0].toUpperCase()+tab.slice(1));
        $('accountPanel').hidden = tab !== 'account';
        HistoryUI.profile(tab);
        for (const link of document.querySelectorAll('[data-profile]')) {
          link.classList.toggle('active',link.dataset.profile === tab);
          if (link.dataset.profile === tab) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current');
        }
      }
      if (page === 'rooms') renderDirectory();
    }
    const navigate = path => route(new URL(path,location.origin), true);
    document.addEventListener('click', event => {
      const target = event.target.closest('[data-page], [data-profile], [data-content]');
      if (location.pathname === '/replay') return;
      if (!target || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button) return;
      event.preventDefault(); navigate(target.getAttribute('href'));
    });
    window.addEventListener('popstate', () => route());
    $('backMore').onclick = () => navigate('/more');
    $('returnRoom').onclick = () => navigate('/rooms?room='+state().room);
    $('leaveWatch').onclick = leaveRoom;
    $('leaveMobileRoom').onclick = leaveRoom;
    for (const el of document.querySelectorAll('[data-language]')) el.onclick = () => $('languageDialog').showModal();
    for (const el of document.querySelectorAll('[data-close-dialog]')) el.onclick = () => el.closest('dialog').close();
    for (const dialog of document.querySelectorAll('.shell-dialog')) dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
    });
    $('openJoin').onclick = () => { $('joinCodeError').textContent=''; $('joinDialog').showModal(); $('code').focus(); };
    $('editProfile').onclick = () => { $('profileName').value=$('nickname').value; $('profileError').textContent=''; $('profileDialog').showModal(); $('profileName').focus(); };
    $('profileForm').onsubmit = async event => {
      event.preventDefault();
      const name = $('profileName').value.trim();
      if (!name || name.length > 24 || /[<>"'&\p{Cc}]/u.test(name)) { $('profileError').textContent=I18n.t('Elige un nombre de 1 a 24 caracteres, sin símbolos especiales.'); return; }
      $('saveProfile').disabled = true; $('profileError').textContent='';
      try { await saveProfile(name); identity(); $('profileDialog').close(); }
      catch(error) { $('profileError').textContent=error.message; }
      finally { $('saveProfile').disabled=false; }
    };
    function setupTabs(selector, select) {
      const tabs = [...document.querySelectorAll(selector)];
      for (const [i, tab] of tabs.entries()) {
        tab.onclick = () => { tabs.forEach(t=>{t.setAttribute('aria-selected',String(t===tab));t.tabIndex=t===tab?0:-1;}); select(tab); };
        tab.onkeydown = event => {
          const n=event.key==='ArrowRight'?(i+1)%tabs.length:event.key==='ArrowLeft'?(i+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:null;
          if(n!==null){event.preventDefault();tabs[n].click();tabs[n].focus();}
        };
      }
    }
    setupTabs('[data-directory]', tab => { directoryTab=tab.dataset.directory; $('roomDirectory').setAttribute('aria-labelledby',tab.id); renderDirectory(); });
    setupTabs('button[data-room-tab]', tab => { $('roompanel').dataset.roomTab=tab.dataset.roomTab; });
    const settings = {
      roomCapacity: { values: [2,3,4,5], key: 'maxPlayers' },
      roomTurnSeconds: { values: GameTiming.options.turnSeconds, key: 'turnSeconds' },
      roomTicketExtra: { values: GameTiming.options.ticketExtraSeconds, key: 'ticketExtraSeconds' },
      roomInitialSeconds: { values: GameTiming.options.initialSeconds, key: 'initialSeconds' },
    };
    const configure = patch => {
      const s = state();
      if (!s.host || s.busy || s.started) return;
      send({ type:'room_settings', visibility:s.visibility, maxPlayers:s.maxPlayers, mapRef:s.mapRef, timing:GameTiming.normalize(s.timing), ...patch });
    };
    for (const [id, spec] of Object.entries(settings)) {
      const group = document.querySelector(`[data-setting="${id}"]`);
      group.innerHTML = `<button type="button" data-step="-1" aria-label="${I18n.t('Disminuir')}">‹</button><div>${id === 'roomTicketExtra' ? '<span aria-hidden="true">+</span>' : ''}<input id="${id}" type="number" readonly min="${spec.values[0]}" max="${spec.values.at(-1)}" step="${id === 'roomCapacity' ? 1 : id === 'roomTicketExtra' ? 15 : 30}" />${id === 'roomCapacity' ? '' : '<span aria-hidden="true">s</span>'}</div><button type="button" data-step="1" aria-label="${I18n.t('Aumentar')}">›</button>`;
      const adjust = step => {
        const s=state(), values=spec.values.filter(value=>id!=='roomCapacity'||value>=s.members.length);
        const next=values[values.indexOf(+$(id).value)+step];
        if (next === undefined) return;
        configure(id === 'roomCapacity' ? {maxPlayers:next} : {timing:{...GameTiming.normalize(s.timing),[spec.key]:next}});
      };
      group.querySelectorAll('button').forEach(button=>button.onclick=()=>adjust(+button.dataset.step));
      $(id).onkeydown = event => {
        if (!['ArrowLeft','ArrowDown','ArrowRight','ArrowUp'].includes(event.key)) return;
        event.preventDefault(); adjust(['ArrowLeft','ArrowDown'].includes(event.key) ? -1 : 1);
      };
    }
    $('roomVisibility').onclick=()=>configure({visibility:state().visibility==='public'?'private':'public'});
    const mapPicker = RoomMapPicker.create({
      container: $('roomMapCards'), hint: $('roomMapScrollHint'),
      options: MapOptions.options, layouts: [EuropeLayoutV1,LaboratoryLayoutV1,SouthAmericaLayoutV33],
      select: option => configure({mapRef:MapOptions.reference(option)}), translate: text => I18n.t(text),
    });

    function renderDirectory() {
      const rows = directory.filter(r => r.started === (directoryTab === 'spectate'));
      $('directoryRows').innerHTML = rows.map(r => {
        const full = !r.started && r.members.length >= r.maxPlayers;
        const own = !!localStorage.getItem('rr-room-'+r.code);
        const seats = Array.from({length:r.maxPlayers},(_,i)=>r.members[i]);
        return I18n.t`<tr data-room-code="${escape(r.code)}" class="${full && !own?'room-full':''}"><td><button type="button" data-directory-room="${escape(r.code)}" ${full && !own?'disabled':''} aria-label="${r.started?I18n.t('Observar'):own?I18n.t('Retomar'):I18n.t('Unirse a')} sala ${escape(r.code)}">${escape(I18n.t(r.mode))}<small>#${escape(r.code)}</small></button></td><td>${escape(I18n.t(r.map))}</td><td>${r.turnSeconds}s</td><td><div class="directory-seats" aria-label="${r.members.length} de ${r.maxPlayers} jugadores">${seats.map(m=>`<span class="${m?'':'empty-seat'}" ${m?`title="${escape(m.name)}"`:''}>${ShellIcons.svg(m?.bot?'bot':'user')}</span>`).join('')}</div></td></tr>`;
      }).join('');
      for (const button of $('directoryRows').querySelectorAll('[data-directory-room]')) button.onclick = () => {
        if (directoryTab === 'spectate') watchRoom(button.dataset.directoryRoom);
        else joinRoom(button.dataset.directoryRoom);
      };
      $('directoryEmpty').hidden = !!rows.length;
      $('directoryEmpty').querySelector('h1').textContent = directoryUnavailable ? I18n.t('Salas no disponibles') : directoryTab === 'spectate' ? I18n.t('Aún no hay partidas en curso') : I18n.t('No hay salas abiertas');
      $('directoryEmpty').querySelector('p').textContent = directoryUnavailable ? I18n.t('El servidor está recuperando el guardado.') : directoryTab === 'spectate' ? I18n.t('Las partidas públicas aparecerán aquí.') : I18n.t('Crea una sala e invita a jugar.');
    }
    function renderRoom() {
      const s = state();
      $('mobileRoomCode').textContent = s.room;
      $('roomCount').textContent = `${s.members.length}/${s.maxPlayers}`;
      $('roomInviteLink').value = TrencitosConnection.publicUrl('/?room='+s.room);
      $('roomVisibility').value = s.visibility;
      const locked = !s.host || s.busy || s.started;
      mapPicker.render(s.mapRef,locked);
      $('roomMapAccess').textContent = s.host ? '' : I18n.t('El anfitrión elige el mapa');
      $('roomVisibility').disabled = locked;
      $('roomVisibility').querySelector('[data-visibility-icon]').innerHTML = ShellIcons.svg(s.visibility === 'public' ? 'globe' : 'lock');
      $('roomVisibility').querySelector('strong').textContent = I18n.t(s.visibility === 'public' ? 'Pública' : 'Privada');
      $('roomVisibility').dataset.visibility = s.visibility;
      $('roomVisibility').setAttribute('aria-label', I18n.t(s.visibility === 'public' ? 'Visibilidad: pública. Cambiar a privada' : 'Visibilidad: privada. Cambiar a pública'));
      const timing = GameTiming.normalize(s.timing);
      for (const [id,spec] of Object.entries(settings)) {
        const value=id==='roomCapacity'?s.maxPlayers:timing[spec.key], input=$(id), group=input.closest('.room-stepper');
        input.value=value; input.disabled=locked;
        input.min=id==='roomCapacity'?Math.max(2,s.members.length):spec.values[0];
        input.setAttribute('aria-valuetext', id==='roomCapacity'?I18n.t`${value} jugadores`:I18n.t`${value} segundos`);
        for (const button of group.querySelectorAll('button')) {
          const next=spec.values[spec.values.indexOf(value)+ +button.dataset.step];
          button.disabled=locked||next===undefined||(id==='roomCapacity'&&next<s.members.length);
        }
      }
      $('roomVisibilityHint').textContent = s.visibility === 'public' ? I18n.t('Visible en Open Rooms. La partida se podrá observar.') : I18n.t('Solo podrán entrar quienes tengan el código o el enlace.');
      $('waitingHost').hidden = s.host;
      const full = s.members.length >= s.maxPlayers;
      $('roomFriendsMessage').textContent = full ? I18n.t('La sala está llena. No puedes invitar a más amigos.') : I18n.t('Tus amigos aparecerán aquí. Mientras tanto, comparte el enlace de la sala.');
      $('emptySeats').innerHTML = Array.from({length:Math.max(0,s.maxPlayers-s.members.length)},(_,i)=>`<div class="empty-player">${s.host?I18n.t`<button type="button" class="add-bot" data-add-bot ${s.busy?'disabled':''}>${ShellIcons.svg('bot')}Añadir bot</button>`:I18n.t`${ShellIcons.svg('user')}<span>Plaza disponible</span>`}</div>`).join('');
      for (const el of $('emptySeats').querySelectorAll('[data-add-bot]')) el.onclick = () => { el.disabled=true; send({type:'add_bot'}); };
    }
    function watchUnavailable() {
      $('lobbyError').textContent='';
      navigate('/rooms');
      $('watchUnavailable').hidden = false;
      $('watchUnavailable').focus();
    }
    function joined() {
      $('watchUnavailable').hidden = true;
      $('joinDialog').close();
      $('lobbyError').textContent='';
      if (!state().started) {
        route(joinedRoom === state().room ? new URL(location.href) : new URL('/rooms?room='+state().room,location.origin));
        renderRoom();
      }
      joinedRoom = state().room;
      document.body.classList.toggle('is-spectating',state().spectator);
      $('leaveWatch').hidden = !state().spectator;
    }
    function reset() {
      joinedRoom = null;
      document.body.classList.remove('is-spectating','in-room');
      $('leaveWatch').hidden=true;
      $('roompanel').dataset.roomTab='players';
      document.querySelector('button[data-room-tab="players"]').click();
      navigate('/rooms'); renderDirectory();
    }
    identity(); route();
    if (new URLSearchParams(location.search).get('room') && !state().room && !localStorage.getItem('rr-room-'+$('code').value)) $('joinDialog').showModal();
    return {identity,renderRoom,joined,reset,watchUnavailable,receiveDirectory(message){directory=message.rooms;directoryUnavailable=message.unavailable;renderDirectory();},availability(){ $('openJoin').disabled=state().busy; if(state().room)renderRoom(); }};
  }
  return { create };
})();
