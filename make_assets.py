from pathlib import Path
import math
root=Path(__file__).parent/'assets'; (root/'cards').mkdir(parents=True,exist_ok=True)
colors={
'red':('#a53d3e','#e8a88b','#692c3c'),
'blue':('#275d97','#9bc1df','#193753'),
'green':('#286d61','#9bc9a5','#1b4a45'),
'yellow':('#c69532','#f5d987','#775521'),
'black':('#313e4c','#aeb9b6','#142d3e'),
'white':('#b7c1b8','#fff9e4','#61736e'),
'orange':('#b76536','#efbe8a','#713823'),
'purple':('#76527e','#c7a5cc','#462d58'),
'wild':('#3f5471','#ffd986','#253048')
}
name={'red':'ROJO','blue':'AZUL','green':'VERDE','yellow':'AMARILLO','black':'NEGRO','white':'BLANCO','orange':'NARANJA','purple':'MORADO','wild':'LOCOMOTORA'}
for i,(kind,(bg,light,dark)) in enumerate(colors.items()):
    bars=''.join(f'<path d="M{32+j*24} 60 l13 -13" stroke="{light}" stroke-opacity=".22" stroke-width="8"/>' for j in range(7))
    sun=f'<circle cx="147" cy="84" r="42" fill="{light}" opacity=".22"/>'
    smoke=''.join(f'<circle cx="{97+j*16}" cy="{107-j*17}" r="{12+j*3}" fill="{light}" opacity="{.42-j*.08}"/>' for j in range(3))
    wheels=''.join(f'<circle cx="{62+j*38}" cy="202" r="13" fill="{dark}" stroke="{light}" stroke-width="5"/><circle cx="{62+j*38}" cy="202" r="4" fill="{light}"/>' for j in range(3))
    main=f'''<g stroke="{light}" stroke-linejoin="round" stroke-width="5" fill="{dark}">
    <path d="M40 176 H166 v17 H37 Z"/><path d="M59 139 h80 l16 40 H45 Z"/>
    <path d="M73 141 v-29 h35 v29"/><path d="M120 141 v-47 h22 v47"/>
    <path d="M48 158 H152" stroke-width="4"/><path d="M63 153 v18 M98 153 v18 M130 153 v18" stroke-width="3"/>
    </g>{wheels}{smoke}'''
    if kind=='wild':
      main=f'''<g transform="translate(100 166)"><circle r="70" fill="{dark}" stroke="{light}" stroke-width="6"/><circle r="52" stroke="{light}" stroke-opacity=".6" fill="none" stroke-width="2"/><path d="M0 -56 L12 -16 48 0 12 14 0 54 -12 14 -48 0 -12 -16Z" fill="{light}"/><circle r="9" fill="{dark}"/></g>'''
    text=f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 278" role="img" aria-label="Carta ferroviaria {name[kind]}">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="{bg}"/><stop offset="1" stop-color="{dark}"/></linearGradient><pattern id="grain" width="17" height="17" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".8" fill="{light}" opacity=".12"/></pattern></defs>
<rect width="200" height="278" rx="13" fill="url(#bg)"/><rect width="200" height="278" rx="13" fill="url(#grain)"/>
<rect x="8" y="8" width="184" height="262" rx="10" fill="none" stroke="{light}" stroke-width="3" opacity=".85"/>
<rect x="15" y="15" width="170" height="248" rx="7" fill="none" stroke="{light}" stroke-opacity=".45"/>
<path d="M20 52H180M20 224H180" stroke="{light}" stroke-width="2" opacity=".65"/>{bars}{sun}
{main}
<rect x="31" y="233" width="138" height="22" rx="5" fill="{light}" opacity=".95"/>
<text x="100" y="248" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="900" font-size="12" letter-spacing="2" fill="{dark}">{name[kind]}</text>
<text x="100" y="38" text-anchor="middle" font-family="Georgia,serif" font-size="15" font-weight="bold" letter-spacing="3" fill="{light}">FERROVÍA</text>
</svg>'''
    (root/'cards'/f'{kind}.svg').write_text(text)
(root/'cards'/'back.svg').write_text('''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 278"><rect width="200" height="278" rx="12" fill="#173c4e"/><rect x="9" y="9" width="182" height="260" rx="10" fill="none" stroke="#e8c689" stroke-width="3"/><path d="M28 28 H172 V250 H28Z" fill="none" stroke="#e8c689" stroke-opacity=".55"/><circle cx="100" cy="138" r="56" fill="none" stroke="#e8c689" stroke-width="5"/><path d="M100 86 L117 124 154 138 117 152 100 190 83 152 46 138 83 124Z" fill="#e8c689"/><text x="100" y="43" text-anchor="middle" fill="#e8c689" font-family="Georgia" font-size="15" letter-spacing="2">FERROVÍA</text><text x="100" y="238" text-anchor="middle" fill="#e8c689" font-family="Georgia" font-size="12" letter-spacing="3">EUROPA</text></svg>''')
(root/'ticket.svg').write_text('''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 260"><defs><pattern id="p" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M0 20L20 0" stroke="#b7955f" stroke-opacity=".2"/></pattern></defs><rect width="480" height="260" rx="14" fill="#f0e2c4"/><rect width="480" height="260" rx="14" fill="url(#p)"/><rect x="15" y="15" width="450" height="230" rx="6" fill="none" stroke="#aa8153" stroke-width="3"/><path d="M30 54H450M30 204H450" stroke="#aa8153" stroke-width="2"/><circle cx="418" cy="129" r="44" fill="none" stroke="#aa8153" stroke-width="3"/><path d="M418 92L430 130 418 166 406 130Z" fill="#aa8153"/><text x="40" y="43" font-family="Georgia" font-weight="bold" font-size="20" fill="#654c38" letter-spacing="4">BILLETE DE VIAJE</text><text x="42" y="230" font-family="Georgia" font-size="14" fill="#654c38" letter-spacing="3">GRANDES RUTAS · EUROPA</text></svg>''')
(root/'favicon.svg').write_text('''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#173b50"/><circle cx="32" cy="32" r="24" fill="none" stroke="#e4b86b" stroke-width="3"/><path d="M13 35H51M22 25h20v13H22zM27 25v-8h9v8" fill="#e4b86b" stroke="#e4b86b" stroke-width="3"/><circle cx="27" cy="43" r="4" fill="#e4b86b"/><circle cx="39" cy="43" r="4" fill="#e4b86b"/></svg>''')
print('created',len(list(root.rglob('*.svg'))),'original svg assets')
