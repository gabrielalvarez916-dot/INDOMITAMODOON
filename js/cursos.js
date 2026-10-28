// cursos.js — feed: donde cae cada usuario al entrar.
// Banner publicitario 4:1 (imagen o video), buscador por curso o docente,
// filtro por tipo de curso (categoría) y tarjetas estilo Udemy.
(function () {
  var U = window.ModoOnUI, API = window.ModoOnApi, T = window.ModoOnTarjetas, h = U.h;
  var DURACION_DEFAULT_MS = 10000;

  var el = {
    banner: document.getElementById('banner'),
    buscar: document.getElementById('buscar'),
    borrar: document.getElementById('buscar-borrar'),
    chips: document.getElementById('chips'),
    contador: document.getElementById('contador'),
    grid: document.getElementById('grid'),
    estado: document.getElementById('estado')
  };

  var estado = { cursos: [], categorias: [], categoriaId: null, q: '' };

  /* ---------------- Banner ---------------- */
  var timer = null;

  function bannerPropio() {
    return h('div', { class: 'pl-banner__propio' },
      h('p', { class: 'pl-logo', role: 'img', 'aria-label': 'Modo On' },
        h('span', { 'aria-hidden': 'true', text: 'MODO' }),
        h('span', { class: 'pl-switch', 'aria-hidden': 'true' }, h('span', { class: 'pl-switch__knob' })),
        h('span', { 'aria-hidden': 'true', text: 'N' })),
      h('p', { class: 'pl-banner__lema', text: 'More skills. More possibilities.' })
    );
  }

  function renderBanner(lista) {
    U.limpiar(el.banner);
    if (!lista.length) { el.banner.appendChild(bannerPropio()); return; }

    var slides = lista.map(function (b, i) {
      var destino = b.curso_id ? 'curso.html?id=' + encodeURIComponent(b.curso_id) : U.linkSeguro(b.link_destino);
      var media;
      if (b.tipo === 'video') {
        media = h('video', { src: b.imagen_url, muted: true, loop: true, playsinline: true, preload: i === 0 ? 'auto' : 'metadata', 'aria-hidden': 'true' });
        media.muted = true; // algunos navegadores exigen la propiedad, no solo el atributo, para permitir autoplay
      } else {
        media = h('img', { src: b.imagen_url, alt: 'Publicidad', decoding: 'async' });
      }
      var attrs = { class: 'pl-slide' + (i === 0 ? ' is-active' : '') };
      var slide;
      if (destino) {
        attrs.href = destino;
        if (!b.curso_id) { attrs.target = '_blank'; attrs.rel = 'noopener noreferrer sponsored'; }
        slide = h('a', attrs, media);
      } else {
        slide = h('div', attrs, media);
      }
      return slide;
    });

    var marco = h('div', { class: 'pl-banner__marco' }, slides);
    el.banner.appendChild(marco);

    var actual = 0, puntos = [];
    function ir(i) {
      actual = (i + slides.length) % slides.length;
      slides.forEach(function (s, k) {
        var activo = k === actual;
        s.classList.toggle('is-active', activo);
        var v = s.querySelector('video');
        if (v) { if (activo) { v.currentTime = 0; var p = v.play(); if (p && p.catch) p.catch(function () {}); } else v.pause(); }
        if (puntos[k]) puntos[k].classList.toggle('is-active', activo);
      });
      programar();
    }
    function programar() {
      clearTimeout(timer);
      if (slides.length <= 1) return;
      var ms = lista[actual].duracion_segundos ? lista[actual].duracion_segundos * 1000 : DURACION_DEFAULT_MS;
      timer = setTimeout(function () { ir(actual + 1); }, ms);
    }

    if (slides.length > 1) {
      var nav = h('div', { class: 'pl-banner__puntos' });
      lista.forEach(function (_, i) {
        var p = h('button', { type: 'button', class: 'pl-punto' + (i === 0 ? ' is-active' : ''), 'aria-label': 'Ir al banner ' + (i + 1), onclick: function () { ir(i); } });
        puntos.push(p); nav.appendChild(p);
      });
      el.banner.appendChild(nav);
    }
    var v0 = slides[0].querySelector('video');
    if (v0) { var pr = v0.play(); if (pr && pr.catch) pr.catch(function () {}); }
    programar();

    // Si la pestaña queda oculta se pausa el carrusel (y el video)
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { clearTimeout(timer); slides.forEach(function (s) { var v = s.querySelector('video'); if (v) v.pause(); }); }
      else { var va = slides[actual].querySelector('video'); if (va) { var q = va.play(); if (q && q.catch) q.catch(function () {}); } programar(); }
    });
  }

  /* ---------------- Filtros + lista ---------------- */
  function renderChips() {
    U.limpiar(el.chips);
    if (!estado.categorias.length) return;
    [{ id: null, nombre: 'Todos' }].concat(estado.categorias).forEach(function (c) {
      var activa = estado.categoriaId === c.id;
      el.chips.appendChild(h('button', {
        type: 'button', class: 'pl-chip' + (activa ? ' is-active' : ''), 'aria-pressed': activa ? 'true' : 'false', text: c.nombre,
        onclick: function () { estado.categoriaId = c.id; renderChips(); renderLista(); }
      }));
    });
  }

  function visibles() {
    var q = U.normalizar(estado.q);
    return estado.cursos.filter(function (c) {
      if (estado.categoriaId && c.categoria_id !== estado.categoriaId) return false;
      if (!q) return true;
      return U.normalizar(c.titulo).indexOf(q) !== -1 || U.normalizar(c.docente_nombre).indexOf(q) !== -1;
    });
  }

  function mensaje(icono, titulo, texto, boton) {
    U.limpiar(el.estado);
    el.estado.appendChild(h('div', { class: 'pl-vacio' },
      h('span', { class: 'pl-vacio__icono', 'aria-hidden': 'true', text: icono }),
      h('h2', { text: titulo }),
      h('p', { text: texto }),
      boton || null));
  }

  function renderLista() {
    var lista = visibles();
    var hayFiltros = !!estado.q || !!estado.categoriaId;
    U.limpiar(el.grid);
    U.limpiar(el.estado);
    el.contador.textContent = estado.cursos.length
      ? (lista.length === 1 ? '1 curso' : lista.length + ' cursos') + (hayFiltros ? ' encontrados' : '')
      : '';
    lista.forEach(function (c) { el.grid.appendChild(T.tarjeta(c)); });

    if (!estado.cursos.length) {
      mensaje('🎓', 'Muy pronto, nuevos cursos', 'Todavía no hay cursos publicados. Volvé en unos días.');
    } else if (!lista.length) {
      mensaje('🔍', 'Sin resultados', 'No encontramos cursos con esa búsqueda o filtro.',
        h('button', { type: 'button', class: 'pl-btn pl-btn--negro', text: 'Quitar filtros', onclick: function () {
          estado.q = ''; estado.categoriaId = null; el.buscar.value = ''; el.borrar.hidden = true; renderChips(); renderLista();
        } }));
    }
  }

  el.buscar.addEventListener('input', function () {
    estado.q = el.buscar.value;
    el.borrar.hidden = !estado.q;
    renderLista();
  });
  el.borrar.addEventListener('click', function () {
    el.buscar.value = ''; estado.q = ''; el.borrar.hidden = true; el.buscar.focus(); renderLista();
  });

  /* ---------------- Carga ---------------- */
  function cargar() {
    mensaje('⏳', 'Cargando cursos…', '');
    Promise.all([
      API.cursosFeed(),
      API.banners().catch(function () { return []; }),     // si fallan los banners, el feed sigue andando
      API.categorias().catch(function () { return []; })
    ]).then(function (r) {
      estado.cursos = r[0]; estado.categorias = r[2];
      renderBanner(r[1]); renderChips(); renderLista();
    }).catch(function (e) {
      console.log('Error cargando el feed:', e);
      renderBanner([]);
      mensaje('📡', 'No pudimos cargar los cursos', 'Revisá tu conexión e intentá de nuevo.',
        h('button', { type: 'button', class: 'pl-btn pl-btn--negro', text: 'Reintentar', onclick: cargar }));
    });
  }

  U.iniciarPagina(API.client).then(function (s) { if (s) cargar(); });
})();
