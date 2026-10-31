// Local fixture only; not served by production and never uses remote room storage.
const fs=require('node:fs'),path=require('node:path');
const {start}=require('./threejs-preview');
(async()=>{
 const {server,port}=await start(Number(process.env.QA_PORT || 3140));
 const handlers=server.listeners('request');server.removeAllListeners('request');
 server.on('request',(req,res)=>{
  if(req.url==='/__catalog'){res.writeHead(200,{'Content-Type':'text/html'});res.end(fs.readFileSync(path.join(__dirname,'catalog-preview.html')));}
  else handlers.forEach(handle=>handle(req,res));
 });
 console.log('Catalog QA: http://127.0.0.1:'+port+'/__catalog');
})();
