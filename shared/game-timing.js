"use strict";
// Shared configuration vocabulary; only the server creates absolute deadlines.
const GameTiming = (() => {
  const options = { turnSeconds: [30, 60, 90], ticketExtraSeconds: [15, 30], initialSeconds: [30, 60, 90] };
  const defaults = { turnSeconds: 60, ticketExtraSeconds: 30, initialSeconds: 60 };
  const valid = value => !!value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(options).every(key => options[key].includes(value[key]));
  const normalize = value => Object.fromEntries(Object.entries(options).map(([key, values]) =>
    [key, values.includes(value?.[key]) ? value[key] : defaults[key]]));
  return { options, defaults, valid, normalize };
})();
if (typeof module !== "undefined" && module.exports) module.exports = GameTiming;
