"use strict";

// Product labels only. The server catalog validates topology and versions.
const MapOptions = (() => {
  const options = Object.freeze([
    Object.freeze({ id:"europe", version:"1", name:"Europa" }),
    Object.freeze({ id:"laboratory", version:"1", name:"Laboratorio" }),
    Object.freeze({ id:"south-america", version:"3.3-beta", name:"Sudamérica · beta" }),
  ]);
  const reference = option => ({id:option.id,version:option.version});
  const name = ref => options.find(option => option.id === ref?.id && option.version === ref?.version)?.name || ref?.id;
  return Object.freeze({options,reference,name});
})();
if (typeof module !== "undefined") module.exports = MapOptions;
