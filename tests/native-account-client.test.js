"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
const source=fs.readFileSync(require.resolve('../frontend/connection.js'),'utf8');
function client({storage=new Map(),vault={value:''},locked=false}={}) {
  let challenge,reads=0;const calls=[];
  const sandbox={URL,Headers,Response,TextEncoder,btoa,crypto:crypto.webcrypto,location:{origin:'capacitor://localhost'},TRENCITOS_BUILD:{server:'https://game.example'},
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    Capacitor:{Plugins:{NativeAccount:{
      async getSession(){reads++;if(locked&&reads===1)throw Error('Locked');return {value:vault.value};},
      async setSession({value}){vault.value=value;},
      async authenticate({url}){assert.equal(url,'https://game.example/auth/native?flow=public');return {url:'trencitos://auth?code=single-use'};},
    }}},
    fetch:async(url,options)=>{
      const path=new URL(url).pathname,body=options.body?JSON.parse(options.body):null;calls.push({path,body,options});
      if(path.endsWith('/native/start')){challenge=body.challenge;return Response.json({url:'https://game.example/auth/native?flow=public'});}
      if(path.endsWith('/native/exchange')){
        assert.equal(body.code,'single-use');assert.equal(crypto.createHash('sha256').update(body.verifier).digest('base64url'),challenge);
        return Response.json({ok:true},{headers:{'X-Trencitos-Session':'sealed-account'}});
      }
      return Response.json({enabled:true});
    },
  };
  vm.runInNewContext(source,sandbox);return {api:sandbox.TrencitosConnection,calls,storage,vault};
}
test('native client completes a verifier-bound transfer, keeps session out of localStorage and restores it on cold start',async()=>{
  const first=client();await first.api.login();assert.equal(first.vault.value,'sealed-account');
  assert.equal([...first.storage.values()].some(value=>value==='sealed-account'),false);
  const second=client(first);await second.api.request('/api/account');const request=second.calls.at(-1);
  assert.equal(request.options.headers.get('X-Trencitos-Session'),'sealed-account');assert.equal(request.options.credentials,'omit');
  const originalGuest=request.options.headers.get('X-Trencitos-Guest');
  await second.api.forgetAccount();await second.api.request('/api/account');
  assert.equal(second.vault.value,'');assert.equal(second.calls.at(-1).options.headers.get('X-Trencitos-Session'),null);
  assert.notEqual(second.calls.at(-1).options.headers.get('X-Trencitos-Guest'),originalGuest);
});
test('unlocking secure storage allows retry instead of caching a rejected initialization forever',async()=>{
  const f=client({locked:true,vault:{value:'sealed-account'}});
  await assert.rejects(f.api.request('/api/account'),/Locked/);await f.api.request('/api/account');
  assert.equal(f.calls.at(-1).options.headers.get('X-Trencitos-Session'),'sealed-account');
});
