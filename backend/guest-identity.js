"use strict";
const {randomBytes,createHash}=require('node:crypto');
const {isNativeRequest,nativeToken}=require('./native-client');
const cookieName='trencitos_guest';
function guestId(req) {
  const token=isNativeRequest(req)?nativeToken(req):(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  return /^[a-f0-9]{64}$/.test(token||'')?createHash('sha256').update(token).digest('hex'):null;
}
function ensureGuest(req,res,rotate=false) {
  const old=guestId(req);if(old&&!rotate)return old;
  const token=randomBytes(32).toString('hex');
  const secure=req.socket?.encrypted||req.headers['x-forwarded-proto']==='https';
  res.setHeader('Set-Cookie',[...(res.getHeader('Set-Cookie')||[]),`${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure?'; Secure':''}`]);
  return createHash('sha256').update(token).digest('hex');
}
module.exports={guestId,ensureGuest};
