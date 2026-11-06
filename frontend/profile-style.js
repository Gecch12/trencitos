import { WAGON_STYLES } from './wagon-models.mjs';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Images are rendered ahead of time from the board models; opening a picker needs no WebGL.
export function mountStylePickers(form, { palette, selection, translate, onColor }) {
  const lifetime = new AbortController(), signal = lifetime.signal;
  const entries = palette.map(item => ({ ...item, ...WAGON_STYLES.find(style => style.color === item.color) }));
  const pickers = [];
  const t = text => escape(translate(text));
  const content = entry => entry.color
    ? `<span class="wagon-choice-art"><img src="/assets/wagons/${escape(entry.model)}.png" alt="" width="120" height="72" /></span><span class="wagon-choice-copy"><strong><span class="wagon-color-dot" data-color="${entry.paint || entry.color}"></span>${t(entry.name)}</strong><small>${t(entry.label)}</small></span>`
    : `<span class="wagon-choice-art wagon-choice-none" aria-hidden="true">—</span><span class="wagon-choice-copy"><strong>${t('Sin preferencia')}</strong></span>`;

  for (const [name, label] of [['color', 'Primer color'], ['secondaryColor', 'Segundo color']]) {
    const host = form.querySelector(`[data-style-picker="${name}"]`);
    const choices = name === 'secondaryColor' ? [{ color: '', name: 'Sin preferencia' }, ...entries] : entries;
    const id = `style-${name}`;
    host.innerHTML = `<span id="${id}-label" class="wagon-picker-label">${t(label)}</span>
      <input type="hidden" name="${name}" />
      <button type="button" class="wagon-picker-trigger" aria-haspopup="dialog" aria-expanded="false" aria-controls="${id}-dialog" aria-labelledby="${id}-label ${id}-value"><span id="${id}-value" class="wagon-picker-value"></span><span class="wagon-picker-chevron" aria-hidden="true">⌄</span></button>
      <dialog id="${id}-dialog" class="wagon-picker-dialog" aria-labelledby="${id}-title">
        <div class="wagon-picker-heading"><h3 id="${id}-title">${t(label)}</h3><button type="button" class="wagon-picker-close" aria-label="${t('Cerrar')}">×</button></div>
        <div class="wagon-picker-list" role="listbox" aria-labelledby="${id}-title">${choices.map((entry, index) => `<button type="button" class="wagon-choice" role="option" aria-selected="false" tabindex="-1" data-index="${index}">${content(entry)}<span class="wagon-choice-check" aria-hidden="true">✓</span></button>`).join('')}</div>
      </dialog>`;
    const input = host.querySelector('input'), trigger = host.querySelector('.wagon-picker-trigger');
    const value = host.querySelector('.wagon-picker-value'), dialog = host.querySelector('dialog');
    const options = [...host.querySelectorAll('[role="option"]')];
    input.value = selection[name] || '';
    let search = '', searchedAt = 0;

    function position() {
      if (!dialog.open) return;
      const viewport = window.visualViewport;
      const width = viewport?.width || innerWidth, height = viewport?.height || innerHeight;
      if (matchMedia('(max-width: 700px)').matches) {
        dialog.style.removeProperty('left'); dialog.style.removeProperty('top'); dialog.style.removeProperty('width');
        return;
      }
      const box = trigger.getBoundingClientRect(), panelWidth = Math.min(Math.max(box.width, 320), width - 24);
      dialog.style.width = `${panelWidth}px`;
      dialog.style.left = `${Math.max(12, Math.min(box.left, width - panelWidth - 12))}px`;
      const panelHeight = dialog.getBoundingClientRect().height;
      const below = box.bottom + 8;
      dialog.style.top = `${Math.max(12, Math.min(below + panelHeight <= height - 12 ? below : box.top - panelHeight - 8, height - panelHeight - 12))}px`;
    }
    function focusOption(index) {
      options.forEach((option, i) => { option.tabIndex = i === index ? 0 : -1; });
      options[index].focus({ preventScroll: true });
      options[index].scrollIntoView({ block: 'nearest' });
    }
    function render() {
      const selected = choices.find(entry => entry.color === input.value) || choices[0];
      input.value = selected.color;
      value.innerHTML = content(selected);
      for (const dot of host.querySelectorAll('.wagon-color-dot')) dot.style.backgroundColor = dot.dataset.color;
      const other = pickers.find(picker => picker.name !== name)?.input.value;
      options.forEach((option, index) => {
        const entry = choices[index], disabled = !!entry.color && entry.color === other;
        option.setAttribute('aria-selected', String(entry.color === input.value));
        option.setAttribute('aria-disabled', String(disabled));
        option.title = disabled ? translate('El segundo color debe ser diferente del primero.') : '';
      });
    }
    function open() {
      if (dialog.open) return;
      for (const picker of pickers) if (picker.dialog.open) picker.dialog.close();
      render();
      dialog.showModal(); trigger.setAttribute('aria-expanded', 'true');
      position(); search = '';
      focusOption(Math.max(0, choices.findIndex(entry => entry.color === input.value)));
    }
    trigger.addEventListener('click', open, { signal });
    trigger.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); open(); }
    }, { signal });
    dialog.querySelector('.wagon-picker-close').addEventListener('click', () => dialog.close(), { signal });
    dialog.addEventListener('close', () => {
      trigger.setAttribute('aria-expanded', 'false');
      if (trigger.isConnected) trigger.focus({ preventScroll: true });
    }, { signal });
    // A drag that starts in the list must not dismiss the panel when released outside it.
    let backdrop = false;
    dialog.addEventListener('pointerdown', event => { backdrop = event.target === dialog; }, { signal });
    dialog.addEventListener('click', event => { if (backdrop && event.target === dialog) dialog.close(); }, { signal });
    options.forEach((option, index) => {
      option.addEventListener('click', () => {
        if (option.getAttribute('aria-disabled') === 'true') return;
        input.value = choices[index].color;
        for (const picker of pickers) picker.render();
        if (name === 'color') onColor(input.value);
        form.querySelector('#customizationStatus').textContent = '';
        dialog.close();
      }, { signal });
      option.addEventListener('keydown', event => {
        let next = null;
        const enabled = options.map((item, i) => item.getAttribute('aria-disabled') === 'true' ? -1 : i).filter(i => i >= 0);
        const cursor = enabled.indexOf(index);
        if (event.key === 'ArrowDown') next = enabled[(cursor + 1) % enabled.length];
        else if (event.key === 'ArrowUp') next = enabled[(cursor - 1 + enabled.length) % enabled.length];
        else if (event.key === 'Home') next = enabled[0];
        else if (event.key === 'End') next = enabled.at(-1);
        else if (event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey) {
          const now = Date.now(); search = now - searchedAt > 700 ? event.key : search + event.key; searchedAt = now;
          const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
          next = enabled.find(i => normalize(translate(choices[i].name)).startsWith(normalize(search))) ?? null;
        }
        if (next !== null) { event.preventDefault(); focusOption(next); }
      }, { signal });
    });
    window.addEventListener('resize', position, { signal });
    window.visualViewport?.addEventListener('resize', position, { signal });
    window.addEventListener('scroll', position, { signal, capture: true });
    window.addEventListener('popstate', () => { if (dialog.open) dialog.close(); }, { signal });
    pickers.push({ name, input, dialog, render });
  }
  for (const picker of pickers) picker.render();
  onColor(pickers[0].input.value);
  return () => {
    lifetime.abort();
    for (const picker of pickers) { if (picker.dialog.open) picker.dialog.close(); }
  };
}
