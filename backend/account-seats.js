"use strict";
const crypto = require('node:crypto');
const { hashToken } = require('./room-store');
const { isJoinCode } = require('../shared/lobby-ui');
const reject = (status,message) => { throw Object.assign(new Error(message),{status}); };

// Always invoked with a server-verified account ID, never an ID from the body.
function createAccountSeats({rooms, dispatch, sendRoom, unavailable}) {
  return async function accountSeats(action,accountId,input,profile) {
    if (action === 'rooms') return {rooms:[...rooms.values()].filter(r=>!r.practice && r.members.some(m=>m.accountId===accountId&&!m.participation?.definitive)).map(r=>({code:r.code,started:!!r.game,nickname:r.members.find(m=>m.accountId===accountId).name}))};
    let result, failure;
    await dispatch(() => {
      try {
        if (unavailable()) reject(503,'No podemos guardar tu puesto ahora. Inténtalo de nuevo.');
        const r = isJoinCode(input.code) && rooms.get(input.code);
        if (!r || r.practice) reject(404,'La sala ya no está disponible.');
        if (action === 'link') {
          if (typeof input.token !== 'string' || !/^[a-f0-9]{48}$/.test(input.token)) reject(403,'No se pudo verificar tu puesto.');
          const hash = hashToken(input.token);
          const member = r.members.find(m=>!m.bot && (m.tokenHash === hash || m.token === input.token));
          if (!member || (member.accountId && member.accountId !== accountId)) reject(403,'Este puesto no se puede vincular a tu cuenta.');
          if (r.members.some(m=>m!==member && m.accountId===accountId)) reject(409,'Tu cuenta ya tiene otro puesto en esta sala.');
          member.accountId = accountId;
          if(profile && !r.game) { member.username=profile.username; member.displayName=profile.displayName; member.avatar=profile.avatar; if(profile.username)member.name=profile.username; }

          if (!sendRoom(r)) reject(503,'No se pudo guardar la vinculación.');
          result = {ok:true};
        } else if (action === 'recover') {
          const member = r.members.find(m=>!m.bot && m.accountId===accountId);
          if (!member) reject(403,'Esta sala no está vinculada a tu cuenta.');
          if(member.participation?.definitive)reject(409,'Abandonaste definitivamente esta partida.');
          // A verified owner with the current seat credential can resume without
          // rotating it on every load. Stale credentials still require ownership.
          if (input.resume === true && typeof input.token === 'string' && /^[a-f0-9]{48}$/.test(input.token) &&
              (member.tokenHash === hashToken(input.token) || member.token === input.token)) {
            result = {code:r.code,token:input.token}; return;
          }
          const previous = member.ws, recovery = crypto.randomBytes(24).toString('hex');
          member.token = recovery; member.tokenHash = hashToken(recovery);
          if (previous) {
            previous.send({type:'session_replaced'}); previous.room=null; previous.seat=-1;
            member.ws=null; previous.close();
          }
          if (!sendRoom(r)) reject(503,'No se pudo recuperar tu puesto.');
          result = {code:r.code,token:recovery};
        } else reject(404,'Solicitud desconocida.');
      } catch (error) { failure=error; }
    });
    if (failure) throw failure;
    if (unavailable() || !result) reject(503,'No pudimos confirmar el guardado.');
    return result;
  };
}
module.exports = {createAccountSeats};
