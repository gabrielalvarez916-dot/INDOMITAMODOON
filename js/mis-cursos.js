// mis-cursos.js — los cursos a los que la persona ya tiene acceso (inscripciones activas).
(function () {
  var U = window.ModoOnUI, API = window.ModoOnApi, T = window.ModoOnTarjetas, h = U.h, client = API.client;
  var cont = document.getElementById('contenido');

  function check(r) { if (r.error) throw r.error; return r.data; }

  function vacio() {
    U.limpiar(cont);
    cont.appendChild(h('div', { class: 'pl-vacio' },
      h('span', { class: 'pl-vacio__icono', 'aria-hidden': 'true', text: '🎓' }),
      h('h2', { text: 'Todavía no tenés cursos' }),
      h('p', { text: 'Cuando te inscribas o compres un curso, lo vas a encontrar acá.' }),
      h('a', { class: 'pl-btn pl-btn--negro', href: 'cursos.html', text: 'Ver cursos' })));
  }

  function cargar(sesion) {
    client.from('inscripciones').select('curso_id, creado_en').eq('usuario_id', sesion.user.id).eq('estado', 'activa')
      .order('creado_en', { ascending: false }).then(check).then(function (ins) {
        var ids = (ins || []).map(function (i) { return i.curso_id; });
        if (!ids.length) { vacio(); return; }
        return API.cursosFeed(ids).then(function (cursos) {
          cursos.sort(function (a, b) { return ids.indexOf(a.id) - ids.indexOf(b.id); });
          if (!cursos.length) { vacio(); return; }
          U.limpiar(cont);
          cont.appendChild(h('div', { class: 'pl-grid' }, cursos.map(T.tarjeta)));
        });
      }).catch(function (e) {
        U.limpiar(cont);
        cont.appendChild(h('div', { class: 'pl-aviso pl-aviso--mal', text: 'No pudimos cargar tus cursos: ' + ((e && e.message) || e) }));
      });
  }

  U.iniciarPagina(client).then(function (s) { if (s) cargar(s); });
})();
