from pathlib import Path
import sys
root=Path(__file__).resolve().parents[1]/'frontend/assets'; (root/'cards').mkdir(parents=True,exist_ok=True)
# The broad, matte color field matches GameUI.ROUTE_COLORS, not a dark gradient.
# Ink and ivory are the engraved illustration, never an alternate suit color.
colors={
'red':('#ce554c','#fff0d5','#652f32'),
'blue':('#4d85c3','#e9f4fa','#213f61'),
'green':('#46966d','#eaf2d9','#214f3c'),
'yellow':('#f4d83d','#fff8cf','#3b443b'),
'black':('#1c2025','#ede9dc','#070a0e'),
'white':('#fff9e9','#fffef7','#435b63'),
'orange':('#df8b44','#fff1d4','#713f26'),
'purple':('#956dae','#f5e7f4','#4c335e'),
}
name={'red':'ROJO','blue':'AZUL','green':'VERDE','yellow':'AMARILLO','black':'NEGRO','white':'BLANCO','orange':'NARANJA','purple':'MORADO','wild':'LOCOMOTORA'}
loads = {'red': 'pasajeros', 'blue': 'combustible', 'green': 'alfalfa', 'yellow': 'grano',
         'black': 'carbón', 'white': 'piedra', 'orange': 'madera', 'purple': 'mercancías'}

def wagon_art(kind, palette):
    bg, ivory, ink = palette
    bodies = {
        'red': '''<path d="M31 128v43h138v-43"/><path d="M25 129q4-22 20-22h110q16 0 20 22Z"/>
          <path d="M35 119H165M38 161H162" stroke-width="1"/>
          <path d="M40 139q0-5 5-5h12q5 0 5 5v15H40Zm32 0q0-5 5-5h12q5 0 5 5v15H72Zm34 0q0-5 5-5h12q5 0 5 5v15H106Zm32 0q0-5 5-5h12q5 0 5 5v15H138Z" fill="IVORY" stroke-width="1"/>
          <path d="M66 131v38m34-38v38m34-38v38" stroke-width="1"/>''',
        'blue': '''<path d="M58 158v13m84-13v13" stroke-width="7"/>
          <rect x="29" y="116" width="142" height="46" rx="23"/>
          <path d="M51 119q-15 20 0 40m98-40q15 20 0 40M67 118v42m66-42v42" stroke-width="2"/>
          <path d="M89 114v-9h22v9M85 104h30M72 109v-8h55v8M146 115v55m9-50v50m-9-37h9m-9 10h9m-9 10h9" stroke-width="2"/>
          <path d="M98 127q-15 17 0 22 15-5 0-22Z" fill="IVORY" stroke-width="1"/>''',
        'green': '''<path d="M36 142l-4-12 9-2-4-12 12 1 2-14 12 6 8-10 9 7 10-8 12 8 11-7 8 8 13-5 5 12 12-2 1 12 12-2-4 17Z" fill="IVORY" stroke-width="2"/>
          <path d="M45 132l14-15m-5 20 19-23m-2 21 15-20m0 21 14-21m0 19 14-19m3 21 13-18m0 20 15-14" stroke="INK" stroke-width="1.5"/>
          <path d="M31 141H169v30H31Z"/><path d="M28 141H172M34 151H166m-132 10H166M55 141v30m45-30v30m45-30v30" stroke-width="2"/>
          <path d="M59 109l-7 31m89-28 7 28" stroke="INK" stroke-width="3"/>''',
        'yellow': '''<path d="M33 125q22-14 40-6 16-20 35-6 27-10 57 12" fill="IVORY" stroke-width="2"/>
          <path d="M29 126H171l-17 30-23 14H69l-23-14Z"/>
          <path d="M27 126H173M52 128l16 27h64l16-27M69 170v7h20v-7m22 0v7h20v-7M68 155v13m64-13v13" stroke-width="2"/>
          <path d="M95 147v-12m0 6-5-4m5 0 5-4m-5 12 5-4m-5-5-5-4" stroke-width="1.5"/>
          <path d="M47 123l2-1m20 0 2-1m16-4 2-1m12 5 2-1m17-2 2-1m16 6 2-1" stroke="INK" stroke-width="2"/>''',
        'black': '''<path d="M34 143l-2-17 15-8 14 6 6-18 22-6 15 18 17-8 15 13 19-5 12 24Z"/>
          <path d="M34 129l18 7 9-12m6-18 12 23 10-29m-10 29 25-11 9 18 8-26m-8 26 23-13 8 19m-7-19 18-5" stroke-width="1.4"/>
          <path d="M28 143H172l-7 29H35Z"/><path d="M27 144H173M53 146l3 24m22-24v24m25-24v24m25-24v24m23-24-3 24" stroke-width="2"/>''',
        'white': '''<path d="M33 141l3-17 19-9 19 18-4 14Zm32-8 16-30 20 4 13 37Zm41 10 6-26 19-10 17 20-5 17Zm34-1 7-18 15 2 7 17Z" fill="IVORY" stroke="INK" stroke-width="2"/>
          <path d="M36 124l18 5 1-14m-1 14 16 18m11-44 10 25 10-21m-10 21 15 15m6-26 17 14 2-24m-2 24 14 13" stroke="INK" stroke-width="1.5"/>
          <path d="M30 143H170v29H30Z"/><path d="M30 152H170m-140 10H170M44 143v29m27-29v29m29-29v29m29-29v29m27-29v29" stroke-width="2"/>''',
        'orange': '''<path d="M36 161H165v12H36Z"/>
          <g stroke-width="2"><rect x="39" y="144" width="126" height="17" rx="8"/><rect x="37" y="128" width="126" height="17" rx="8"/><rect x="45" y="112" width="113" height="17" rx="8"/>
          <ellipse cx="153" cy="152" rx="7" ry="8"/><ellipse cx="151" cy="136" rx="7" ry="8"/><ellipse cx="147" cy="120" rx="7" ry="8"/>
          <path d="M46 150h87m-87-15h85m-78-15h77" stroke-width="1"/>
          <path d="M62 107v57m71-57v57" stroke-width="3"/><path d="M57 112l11 49m60-49 10 49" stroke-width="1"/></g>''',
        'purple': '''<path d="M31 123l12-15H157l12 15v49H31Z"/>
          <path d="M29 123H171M40 130H160m-120 10H160m-120 10H160m-120 10H160" stroke-width="1.2"/>
          <path d="M76 126H124v44H76Z"/><path d="M80 131H120v34H80Zm0 0 40 34m0-34-40 34M72 126H129M117 145v8" stroke-width="1.5"/>
          <path d="M42 126v44m116-44v44" stroke-width="3"/>''',
    }
    body = bodies[kind].replace('IVORY', ivory).replace('INK', ink)
    wheels = ''.join(f'''<g transform="translate({x} 186)"><circle r="11" fill="{ink}" stroke="{ivory}" stroke-width="2.5"/>
      <circle r="7.5" fill="none" stroke="{ivory}" stroke-width=".8"/>
      <path d="M0-8V8M-8 0H8m-5.6-5.6L5.6 5.6m-11.2 0L5.6-5.6" stroke="{ivory}" stroke-width="1"/><circle r="2.5" fill="{ivory}"/></g>''' for x in (47, 71, 129, 153))
    return f'''<g id="wagon-{kind}" data-cargo="{loads[kind]}" stroke-linejoin="round" stroke-linecap="round">
      <g fill="{ink}" stroke="{ivory}" stroke-width="2.8">{body}
        <path d="M27 173H173v6H27Z"/><path d="M21 174H27m146 0h6M42 180H77m46 0h35" stroke-width="3"/>
        <circle cx="19" cy="174" r="3"/><circle cx="181" cy="174" r="3"/>
      </g>{wheels}</g>'''
# Original vector engraving, shared by every regular suit. Keep the color in
# accessible metadata; no printed color names or label plaques on the face.
def train_card(kind, palette):
    bg, ivory, ink = palette
    trim = ink if kind in ('yellow', 'white') else ivory
    wheels = ''.join(f'''<g transform="translate({x} 185)">
      <circle r="17" fill="{ink}" stroke="{ivory}" stroke-width="3"/>
      <circle r="12.5" fill="none" stroke="{ivory}" stroke-width="1"/>
      <path d="M0-12V12M-12 0H12M-8.5-8.5l17 17m-17 0 17-17" stroke="{ivory}" stroke-width="1.6"/>
      <circle r="4" fill="{ivory}"/>
    </g>''' for x in (52, 91, 130))
    card = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 278" role="img" aria-label="Carta ferroviaria {name[kind]}">
<title>Carta de tren · {name[kind].lower()}</title>
<defs>
  <pattern id="engraved-paper" width="12" height="12" patternUnits="userSpaceOnUse">
    <path d="M2 3h2M3 2v2" fill="none" stroke="{trim}" stroke-width=".6" opacity=".14"/>
  </pattern>
  <path id="corner" d="M21 45V25q0-4 4-4h20M26 40V26h14M18 53l3-3 3 3-3 3Z"/>
</defs>
<rect width="200" height="278" rx="13" fill="{ink}"/>
<rect id="suit-field" x="3" y="3" width="194" height="272" rx="11" fill="{bg}"/>
<rect x="7" y="7" width="186" height="264" rx="9" fill="url(#engraved-paper)" stroke="{trim}" stroke-width="1.6"/>
<rect x="12" y="12" width="176" height="254" rx="6" fill="none" stroke="{trim}" stroke-opacity=".45" stroke-width=".7"/>
<g fill="none" stroke="{trim}" stroke-width="1.2">
  <use href="#corner"/><use href="#corner" transform="translate(200 0) scale(-1 1)"/>
  <use href="#corner" transform="translate(0 278) scale(1 -1)"/><use href="#corner" transform="translate(200 278) scale(-1 -1)"/>
</g>
<text x="100" y="37" text-anchor="middle" font-family="Georgia,serif" font-weight="bold" font-size="13" letter-spacing="1.3" fill="{trim}">TRENCITOS</text>
<g fill="none" stroke="{trim}">
  <path d="M36 49H83m34 0h47M44 53H77m46 0h33" stroke-width=".8"/>
  <path d="M100 44l5 5-5 5-5-5Z" stroke-width="1.2"/>
  <path d="M29 163V139a71 71 0 0 1 142 0v24M34 160V139a66 66 0 0 1 132 0v21" opacity=".3" stroke-width=".8"/>
  <path d="M44 109l8 4m-1-17 7 6m4-16 6 7m6-14 4 8m10-13 2 9m12-10v9m13-8-2 9m15-6-4 8m16-3-6 7m16 1-7 6m15 5-8 4" opacity=".4" stroke-width="1"/>
</g>
<g id="steam-engraving" fill="none" stroke="{trim}" stroke-linecap="round">
  <path d="M140 118c12-7 10-18-1-20-13-2-17-11-10-18M130 113c6-6 1-12-8-14-13-3-16-13-8-20M118 96c-9-3-15-9-11-16" stroke-width="2" opacity=".7"/>
</g>
<g id="engraved-locomotive" stroke-linejoin="round" stroke-linecap="round">
  <path d="M28 176H159l16 17H27Z" fill="{ink}" stroke="{ivory}" stroke-width="2.5"/>
  <path d="M35 165v-44h46v44" fill="{ink}" stroke="{ivory}" stroke-width="3"/>
  <path d="M30 122v-7h53l5 7Z" fill="{ivory}" stroke="{ink}" stroke-width="1.5"/>
  <path d="M43 128H57v21H43Zm20 0H75v21H63Z" fill="{bg}" stroke="{ivory}" stroke-width="2"/>
  <path d="M80 141h67q13 0 13 13v12H80Z" fill="{ink}" stroke="{ivory}" stroke-width="3"/>
  <path d="M85 147h61m-56 9h63" fill="none" stroke="{ivory}" stroke-width="1" opacity=".65"/>
  <path d="M101 140v-7a6 6 0 0 1 12 0v7M133 141v-17h13v17" fill="{ink}" stroke="{ivory}" stroke-width="2.5"/>
  <path d="M130 121h19v5h-19Z" fill="{ivory}"/>
  <path d="M121 143v22M151 144v22" fill="none" stroke="{ivory}" stroke-width="2.5"/>
  <path d="M160 148h7v9h-7M29 168H166v9H29Z" fill="{ivory}" stroke="{ink}" stroke-width="1.5"/>
  <path d="M163 177l14 22h-23m9-16 6 12m-12-12 5 12" fill="{ink}" stroke="{ivory}" stroke-width="2"/>
  {wheels}
  <path d="M52 187H130" fill="none" stroke="{ink}" stroke-width="7"/>
  <path d="M52 186H130" fill="none" stroke="{ivory}" stroke-width="3"/>
  <g fill="{ivory}"><circle cx="52" cy="186" r="3"/><circle cx="91" cy="186" r="3"/><circle cx="130" cy="186" r="3"/></g>
  <path d="M41 156h32m-32 5h32" stroke="{ivory}" stroke-width=".8" opacity=".65"/>
</g>
<g id="rail-ornament" fill="none" stroke="{trim}" stroke-linecap="round">
  <path d="M29 207H174m-137 4h129" stroke-width="1.5"/>
  <path d="M46 215l-8 6m24-6-8 6m24-6-8 6m24-6-8 6m24-6-8 6m24-6-8 6m24-6-8 6" stroke-width="1" opacity=".6"/>
  <path d="M44 242H83m34 0h39M62 246H81m38 0h19" stroke-width="1"/>
  <path d="M100 232l3.5 7 7 3-7 3-3.5 7-3.5-7-7-3 7-3Z" fill="{trim}" stroke="none"/>
</g>
</svg>'''
    if kind != 'wild':
        # The shared template owns the frame; regular suits replace the entire
        # engine/steam group with their distinct wagon, not a recolored engine.
        before, _, rest = card.partition('<g id="steam-engraving"')
        _, _, after = rest.partition('<g id="rail-ornament"')
        return (before + wagon_art(kind, palette) + '\n<g id="rail-ornament"' + after).replace(
            f'Carta de tren · {name[kind].lower()}', f'Vagón de {loads[kind]} · {name[kind].lower()}')
    rainbow = ['#e3474b', '#ed913b', '#f4d83d', '#46966d', '#4d85c3', '#956dae']
    stripes = ''.join(f'<rect x="3" y="{3+i*46}" width="194" height="46" fill="{color}"/>' for i, color in enumerate(rainbow))
    field = f'<rect id="suit-field" x="3" y="3" width="194" height="272" rx="11" fill="{bg}"/>'
    card = card.replace(field, '<defs><clipPath id="rainbow-clip"><rect x="3" y="3" width="194" height="272" rx="11"/></clipPath></defs>'
                        + f'<g id="rainbow-field" clip-path="url(#rainbow-clip)">{stripes}</g>')
    return card.replace('Carta de tren · locomotora', 'Locomotora arcoíris · comodín')

# The deck remains text-free; only the wildcard has an engine and six colors.
CUSTOM_BACK = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 278" role="img" aria-label="Reverso del mazo de trenes">
<rect width="200" height="278" rx="12" fill="#173c4e"/>
<rect x="9" y="9" width="182" height="260" rx="10" fill="none" stroke="#e8c689" stroke-width="3"/>
<path d="M28 28H172V250H28Z" fill="none" stroke="#e8c689" stroke-opacity=".55"/>
<circle cx="100" cy="139" r="56" fill="none" stroke="#e8c689" stroke-width="5"/>
<path d="M100 87L117 125 154 139 117 153 100 191 83 153 46 139 83 125Z" fill="#e8c689"/>
</svg>'''
cards = {kind: train_card(kind, palette) for kind, palette in colors.items()}
cards.update(wild=train_card('wild', ('#243039', '#fff6e4', '#202b32')), back=CUSTOM_BACK)
if '--check' in sys.argv:
    stale = [kind for kind, svg in cards.items()
             if not (root/'cards'/f'{kind}.svg').exists()
             or (root/'cards'/f'{kind}.svg').read_text().rstrip('\n') != svg.rstrip('\n')]
    if stale:
        raise SystemExit('Stale card assets: ' + ', '.join(stale))
    print('All 10 card assets match their generator.')
    raise SystemExit(0)
for kind, svg in cards.items():
    (root/'cards'/f'{kind}.svg').write_text(svg)
(root/'ticket.svg').write_text('''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 260"><defs><pattern id="p" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M0 20L20 0" stroke="#b7955f" stroke-opacity=".2"/></pattern></defs><rect width="480" height="260" rx="14" fill="#f0e2c4"/><rect width="480" height="260" rx="14" fill="url(#p)"/><rect x="15" y="15" width="450" height="230" rx="6" fill="none" stroke="#aa8153" stroke-width="3"/><path d="M30 54H450M30 204H450" stroke="#aa8153" stroke-width="2"/><circle cx="418" cy="129" r="44" fill="none" stroke="#aa8153" stroke-width="3"/><path d="M418 92L430 130 418 166 406 130Z" fill="#aa8153"/><text x="40" y="43" font-family="Georgia" font-weight="bold" font-size="20" fill="#654c38" letter-spacing="4">BILLETE DE VIAJE</text><text x="42" y="230" font-family="Georgia" font-size="14" fill="#654c38" letter-spacing="3">GRANDES RUTAS · EUROPA</text></svg>''')
(root/'favicon.svg').write_text('''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#173b50"/><circle cx="32" cy="32" r="24" fill="none" stroke="#e4b86b" stroke-width="3"/><path d="M13 35H51M22 25h20v13H22zM27 25v-8h9v8" fill="#e4b86b" stroke="#e4b86b" stroke-width="3"/><circle cx="27" cy="43" r="4" fill="#e4b86b"/><circle cx="39" cy="43" r="4" fill="#e4b86b"/></svg>''')
print('created',len(list(root.rglob('*.svg'))),'original svg assets')
