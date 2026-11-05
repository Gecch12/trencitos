"use strict";
const AccountUI = (() => {
  function create({selection,applyProfile,currentSeat,targetRoom=()=>null,sessionChanged=()=>{}}) {
    const el = id=>document.getElementById(id);
    let profile=null, providers=[], connections=[], enabled=false, timer=null, saving=Promise.resolve(), linked='', binding='';
    let editing=0, loading=true, stopped=false, accountKnown=false;
    async function api(path,data) {
      const response = await TrencitosConnection.request('/api/account'+path,{credentials:'same-origin',cache:'no-store',
        ...(data ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)} : {})});
      const value = await response.json();
      if (!response.ok) {
        if (response.status===401) { profile=null; connections=[]; linked=''; render(); }
        throw Error(I18n.t(value.message) || I18n.t('No pudimos conectar con tu cuenta.'));
      }
      return value;
    }
    function message(text) { el('accountStatus').textContent=I18n.t(text); }
    function render() {
      for(const provider of ['google','discord']) {
        const identity=connections.find(i=>i.provider===provider), login=el(provider+'Login'), unlink=el(provider+'Unlink');
        login.hidden=!!identity;login.disabled=!enabled||loading||!providers.includes(provider);
        login.textContent=I18n.t((profile?'Conectar ':'Continuar con ')+(provider==='google'?'Google':'Discord'));
        unlink.hidden=!identity;unlink.disabled=!connections.some(i=>i.provider!==provider&&providers.includes(i.provider))||loading;
        el(provider+'Identity').textContent=identity?.email||I18n.t(identity?'Conectado':providers.includes(provider)?'Sin conectar':'Pendiente de configuración');
      }
      el('accountLogout').hidden=!profile;
      el('accountRetry').hidden=true;
      el('accountRetry').textContent=I18n.t('Reintentar guardado');
      el('accountRooms').replaceChildren();
      sessionChanged();
      globalThis.dispatchEvent(new Event("profilechange"));
      el('accountLabel').textContent=profile?I18n.t('Tu cuenta'):I18n.t('Juega como invitado o guarda tu perfil');
    }
    async function listRooms() {
      if (!profile) return;
      const data = await api('/rooms');
      const root = el('accountRooms'); root.replaceChildren();
      for (const r of data.rooms) {
        if (r.code===currentSeat()?.code) continue;
        const button=document.createElement('button'); button.type='button';
        button.textContent=I18n.t`Retomar sala ${r.code}`;
        button.onclick=async()=>{
          button.disabled=true;
          try {
            const recovered=await api('/recover',{code:r.code});
            // Same private fragment flow as existing recovery links; cleared by app.js.
            location.assign('/?room='+encodeURIComponent(recovered.code)+'#recover='+encodeURIComponent(recovered.token));
          } catch(error) {message(error.message);button.disabled=false;}
        };
        root.append(button);
      }
    }
    function save() {
      clearTimeout(timer);
      if (!profile || loading || stopped) return;
      const data=selection(), revision=editing, accountId=profile.id;
      message(I18n.t('Guardando tu perfil…'));
      saving=saving.catch(()=>{}).then(async()=>{
        if (!profile || profile.id!==accountId || stopped) return;
        const value=await api('/profile',data);
        if (!profile || profile.id!==accountId) return;
        profile=value.profile;
        if (editing===revision) { message(I18n.t('Nombre y vagón guardados en tu cuenta.')); el('accountRetry').hidden=true; }
      }).catch(error=>{message(error.message);el('accountRetry').hidden=!profile;});
    }
    function changed() {
      editing++;
      if (!profile || loading) return;
      message(I18n.t('Cambios sin guardar…')); clearTimeout(timer); timer=setTimeout(save,600);
    }
    async function linkSeat() {
      const seat=currentSeat();
      if (!profile || !seat || seat.practice || !seat.token) return;
      const stamp=profile.id+':'+seat.code+':'+seat.token;
      if (linked===stamp || binding===stamp) return;
      binding=stamp;
      try { await api('/link',{code:seat.code,token:seat.token}); linked=stamp; sessionChanged(); }
      catch(error) { message(error.message); }
      finally { if(binding===stamp) binding=''; }
    }
    for(const provider of ['google','discord']) {
      el(provider+'Login').onclick=async()=>{
        el(provider+'Login').disabled=true;message(I18n.t('Abriendo acceso…'));
        const returnRoom=currentSeat()?.code||targetRoom();if(LobbyUI.isJoinCode(returnRoom))sessionStorage.setItem('rr-account-return-room',returnRoom);
        try{if(TrencitosConnection.packaged){await TrencitosConnection.login(provider);await load();}else{const result=await api('/'+provider,{});location.assign(result.url);}}
        catch(error){message(error.message);render();}
      };
      el(provider+'Unlink').onclick=async()=>{
        if(!confirm(I18n.t('¿Desvincular esta cuenta? Seguirás entrando con la otra cuenta conectada.')))return;
        el(provider+'Unlink').disabled=true;
        try{const value=await api('/unlink',{provider});connections=value.connections||[];render();message(I18n.t('Cuenta desvinculada.'));}
        catch(error){message(error.message);render();}
      };
    }
    el('accountLogout').onclick=async()=>{
      stopped=true; clearTimeout(timer); el('accountLogout').disabled=true;
      await saving;
      try { await api('/logout',{});await TrencitosConnection.forgetAccount();profile=null;connections=[];linked='';render();message(I18n.t('Sesión cerrada. Puedes seguir como invitado.')); }
      catch(error) {message(error.message);}
      finally {stopped=false;el('accountLogout').disabled=false;}
    };
    el('accountRetry').onclick=()=>profile?save():load();
    async function load(){
      loading=true;
      try {
        const value=await api('');enabled=value.enabled;profile=value.profile;providers=value.providers||[];connections=value.connections||[];loading=false;accountKnown=true;render();
        if (profile) {
          if(!editing)applyProfile(profile);
          if(profile.username)message(I18n.t('Perfil guardado en tu cuenta.'));
          else message(I18n.t('Edita tu perfil para elegir un username único.'));
          await linkSeat(); await listRooms();
        } else message(enabled?I18n.t('Tu nombre y vagón podrán acompañarte en otros dispositivos.'):I18n.t('El acceso con Google aún no está disponible. Puedes jugar como invitado.'));
      } catch(error) {loading=false;message(error.message);el('accountRetry').hidden=false;el('accountRetry').textContent=I18n.t('Reintentar conexión');}
      const params=new URLSearchParams(location.search);
      if (params.has('auth')) {
        if (params.get('auth')==='error') message(I18n.t('No se completó el acceso. Puedes reintentarlo.'));
        params.delete('auth');history.replaceState(null,'',location.pathname+(params.size?'?'+params:'')+location.hash);
      }
    }
    const ready=load();
    async function updateProfile(patch) {
      await ready;
      if (loading || stopped) throw Error(I18n.t('Espera a que termine la conexión con tu cuenta.'));
      if (!accountKnown) throw Error(I18n.t('No pudimos comprobar tu cuenta. Reintenta la conexión antes de guardar.'));
      clearTimeout(timer); editing++;
      await saving;
      const data={...selection(),...patch};
      if(!ProfileRules.validDisplayName(data.displayName||''))throw Error(I18n.t('El nombre visible admite hasta 20 caracteres.'));
      if(data.secondaryColor===data.color)throw Error(I18n.t('El segundo color debe ser diferente del primero.'));
      if(profile&&data.username&&!ProfileRules.validUsername(ProfileRules.normalizeUsername(data.username)))throw Error(I18n.t('Username inválido. Usa entre 3 y 20 letras sin tildes, números o guion bajo.'));
      if(!profile)data.username=null;
      if (profile) {
        const accountId=profile.id, value=await api('/profile',data);
        if (!profile || profile.id!==accountId) throw Error(I18n.t('Tu sesión cambió. Vuelve a intentarlo.'));
        profile=value.profile;
        applyProfile(profile);
        message(I18n.t('Perfil guardado en tu cuenta.'));
      } else {
        applyProfile(data);
        message(I18n.t('Perfil guardado en este dispositivo.'));
      }
      linked='';await linkSeat();render();
    }
    function ownsCurrentSeat() {
      const seat=currentSeat();
      return !!profile && !!seat && linked===profile.id+':'+seat.code+':'+seat.token;
    }
    async function resumeSeat(code,token) {
      await ready;
      if (!accountKnown) throw Error(I18n.t('No pudimos comprobar tu cuenta. Reintenta la conexión para entrar en la sala.'));
      if (!profile) return null;
      const {rooms}=await api('/rooms');
      if (!rooms.some(room=>room.code===code)) return null;
      const recovered=await api('/recover',{code,token,resume:true});
      linked=profile.id+':'+code+':'+recovered.token;
      sessionChanged(); return recovered;
    }
    return {async joinData(){await ready;if(!accountKnown)throw Error(I18n.t('No pudimos comprobar tu cuenta. Reintenta la conexión.'));if(!profile)return {};if(!profile.username){ProfileUI.editIdentity();throw Error(I18n.t('Elige tu username para entrar.'));}const {ticket}=await api('/room-profile');return {accountTicket:ticket};},changed,linkSeat,ready,updateProfile,updateNickname:nickname=>updateProfile({displayName:nickname}),listRooms,resumeSeat,ownsCurrentSeat,get profile(){return profile;}};
  }
  return {create};
})();
