// ui.js — ayudas compartidas por las páginas de la plataforma (feed y curso).
(function () {
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  // Crea elementos de forma segura (todo el texto va por textContent, nunca como HTML).
  function h(tag, props) {
    var el = document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.indexOf('on') === 0 && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, kid) {
    if (kid == null || kid === false) return;
    if (Array.isArray(kid)) return kid.forEach(function (k) { append(el, k); });
    el.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
  }
  function limpiar(el) { while (el.firstChild) el.removeChild(el.firstChild); }

  // minúsculas y sin tildes (para buscar sin que importen los acentos)
  function normalizar(t) {
    return String(t == null ? '' : t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }
  function duracionLarga(seg) {
    var total = Math.round((Number(seg) || 0) / 60);
    if (total <= 0) return '';
    var hh = Math.floor(total / 60), m = total % 60;
    if (hh && m) return hh + ' h ' + m + ' min';
    if (hh) return hh + ' h';
    return m + ' min';
  }
  function duracionClase(seg) {
    var s = Number(seg) || 0;
    if (s <= 0) return '';
    var hh = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    function dos(n) { return (n < 10 ? '0' : '') + n; }
    return hh ? hh + ':' + dos(m) + ':' + dos(r) : m + ':' + dos(r);
  }
  function mesAnio(iso) {
    var f = new Date(iso);
    return iso && !isNaN(f.getTime()) ? MESES[f.getMonth()] + ' ' + f.getFullYear() : '';
  }
  function fechaCorta(iso) {
    var f = new Date(iso);
    return iso && !isNaN(f.getTime()) ? f.getDate() + ' ' + MESES[f.getMonth()] + ' ' + f.getFullYear() : '';
  }
  function estudiantesTexto(n) {
    var v = Number(n) || 0;
    if (v <= 0) return '';
    if (v >= 1000) return (v / 1000).toFixed(1).replace('.', ',').replace(',0', '') + ' mil estudiantes';
    return v === 1 ? '1 estudiante' : v + ' estudiantes';
  }
  // En la web se muestra el precio web (en la app, el de la app).
  function precioTexto(c) {
    if (c.es_gratis) return 'Gratis';
    if (c.precio_usd == null) return '';
    return 'USD ' + c.precio_usd;
  }
  function nota(n) { return Number(n).toFixed(1).replace('.', ','); }

  // Estrellas con relleno parcial (valor 0–5)
  function estrellas(valor) {
    var v = Math.max(0, Math.min(5, Number(valor) || 0));
    var el = h('span', { class: 'pl-stars', role: 'img', 'aria-label': nota(v) + ' de 5 estrellas' });
    el.style.setProperty('--pct', (v / 5) * 100 + '%');
    return el;
  }

  // Solo se aceptan links http(s)
  function linkSeguro(url) {
    try {
      var u = new URL(url);
      return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
    } catch (e) { return null; }
  }

  function toast(msg) {
    var t = document.getElementById('toast');
    if (!t) {
      t = h('div', { id: 'toast', class: 'pl-toast', role: 'status', 'aria-live': 'polite' });
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('is-visible');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('is-visible'); }, 3200);
  }

  // Cabecera negra con el logo y "Salir". Devuelve el cliente de Supabase ya con sesión o redirige al login.
  function iniciarPagina(client) {
    var salir = document.getElementById('logout');
    if (salir) salir.addEventListener('click', function () {
      client.auth.signOut().then(function () { window.location.replace('index.html'); });
    });
    return client.auth.getSession().then(function (r) {
      var s = r.data && r.data.session;
      if (!s) { window.location.replace('index.html'); return null; }
      mostrarLinkAdmin(client, s);
      return s;
    });
  }

  // Si quien entró es admin, aparece "Panel admin" en la cabecera (las demás personas no ven nada).
  function mostrarLinkAdmin(client, sesion) {
    if (/admin\.html$/.test(window.location.pathname)) return;
    client.from('roles_usuario').select('rol').eq('usuario_id', sesion.user.id).eq('rol', 'admin').maybeSingle()
      .then(function (r) {
        var salir = document.getElementById('logout');
        if (!r.data || !salir || document.getElementById('admin-link')) return;
        salir.parentNode.insertBefore(h('a', { id: 'admin-link', class: 'pl-salir pl-salir--link', href: 'admin.html', text: 'Panel admin' }), salir);
      }, function () {});
  }

  window.ModoOnUI = {
    h: h, limpiar: limpiar, normalizar: normalizar, duracionLarga: duracionLarga, duracionClase: duracionClase,
    mesAnio: mesAnio, fechaCorta: fechaCorta, estudiantesTexto: estudiantesTexto, precioTexto: precioTexto,
    nota: nota, estrellas: estrellas, linkSeguro: linkSeguro, toast: toast, iniciarPagina: iniciarPagina
  };
})();
