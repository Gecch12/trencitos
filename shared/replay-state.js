"use strict";
// Version 1 recordings store outcomes, not instructions to rerun randomness.
const ReplayState = (() => {
  function diff(before, after, path = [], changes = []) {
    if (JSON.stringify(before) === JSON.stringify(after)) return changes;
    const appendJournal=Array.isArray(before)&&Array.isArray(after)&&after.length>before.length&&
      (['journal','turnHistory'].includes(path.at(-1))||path.includes('turnHistory')&&path.at(-1)==='events');
    if (!before || !after || typeof before !== 'object' || typeof after !== 'object' || (Array.isArray(before)!==Array.isArray(after)) || (Array.isArray(before)&&before.length!==after.length&&!appendJournal)) {
      changes.push({path,value:after}); return changes;
    }
    for (const key of Object.keys(before)) if (!Object.hasOwn(after,key)) changes.push({path:[...path,key],remove:true});
    for (const key of Object.keys(after)) diff(before[key],after[key],[...path,key],changes);
    return changes;
  }
  function apply(state, changes) {
    let next=structuredClone(state);
    for (const {path,value,remove} of changes) {
      if(path.some(key=>['__proto__','constructor','prototype'].includes(key))) throw Error('Invalid replay path');
      if(!path.length){next=structuredClone(value);continue;}
      let target=next; for(const key of path.slice(0,-1)) target=target[key];
      if(remove) delete target[path.at(-1)]; else target[path.at(-1)]=structuredClone(value);
    }
    return next;
  }
  function at(frames, step) {
    let index=step; while(index>0&&!frames[index].snapshot) index--;
    let state=structuredClone(frames[index].snapshot);
    for(let i=index+1;i<=step;i++) state=frames[i].snapshot?structuredClone(frames[i].snapshot):apply(state,frames[i].changes);
    return state;
  }
  return {diff,apply,at};
})();
if(typeof module!=='undefined'&&module.exports) module.exports=ReplayState;
