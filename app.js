/* ==========================================================
   RUC rápido · lógica
   1) Carga data.json  2) Busca en tiempo real
   3) Contrae / expande el panel  4) Copia el RUC al portapapeles
   ========================================================== */
(() => {
  'use strict';

  const DATA_URL = 'data.json';
  const STORAGE_KEY = 'ruc-widget-collapsed';

  const $ = (id) => document.getElementById(id);
  const els = {
    widget: $('widget'), toggle: $('toggleBtn'), search: $('search'),
    list: $('list'), empty: $('empty'), count: $('count'), toast: $('toast'), pin: $('pinBtn'),
  };

  let companies = [];   // todos los registros
  let visible = [];     // registros que coinciden con la búsqueda
  let toastTimer;

  /* ---------- Utilidades ---------- */

  // Minúsculas y sin tildes: "Pacífico" también coincide con "pacifico"
  const normalize = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Evita que el texto del JSON se interprete como HTML
  const escapeHTML = (s) =>
    s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- Carga de datos ---------- */

  async function loadData() {
    try {
      const res = await fetch(DATA_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      // Se guarda una clave de búsqueda ya normalizada para filtrar más rápido
      companies = data.map((c) => ({ ...c, key: normalize(c.name) }));
      applyFilter();
    } catch (err) {
      showMessage('No se pudo cargar data.json. Abre la página desde un servidor (GitHub Pages o Live Server), no con doble clic.');
    }
  }

  /* ---------- Buscador ---------- */

  function applyFilter() {
    const q = normalize(els.search.value.trim());
    const digits = q.replace(/\D/g, '');          // si escribe números, compara con el RUC
    visible = companies.filter((c) => !q || c.key.includes(q) || (digits && c.ruc.includes(digits)));
    render();
  }

  function render() {
    els.count.textContent = visible.length;
    els.list.innerHTML = visible.map((c) => `
      <li class="item">
        <div class="item__info">
          <div class="item__name" title="${escapeHTML(c.name)}">${escapeHTML(c.name)}</div>
          <div class="item__ruc">${escapeHTML(c.ruc)}</div>
        </div>
        <button type="button" class="item__copy" data-ruc="${escapeHTML(c.ruc)}">Copiar</button>
      </li>`).join('');

    if (visible.length) els.empty.hidden = true;
    else showMessage('Sin resultados. Prueba con otra razón social o RUC.');
  }

  function showMessage(text) {
    els.empty.textContent = text;
    els.empty.hidden = false;
  }

  /* ---------- Copiar al portapapeles ---------- */

  async function copyText(text) {
    // El widget puede estar en la página o en la ventana flotante: se usa la ventana donde esté
    const doc = els.widget.ownerDocument;
    try {
      await doc.defaultView.navigator.clipboard.writeText(text);
    } catch {
      // Respaldo para navegadores o contextos sin Clipboard API
      const ta = doc.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0';
      doc.body.appendChild(ta);
      ta.select();
      doc.execCommand('copy');
      ta.remove();
    }
  }

  async function copyRuc(ruc, button) {
    await copyText(ruc);

    // Respuesta visual 1: el botón cambia de estado durante 1.5 s
    if (button) {
      button.classList.add('is-copied');
      button.textContent = 'Copiado';
      setTimeout(() => {
        button.classList.remove('is-copied');
        button.textContent = 'Copiar';
      }, 1500);
    }

    // Respuesta visual 2: aviso flotante
    els.toast.textContent = `RUC ${ruc} copiado`;
    els.toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('is-visible'), 1800);
  }

  /* ---------- Contraer / expandir ---------- */

  function setCollapsed(collapsed) {
    els.widget.classList.toggle('is-collapsed', collapsed);
    els.toggle.setAttribute('aria-expanded', String(!collapsed));
    // Impide enfocar con Tab elementos ocultos
    els.widget.querySelector('.widget__inner').inert = collapsed;
    try { localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0'); } catch { /* sin almacenamiento */ }
  }

  /* ---------- Fijar encima de otras ventanas ----------
     Usa la API Document Picture-in-Picture (Chrome / Edge de escritorio):
     mueve el widget a una ventanita que se queda siempre por encima. */

  let pipWindow = null;

  async function togglePin() {
    if (pipWindow) { pipWindow.close(); return; }   // si ya está fijado, se desfija

    try {
      pipWindow = await documentPictureInPicture.requestWindow({ width: 360, height: 480 });
    } catch {
      pipWindow = null;
      return;
    }

    // La ventana nueva está vacía: se le copian los estilos de la página
    const css = [...document.styleSheets]
      .map((sheet) => [...sheet.cssRules].map((rule) => rule.cssText).join(''))
      .join('');
    const style = pipWindow.document.createElement('style');
    style.textContent = css;
    pipWindow.document.head.append(style);

    els.widget.classList.add('is-pinned');
    pipWindow.document.body.append(els.widget, els.toast);

    // Al cerrar la ventana flotante, el widget vuelve a la página
    pipWindow.addEventListener('pagehide', () => {
      els.widget.classList.remove('is-pinned');
      document.body.append(els.widget, els.toast);
      pipWindow = null;
    });
  }

  /* ---------- Eventos ---------- */

  els.toggle.addEventListener('click', () =>
    setCollapsed(!els.widget.classList.contains('is-collapsed')));

  els.search.addEventListener('input', applyFilter);

  els.search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && visible.length) {
      // Atajo: Enter copia el primer resultado
      const first = els.list.querySelector('.item__copy');
      copyRuc(visible[0].ruc, first);
    }
    if (e.key === 'Escape') { els.search.value = ''; applyFilter(); }
  });

  // Un solo listener para todos los botones "Copiar"
  els.list.addEventListener('click', (e) => {
    const btn = e.target.closest('.item__copy');
    if (btn) copyRuc(btn.dataset.ruc, btn);
  });

  /* ---------- Inicio ---------- */

  let startCollapsed = false;
  try { startCollapsed = localStorage.getItem(STORAGE_KEY) === '1'; } catch { /* ignorar */ }
  setCollapsed(startCollapsed);

  // El botón de fijar solo aparece si el navegador soporta la ventana flotante
  if ('documentPictureInPicture' in window) {
    els.pin.hidden = false;
    els.pin.addEventListener('click', togglePin);
  }

  loadData();
})();
