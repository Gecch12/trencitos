"use strict";

// Browser zoom is separate from the maps' pointer-based cameras. Do not cancel
// single-finger scrolling or any of the maps' own pan/pinch handlers.
if (typeof document !== 'undefined') {
  const touchDevice=()=>matchMedia('(pointer: coarse)').matches;
  const isMap=target=>target?.closest?.('#mapscroll,#ticketMap,#scoreMap');
  for(const type of ['gesturestart','gesturechange']) document.addEventListener(type,event=>{
    if(touchDevice())event.preventDefault();
  },{passive:false});
  document.addEventListener('touchstart',event=>{
    if(touchDevice()&&event.touches.length>1&&!isMap(event.target))event.preventDefault();
  },{passive:false});
  let lastTap=null;
  document.addEventListener('touchend',event=>{
    // Interactive controls use touch-action: manipulation. Keep their second
    // click intact (e.g. two quick card draws); suppress only blank-area zoom.
    if(!touchDevice()||isMap(event.target)||event.touches.length||event.target.closest?.('button,a,input,select,textarea,summary,[role="button"]')){lastTap=null;return;}
    const point=event.changedTouches[0],time=performance.now();
    if(point&&lastTap&&time-lastTap.time<320&&Math.hypot(point.clientX-lastTap.x,point.clientY-lastTap.y)<24) {
      event.preventDefault();lastTap=null;
    }else lastTap=point?{time,x:point.clientX,y:point.clientY}:null;
  },{passive:false});
}

// Capacitor injects the bridge in the native WebView. Browsers remain unchanged.
globalThis.TrencitosMobile = {
  async attach({ resume, back }) {
    const capacitor = globalThis.Capacitor;
    if (!capacitor?.isNativePlatform()) return;
    // Native plugin proxies are injected before this unbundled web client loads.
    const app = capacitor.Plugins.App;
    await app.addListener("appStateChange", ({ isActive }) => {
      if (isActive) resume();
    });
    if (capacitor.getPlatform() === "android") {
      await app.addListener("backButton", () => {
        if (!back()) app.minimizeApp().catch(console.error);
      });
    }
  },
};
