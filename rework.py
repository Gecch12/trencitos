from pathlib import Path
p=Path(__file__).parent
f=p/'index.html';s=f.read_text()
s=s.replace('Rail Routes Europa · Salas privadas','Ferrovía Europa · Salas privadas').replace('RAIL ROUTES','FERROVÍA').replace('EUROPA · edición privada','EUROPA · rutas & aventuras').replace('BETA 0.5','BETA 0.6')
s=s.replace('<link rel="stylesheet" href="style.css">','<link rel="stylesheet" href="style.css"><link rel="icon" type="image/svg+xml" href="assets/favicon.svg">')
s=s.replace('<span class="mark">🚂</span>','<span class="mark"><img src="assets/favicon.svg" width="39" height="39" alt=""/></span>')
s=s.replace('Tu próxima partida empieza aquí.','Europa te espera.').replace('Comparte un enlace privado y compite por las mejores rutas ferroviarias de Europa, con 2 a 5 jugadores desde su propio navegador.','Conecta ciudades, colecciona vagones y diseña tu gran viaje. Una mesa privada para 2 a 5 jugadores, desde cualquier navegador.')
s=s.replace('<div class="intro"><span class="eyebrow">UNA AVENTURA EUROPEA</span>','<div class="intro"><div class="hero-emblem">✦ <span>1901</span> ✦</div><span class="eyebrow">EL GRAN VIAJE FERROVIARIO</span>')
s=s.replace('<div id="lobby" class="lobby">','<div id="lobby" class="lobby">')
s=s.replace('Proyecto personal no oficial. Sin arte ni logotipos del juego comercial. Las reglas se implementan como referencia a Ticket to Ride: Europe.','Juego personal no oficial inspirado en las mecánicas ferroviarias europeas. Ilustraciones originales; sin asociación con Days of Wonder.')
s=s.replace('<span class="eyebrow">EUROPA · 1901</span><h2>La red ferroviaria</h2>','<span class="eyebrow">FERROVÍA · EUROPA 1901</span><h2>El gran mapa ferroviario</h2>')
s=s.replace('<span id="turntitle" class="turntitle"></span>','<span id="turntitle" class="turntitle"></span><button id="copyRoomInGame" class="copy-game" title="Copiar enlace privado">↗ <span>Invitar</span></button>')
# move original hand and tickets into bottom main dock
needle='<div class="historycard"><b>Movimientos recientes</b><div id="history"></div></div></main>'
replacement='''<section class="handdock" id="handdock"><div class="dockmain"><div class="dockheading"><div><span class="eyebrow">TU MANO</span><h3>Vagones disponibles</h3></div><span class="docktip">Cartas privadas · solo tú las ves</span></div><div id="hand" class="hand"></div></div><div class="docktickets"><div class="dockheading"><div><span class="eyebrow">TU VIAJE</span><h3>Destinos</h3></div></div><div id="mytickets" class="tickets-inline"></div></div></section><div class="historycard"><b>Movimientos recientes</b><div id="history"></div></div></main>'''
s=s.replace(needle,replacement)
s=s.replace('<h3>🃏 Mis cartas</h3><div id="hand" class="hand"></div><h3>🎫 Mis billetes de destino</h3><div id="mytickets"></div>','<p class="quick-reference">Un turno: robar 2 cartas, reclamar 1 ruta, construir 1 estación o tomar billetes.</p>')
s=s.replace('<div id="market" class="market"></div>','<div class="marketsub">Cartas descubiertas</div><div id="market" class="market"></div>')
s=s.replace('<button id="drawblind" class="full secondary">🎴 Robar carta oculta</button>','<button id="drawblind" class="full secondary">🎴 Robar carta del mazo</button>')
s=s.replace('<button id="station" class="secondary full">Construir estación</button>','<button id="station" class="secondary full">Construir estación</button><button id="pass" class="tertiary full hidden">Pasar turno (sin jugadas)</button>')
s=s.replace('Reglas y ayuda</summary>','Cómo jugar</summary>')
f.write_text(s)
# app artwork
f=p/'app.js';s=f.read_text().replace("let zoom=window.innerWidth<650?2.4:1", "let zoom=window.innerWidth<650?2.25:1")
a=s.index('function colorCard(');b=s.index('\nfunction render()',a)
s=s[:a]+'''function colorCard(c,count,click,disabled){
 const b=document.createElement(click?'button':'div');b.className='traincard suit-'+c;
 const image=document.createElement('img');image.src='assets/cards/'+c+'.svg';image.alt=N[c]||c;image.loading='eager';image.draggable=false;b.appendChild(image);
 if(count!==null&&count!==undefined){const tag=document.createElement('span');tag.className='cardcount';tag.textContent='×'+count;b.appendChild(tag)}
 if(click){b.type='button';b.title='Robar carta '+N[c];b.disabled=Boolean(disabled);b.onclick=click}
 return b
}'''+s[b:]
s=s.replace("$('market').innerHTML='';game.face.forEach", "$('market').innerHTML='';game.face.forEach")
s=s.replace("$('hand').appendChild(colorCard(c,n,null,false))","$('hand').appendChild(colorCard(c,n,null,false))")
s=s.replace("$('drawblind').disabled=!drawAllowed()||(game.deckCount+game.discardCount===0)","$('drawblind').disabled=!drawAllowed()||(game.deckCount+game.discardCount===0)")
s=s.replace("$('claim').onclick=()=>", "$('pass').onclick=()=>act('pass');\n$('claim').onclick=()=>")
s=s.replace("$('drawstats').textContent=active?`${game.drawCount}/2 cartas`:' ';", "$('drawstats').textContent=active?`${game.drawCount}/2 cartas`:' ';$('pass').classList.toggle('hidden',!active||game.deckCount+game.discardCount>0||game.face.length>0||game.ticketDeckCount>0);")
s=s.replace("$('copyLink').onclick=async()=>{const url=location.origin+'/?room='+room;try{await navigator.clipboard.writeText(url);$('copyLink').textContent='✓ Copiado'}catch{$('copyLink').textContent=url}};", """async function copyInvitation(){const url=location.origin+'/?room='+room;try{await navigator.clipboard.writeText(url);$('copyLink').textContent='✓ Copiado';$('copyRoomInGame').textContent='✓ Copiado';setTimeout(()=>{$('copyRoomInGame').innerHTML='↗ <span>Invitar</span>'},2400)}catch{prompt('Copia el enlace de tu sala',url)}}
$('copyLink').onclick=copyInvitation;
$('copyRoomInGame').onclick=copyInvitation;""")
s=s.replace("const savedName=localStorage.getItem('rr-name');if(savedName)$('nickname').value=savedName;", "const savedName=localStorage.getItem('rr-name');if(savedName)$('nickname').value=savedName;")
# improved board stylistic elements
s=s.replace("el('rect',{width:1320,height:790,fill:'url(#ocean)'});", """el('rect',{width:1320,height:790,fill:'url(#ocean)'});
 // Watercolor texture made from original vector ornaments, no commercial game art.
 const sea=el('g',{opacity:.26});for(let k=0;k<85;k++){let x=(k*157+33)%1300,y=(k*103+19)%770;el('path',{d:`M${x} ${y} q9 -6 18 0 q9 6 18 0`,fill:'none',stroke:'#5e95a7','stroke-width':1.5},sea)}""")
s=s.replace("stroke:'#a8b5a9','stroke-width':3});", "stroke:'#b0b6a5','stroke-width':3});")
s=s.replace("el('text',{x:48,y:111,fill:'#63949c','font-size':30,opacity:.5}).textContent='ATLANTIC';el('text',{x:410,y:732,fill:'#6b9ca6','font-size':20,opacity:.5}).textContent='MEDITERRANEAN';", """// Hand-drawn relief and country seams add geographical texture behind the routes.
 const contour=el('g',{fill:'none',stroke:'#a9ad90','stroke-width':1.7,opacity:.34});
 ['M254 302 Q330 274 443 313 T690 285','M300 430 Q430 395 580 435 T870 420','M520 155 Q665 182 798 165 T1104 210','M450 570 Q600 525 757 590 T1000 600','M920 330 Q1040 370 1218 315'].forEach(d=>el('path',{d,'stroke-dasharray':'8 12'},contour));
 for(let i=0;i<25;i++){const x=230+(i*179)%1010,y=130+(i*127)%495;el('path',{d:`M${x} ${y+12} l9 -19 9 19 M${x+8} ${y+12} l9 -15 9 15`,stroke:'#8e9b84','stroke-width':2,fill:'none',opacity:.30})}
 el('text',{x:51,y:126,fill:'#4e899b','font-size':27,opacity:.45,'letter-spacing':5}).textContent='ATLÁNTICO';el('text',{x:378,y:744,fill:'#4d899c','font-size':24,opacity:.5,'letter-spacing':3}).textContent='MEDITERRÁNEO';
 el('text',{x:760,y:126,fill:'#4e899b','font-size':13,opacity:.45,'letter-spacing':2}).textContent='MAR BÁLTICO';""")
s=s.replace("$('zoomin').onclick=()=>setZoom(zoom+.25);", "$('zoomin').onclick=()=>setZoom(zoom+.25);")
# connection status color by type / room
s=s.replace("function status(text){$('connection').textContent=text}", "function status(text){$('connection').textContent=text;$('connection').dataset.online=text.includes('Conectado')?'true':'false'}")
f.write_text(s)
print('updated markup and game UI')
