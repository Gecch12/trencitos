from pathlib import Path
import json, subprocess, math, html, io
import cairosvg
from PIL import Image, ImageDraw, ImageFont
root=Path(__file__).resolve().parents[1]
js=subprocess.check_output(['node','-e','console.log(JSON.stringify(require("./shared/data")))'],cwd=root,text=True)
d=json.loads(js)
cities=d['CITIES'];routes=d['ROUTES']
palette={'red':'#b74447','blue':'#427aaf','green':'#4c9975','yellow':'#d3ad44','black':'#344354','white':'#e2e7d9','orange':'#df8c50','purple':'#9971ae','gray':'#fffaf0'}
land='M210 88 L278 97 312 158 400 146 450 100 520 72 616 54 732 95 793 111 895 117 965 130 1050 79 1150 103 1260 179 1270 286 1230 406 1282 466 1270 580 1238 720 1141 728 1055 710 994 625 916 701 825 695 778 599 712 576 683 731 598 713 581 579 505 517 444 578 385 570 354 672 191 719 111 639 125 552 227 492 283 428 270 365 223 310 217 229 Z'
pieces=['<svg xmlns="http://www.w3.org/2000/svg" width="1320" height="790" viewBox="0 0 1320 790"><defs><linearGradient id="water" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#abd1d8"/><stop offset="1" stop-color="#e3e8e0"/></linearGradient></defs>', '<rect width="1320" height="790" fill="url(#water)"/>',f'<path d="{land}" fill="#e9e3c7" stroke="#a5afa1" stroke-width="4"/>']
for x in range(60,1320,160):
 for y in range(30,790,125): pieces.append(f'<path d="M{x} {y}q10 -6 20 0q10 6 20 0" stroke="#5b97a3" opacity=".2" fill="none" stroke-width="2"/>')
pieces+=['<text x="44" y="110" font-size="29" fill="#5a9aaa" opacity=".45" font-family="Georgia" letter-spacing="5">ATLÁNTICO</text>','<text x="470" y="752" font-size="24" fill="#5a9aaa" opacity=".45" font-family="Georgia" letter-spacing="5">MEDITERRÁNEO</text>']
by={};
for r in routes:by.setdefault(tuple(sorted([r['a'],r['b']])),[]).append(r)
for r in routes:
 a,b=cities[r['a']],cities[r['b']];x,y=a[:2];xx,yy=b[:2]; dx=xx-x;dy=yy-y;dist=math.hypot(dx,dy);pair=by[tuple(sorted([r['a'],r['b']]))];offset=(pair.index(r)-(len(pair)-1)/2)*19;ox=-dy/dist*offset;oy=dx/dist*offset;pad=17;usable=max(5,dist-2*pad);seg=min(25,max(11,usable/r['n']-3)); angle=math.degrees(math.atan2(dy,dx));color=palette[r['color']]
 pieces.append(f'<line x1="{x+ox+dx*pad/dist}" y1="{y+oy+dy*pad/dist}" x2="{xx+ox-dx*pad/dist}" y2="{yy+oy-dy*pad/dist}" stroke="#344754" stroke-width="17" opacity=".75" stroke-linecap="round"/>')
 for i in range(r['n']):
  a=pad+(i+.5)*usable/r['n'];px=x+ox+dx*a/dist;py=y+oy+dy*a/dist
  pieces.append(f'<rect x="{px-seg/2:.2f}" y="{py-7:.2f}" width="{seg:.2f}" height="14" rx="3" transform="rotate({angle:.2f} {px:.2f} {py:.2f})" stroke="#274c61" stroke-width="1.4" fill="{color}"/>')
 marker=('▲ ' if r['tunnel'] else '') + ('⚓'*r['ferry'] if r['ferry'] else '')
 if marker.strip():
  pieces.append(f'<text x="{(x+xx)/2+ox:.2f}" y="{(y+yy)/2+oy-13:.2f}" text-anchor="middle" font-size="14" font-weight="700" fill="#223b4c" stroke="#fffbec" stroke-width="4" paint-order="stroke">{marker.strip()}</text>')
for k,(x,y,name) in cities.items():
 pieces+= [f'<circle cx="{x}" cy="{y}" r="13" fill="#fff8e7" opacity=".85"/>',f'<circle cx="{x}" cy="{y}" r="8" fill="#fafdf7" stroke="#244e64" stroke-width="3"/>',f'<text x="{x}" y="{y-16}" text-anchor="middle" font-family="DejaVu Sans,sans-serif" font-size="13" font-weight="bold" fill="#fff3de" stroke="#fff3de" stroke-width="5">{html.escape(name)}</text>',f'<text x="{x}" y="{y-16}" text-anchor="middle" font-family="DejaVu Sans,sans-serif" font-size="13" font-weight="bold" fill="#1e4559">{html.escape(name)}</text>']
pieces.append('</svg>'); svg=''.join(pieces)
(root/'board-artwork-preview.svg').write_text(svg)
cairosvg.svg2png(bytestring=svg.encode(),write_to=str(root/'board-artwork-preview.png'),output_width=1320,output_height=790)
print(len(cities),'cities',len(routes),'routes; preview rendered')
