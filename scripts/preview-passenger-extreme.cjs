'use strict';
// Static, loopback-only model study. It never loads the game server or storage.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const assets=new Map([
  ['/','experiments/passenger-extreme/passenger-extreme.html'],
  ...['passenger-extreme.css','passenger-extreme.js','passenger-extreme-model.mjs','passenger-extreme-geometry.mjs','passenger-extreme-hair.mjs'].map(f=>['/experiments/'+f,'experiments/passenger-extreme/'+f]),
  ...['wagon-models.mjs','wagon-renderer.js'].map(f=>['/experiments/'+f,'experiments/passenger-extreme/'+f]),
  ...['three.module.js','three.core.js'].map(f=>['/vendor/'+f,'node_modules/three/build/'+f]),
]);
function start(port=3138){
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url,'http://127.0.0.1').pathname;
    if(pathname==='/favicon.ico'){res.writeHead(204);return res.end();}
    const file=assets.get(pathname);
    if(!file||!['GET','HEAD'].includes(req.method)){res.writeHead(404);return res.end('Not found');}
    const type=file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'text/javascript';
    res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});
    if(req.method==='HEAD')return res.end();
    const stream=fs.createReadStream(path.join(root,file));stream.on('error',()=>res.destroy());stream.pipe(res);
  });
  return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>resolve(server));});
}
if(require.main===module)start(Number(process.env.PORT||3138)).then(server=>console.log('Hippie Train → http://127.0.0.1:'+server.address().port)).catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={start};
