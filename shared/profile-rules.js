"use strict";
const ProfileRules = (() => {
  const avatars = Object.freeze(['person','capybara']);
  const reserved = new Set(['admin','administrator','administrador','support','soporte','moderator','moderador','trencitos','system','sistema','bot','guest','invitado','deleted','null','undefined']);
  const normalizeUsername = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
  const validUsername = value => /^[a-z][a-z0-9_]{2,19}$/.test(value) && !reserved.has(value) && !/^(guest_|bot_|trencitos_)/.test(value);
  const validDisplayName = value => typeof value === 'string' && [...value].length <= 20 && !/[<>"'&\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(value);
  return {avatars,normalizeUsername,validUsername,validDisplayName};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = ProfileRules;
