"use strict";

globalThis.TrencitosConnection = (() => {
  const packaged = !!globalThis.TRENCITOS_BUILD?.server;
  const origin = packaged ? new URL(globalThis.TRENCITOS_BUILD.server).origin : location.origin;
  let guest;
  let session=null, sessionReady=null, generation=0;
  const accountPlugin=()=>origin.startsWith('https:')?globalThis.Capacitor?.Plugins?.NativeAccount:null;
  async function loadSession() {
    if(!sessionReady)sessionReady=(async()=>{if(accountPlugin())session=(await accountPlugin().getSession({server:origin})).value||null;})().catch(error=>{sessionReady=null;throw error;});
    return sessionReady;
  }
  function credential() {
    if (!guest) {
      const key = "trencitos-native-guest:" + origin;
      guest = localStorage.getItem(key);
      if (!/^[a-f0-9]{64}$/.test(guest || "")) {
        guest = [...crypto.getRandomValues(new Uint8Array(32))].map(value => value.toString(16).padStart(2, "0")).join("");
        localStorage.setItem(key, guest);
      }
    }
    return guest;
  }
  async function request(path, options = {}) {
    if (!packaged) return fetch(path, options);
    if (!/^\/api\/(?:account|history|stats)(?:[/?]|$)/.test(path)) throw Error("Ruta móvil no permitida.");
    const url = new URL(path, origin);
    if (url.origin !== origin) throw Error("Servidor móvil inválido.");
    const headers = new Headers(options.headers);
    await loadSession();const currentGeneration=generation;
    headers.set("X-Trencitos-Guest", credential());
    if(session)headers.set('X-Trencitos-Session',session);
    const response=await fetch(url, { ...options, credentials: "omit", cache: "no-store", headers });
    if(response.headers.has('X-Trencitos-Session')&&currentGeneration===generation) {
      session=response.headers.get('X-Trencitos-Session')||null;
      await accountPlugin()?.setSession({server:origin,value:session||''});
    }
    return response;
  }
  async function login(provider='google') {
    if(!packaged||!accountPlugin())throw Error('El acceso a tu cuenta requiere actualizar la app.');
    const base64=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
    const verifier=base64(crypto.getRandomValues(new Uint8Array(48)));
    const challenge=base64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
    const post=async(path,data)=>{
      const response=await request('/api/account/native/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
      const result=await response.json();if(!response.ok)throw Error(result.message);return result;
    };
    const {url}=await post('start',{challenge,provider});
    const callback=await accountPlugin().authenticate({server:origin,url});
    const returned=new URL(callback.url);
    if(returned.protocol!=='trencitos:'||returned.hostname!=='auth'||returned.searchParams.has('error'))throw Error('No se completó el acceso. Puedes reintentarlo.');
    await post('exchange',{code:returned.searchParams.get('code'),verifier});
  }
  async function forgetAccount() {
    if(!packaged)return;
    generation++;session=null;await accountPlugin()?.setSession({server:origin,value:''});
    localStorage.removeItem('trencitos-native-guest:'+origin);guest=null;
  }
  function socket() {
    const url = new URL("/socket", origin);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return packaged ? new WebSocket(url, ["trencitos.v1", "guest." + credential()]) : new WebSocket(url);
  }
  return { packaged, request, socket, login, forgetAccount, publicUrl: path => new URL(path, origin).href };
})();
