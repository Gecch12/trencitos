"use strict";
const AccountUI = (() => {
  function create({selection,applyProfile,currentSeat}) {
    const el = id=>document.getElementById(id);
    let profile=null, enabled=false, timer=null, saving=Promise.resolve(), linked='', binding='';
    let editing=0, loading=true, stopped=false;
    const initial = selection();
    async function api(path,data) {
      const response = await fetch('/api/account'+path,{credentials:'same-origin',cache:'no-store',
        ...(data ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)} : {})});
      const value = await response.json();
      if (!response.ok) {
        if (response.status===401) { profile=null; render(); }
        throw Error(value.message || 'No pudimos conectar con tu cuenta.');
      }
      return value;
    }
    function message(text) { el('accountStatus').textContent=text; }
    function render() {
      el('googleLogin').hidden=!!profile;
      el('googleLogin').disabled=!enabled || loading;
      el('accountLogout').hidden=!profile;
      el('accountRetry').hidden=true;
      el('accountRetry').textContent='Reintentar guardado';
      el('accountRooms').replaceChildren();
      el('accountLabel').textContent=profile?'Tu cuenta':'Juega como invitado o guarda tu perfil';
    }
    async function listRooms() {
      if (!profile) return;
      const data = await api('/rooms');
      const root = el('accountRooms'); root.replaceChildren();
      for (const r of data.rooms) {
        if (r.code===currentSeat()?.code) continue;
        const button=document.createElement('button'); button.type='button';
        button.textContent=`Retomar sala ${r.code}`;
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
      message('Guardando tu perfil…');
      saving=saving.catch(()=>{}).then(async()=>{
        if (!profile || profile.id!==accountId || stopped) return;
        const value=await api('/profile',data);
        if (!profile || profile.id!==accountId) return;
        profile=value.profile;
        if (editing===revision) { message('Nombre y vagón guardados en tu cuenta.'); el('accountRetry').hidden=true; }
      }).catch(error=>{message(error.message);el('accountRetry').hidden=!profile;});
    }
    function changed() {
      editing++;
      if (!profile || loading) return;
      message('Cambios sin guardar…'); clearTimeout(timer); timer=setTimeout(save,600);
    }
    async function linkSeat() {
      const seat=currentSeat();
      if (!profile || !seat || seat.practice || !seat.token) return;
      const stamp=profile.id+':'+seat.code+':'+seat.token;
      if (linked===stamp || binding===stamp) return;
      binding=stamp;
      try { await api('/link',{code:seat.code,token:seat.token}); linked=stamp; }
      catch(error) { message(error.message); }
      finally { if(binding===stamp) binding=''; }
    }
    el('googleLogin').onclick=async()=>{
      el('googleLogin').disabled=true; message('Abriendo Google…');
      try { const result=await api('/google',{}); location.assign(result.url); }
      catch(error) {message(error.message);el('googleLogin').disabled=!enabled;}
    };
    el('accountLogout').onclick=async()=>{
      stopped=true; clearTimeout(timer); el('accountLogout').disabled=true;
      await saving;
      try { await api('/logout',{});profile=null;linked='';render();message('Sesión cerrada. Puedes seguir como invitado.'); }
      catch(error) {message(error.message);}
      finally {stopped=false;el('accountLogout').disabled=false;}
    };
    el('accountRetry').onclick=()=>profile?save():load();
    async function load(){
      loading=true;
      try {
        const value=await api('');enabled=value.enabled;profile=value.profile;loading=false;render();
        if (profile) {
          if (!profile.initialized) { save(); await saving; }
          else if (!editing && !currentSeat() && JSON.stringify(selection())===JSON.stringify(initial)) applyProfile(profile);
          else if (editing) save();
          if (profile?.initialized && !editing) message('Nombre y vagón guardados en tu cuenta.');
          await linkSeat(); await listRooms();
        } else message(enabled?'Tu nombre y vagón podrán acompañarte en otros dispositivos.':'El acceso con Google aún no está disponible. Puedes jugar como invitado.');
      } catch(error) {loading=false;message(error.message);el('accountRetry').hidden=false;el('accountRetry').textContent='Reintentar conexión';}
      const params=new URLSearchParams(location.search);
      if (params.has('auth')) {
        if (params.get('auth')==='error') message('No se completó el acceso con Google. Puedes reintentarlo.');
        params.delete('auth');history.replaceState(null,'',location.pathname+(params.size?'?'+params:'')+location.hash);
      }
    }
    const ready=load();
    return {changed,linkSeat,ready};
  }
  return {create};
})();
