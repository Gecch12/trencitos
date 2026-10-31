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
    $('moreGroups').innerHTML = groups.map(([name, items]) => `<section class="more-group"><h2>${name}</h2>${items.length ? `<div class="menu-list">${items.map(([label,icon]) => {
      if (label === 'Language') return `<button type="button" class="menu-row" data-language>${ShellIcons.svg(icon)}<span>${label}</span><small>ESP</small>${ShellIcons.svg('chevron')}</button>`;
      return `<a class="menu-row" href="${label === 'Privacy' ? '/privacy.html' : '/more?section='+slug(label)}" ${label === 'Privacy' ? '' : `data-content="${slug(label)}"`}>${ShellIcons.svg(icon)}<span>${label}</span>${ShellIcons.svg('chevron')}</a>`;
    }).join('')}</div>` : ''}</section>`).join('');
    $('socialIcons').innerHTML = ['Discord','YouTube','Reddit','Instagram','Facebook','X'].map(name => `<span class="social-icon" role="img" aria-label="${name}" title="${name}">${ShellIcons.svg(name.toLowerCase())}</span>`).join('');
    ShellIcons.mount();

    function identity() { for (const el of document.querySelectorAll('[data-username]')) el.textContent = $('nickname').value || 'Jugador'; }
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
      if (section) $('contentTitle').textContent = titles.get(section);
      for (const link of document.querySelectorAll('.app-nav [data-page]')) {
        link.classList.toggle('active', link.dataset.page === page);
        if (link.dataset.page === page) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current');
      }
      $('returnRoom').hidden = !state().room || page === 'rooms';
      if (page === 'profile') {
        const tab = ['account','friends','history','overview'].includes(url.searchParams.get('tab')) ? url.searchParams.get('tab') : 'account';
        $('profileTitle').textContent = tab[0].toUpperCase()+tab.slice(1);
        $('accountPanel').hidden = tab !== 'account';
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
      if (!name || name.length > 24 || /[<>"'&\p{Cc}]/u.test(name)) { $('profileError').textContent='Elige un nombre de 1 a 24 caracteres, sin símbolos especiales.'; return; }
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
    for (const id of ['roomVisibility','roomCapacity']) $(id).onchange = () => send({ type:'room_settings',visibility:$('roomVisibility').value,maxPlayers:+$('roomCapacity').value });

    function renderDirectory() {
      const rows = directory.filter(r => r.started === (directoryTab === 'spectate'));
      $('directoryRows').innerHTML = rows.map(r => {
        const full = !r.started && r.members.length >= r.maxPlayers;
        const own = !!localStorage.getItem('rr-room-'+r.code);
        const seats = Array.from({length:r.maxPlayers},(_,i)=>r.members[i]);
        return `<tr data-room-code="${escape(r.code)}" class="${full && !own?'room-full':''}"><td><button type="button" data-directory-room="${escape(r.code)}" ${full && !own?'disabled':''} aria-label="${r.started?'Observar':own?'Retomar':'Unirse a'} sala ${escape(r.code)}">${escape(r.mode)}<small>#${escape(r.code)}</small></button></td><td>${escape(r.map)}</td><td>${r.turnSeconds}s</td><td><div class="directory-seats" aria-label="${r.members.length} de ${r.maxPlayers} jugadores">${seats.map(m=>`<span class="${m?'':'empty-seat'}" ${m?`title="${escape(m.name)}"`:''}>${ShellIcons.svg(m?.bot?'bot':'user')}</span>`).join('')}</div></td></tr>`;
      }).join('');
      for (const button of $('directoryRows').querySelectorAll('[data-directory-room]')) button.onclick = () => {
        if (directoryTab === 'spectate') watchRoom(button.dataset.directoryRoom);
        else joinRoom(button.dataset.directoryRoom);
      };
      $('directoryEmpty').hidden = !!rows.length;
      $('directoryEmpty').querySelector('h1').textContent = directoryUnavailable ? 'Salas no disponibles' : directoryTab === 'spectate' ? 'Aún no hay partidas en curso' : 'No hay salas abiertas';
      $('directoryEmpty').querySelector('p').textContent = directoryUnavailable ? 'El servidor está recuperando el guardado.' : directoryTab === 'spectate' ? 'Las partidas públicas aparecerán aquí.' : 'Crea una sala e invita a jugar.';
    }
    function renderRoom() {
      const s = state();
      $('mobileRoomCode').textContent = s.room;
      $('roomCount').textContent = `${s.members.length}/${s.maxPlayers}`;
      $('roomInviteLink').value = location.origin+'/?room='+s.room;
      $('roomVisibility').value = s.visibility;
      $('roomCapacity').value = s.maxPlayers;
      $('roomVisibility').disabled = $('roomCapacity').disabled = !s.host || s.busy || s.started;
      for (const option of $('roomCapacity').options) option.disabled = +option.value < s.members.length;
      $('roomVisibilityHint').textContent = s.visibility === 'public' ? 'Visible en Open Rooms. La partida se podrá observar.' : 'Solo podrán entrar quienes tengan el código o el enlace.';
      $('waitingHost').hidden = s.host;
      const full = s.members.length >= s.maxPlayers;
      $('roomFriendsMessage').textContent = full ? 'La sala está llena. No puedes invitar a más amigos.' : 'Tus amigos aparecerán aquí. Mientras tanto, comparte el enlace de la sala.';
      $('emptySeats').innerHTML = Array.from({length:Math.max(0,s.maxPlayers-s.members.length)},(_,i)=>`<div class="empty-player">${s.host?`<button type="button" class="add-bot" data-add-bot ${s.busy?'disabled':''}>${ShellIcons.svg('bot')}Añadir bot</button>`:`${ShellIcons.svg('user')}<span>Plaza disponible</span>`}</div>`).join('');
      for (const el of $('emptySeats').querySelectorAll('[data-add-bot]')) el.onclick = () => { el.disabled=true; send({type:'add_bot'}); };
    }
    function joined() {
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
    return {identity,renderRoom,joined,reset,receiveDirectory(message){directory=message.rooms;directoryUnavailable=message.unavailable;renderDirectory();},availability(){ $('openJoin').disabled=state().busy; if(state().room)renderRoom(); }};
  }
  return { create };
})();
