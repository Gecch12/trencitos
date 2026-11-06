"use strict";
// Version 1 recordings store outcomes, not instructions to rerun randomness.
const ReplayState = (() => {
  function diff(before, after, path = [], changes = []) {
    if (before === after) return changes;
    // Recordings are JSON values. Walk each subtree once instead of serializing
    // that subtree again at every depth (game plus every authorized perspective).
    if ((!before || typeof before !== 'object') && (!after || typeof after !== 'object') &&
        JSON.stringify(before) === JSON.stringify(after)) return changes;
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
    return applyChanges(structuredClone(state), changes);
  }
  // A cursor owns its working state. Only changed values need copying between
  // checkpoints; callers must not retain or mutate the returned working state.
  function applyChanges(next, changes) {
    for (const {path,value,remove} of changes) {
      if(path.some(key=>['__proto__','constructor','prototype'].includes(key))) throw Error('Invalid replay path');
      if(!path.length){next=structuredClone(value);continue;}
      let target=next; for(const key of path.slice(0,-1)) target=target[key];
      if(remove) delete target[path.at(-1)]; else target[path.at(-1)]=structuredClone(value);
    }
    return next;
  }
  function cursor(frames = []) {
    let state=null,position=-1;
    function push(frame) {
      state=frame.snapshot?structuredClone(frame.snapshot):applyChanges(state,frame.changes);
      position++;return state;
    }
    function at(step) {
      if(!Number.isInteger(step)||step<0||step>=frames.length)throw Error('Invalid replay step');
      if(step===position)return state;
      if(step<position||position<0||step-position>32){
        let checkpoint=step;while(checkpoint>0&&!frames[checkpoint].snapshot)checkpoint--;
        state=null;position=checkpoint-1;
      }
      while(position<step)push(frames[position+1]);
      return state;
    }
    return {push,at};
  }
  function view(state, index) {
    return {...state.views[index],...state.shared};
  }
  function at(frames, step) {
    let index=step; while(index>0&&!frames[index].snapshot) index--;
    let state=structuredClone(frames[index].snapshot);
    for(let i=index+1;i<=step;i++) state=frames[i].snapshot?structuredClone(frames[i].snapshot):apply(state,frames[i].changes);
    return state;
  }
  return {diff,apply,at,cursor,view};
})();
if(typeof module!=='undefined'&&module.exports) module.exports=ReplayState;
