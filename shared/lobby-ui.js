"use strict";

// Public lobby rules shared by the browser and the authoritative server.
const LobbyUI = (() => {
  const PALETTE = typeof module !== "undefined" && module.exports ? require("./data").PLAYER_PALETTE : PLAYER_PALETTE;
  const colors = PALETTE.map(({ color }) => color);
  const isColor = color => colors.includes(color);
  const colorName = color => PALETTE.find(p=>p.color===color)?.name || (color==='#edadd0'?'Rosa':'');
  const isNewCode = code => typeof code === "string" && /^\d{6,10}$/.test(code);
  // Old six-character invitations/recovery links remain valid.
  const isJoinCode = code => typeof code === "string" && (isNewCode(code) || /^[A-Z0-9]{6}$/i.test(code));
  function randomCode(random) {
    if (!random) random = max => {
      const bytes = new Uint32Array(1), limit = 2 ** 32 - (2 ** 32 % max);
      do { crypto.getRandomValues(bytes); } while (bytes[0] >= limit);
      return bytes[0] % max;
    };
    return String(random(100000000)).padStart(8, "0");
  }
  function freeColor(members, preferred) {
    const used = new Set(members.map(m => m.color));
    return isColor(preferred) && !used.has(preferred) ? preferred : colors.find(color => !used.has(color));
  }
  function restoreColors(members, players) {
    const used = new Set();
    const restored = members.map((m, i) => {
      const color = players?.[i]?.color || m.color;
      // Retired pink remains owned in saved rooms, but cannot be newly selected.
      if ((!isColor(color) && color !== '#edadd0') || used.has(color)) return null;
      used.add(color); return color;
    });
    return restored.map(color => {
      if (color) return color;
      const available = colors.find(c => !used.has(c)); used.add(available); return available;
    });
  }
  return { PALETTE, isColor, colorName, isNewCode, isJoinCode, randomCode, freeColor, restoreColors };
})();
if (typeof module !== "undefined" && module.exports) module.exports = LobbyUI;
