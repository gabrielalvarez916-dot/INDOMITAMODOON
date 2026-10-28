// perfil.js — ver y editar el propio perfil (nombre y biografía).
(function () {
  var U = window.ModoOnUI, API = window.ModoOnApi, h = U.h, client = API.client;
  var cont = document.getElementById('contenido');

  function check(r) { if (r.error) throw r.error; return r.data; }
  function inicial(t) { return (String(t || '?').trim().charAt(0) || '?').toUpperCase(); }

  function pintar(sesion, perfil) {
    var meta = sesion.user.user_metadata || {};
    var nombreInicial = (perfil && perfil.nombre) || meta.full_name || meta.name || '';
    var avatar = (perfil && perfil.avatar_url) || meta.avatar_url || meta.picture || '';

    var inpNombre = h('input', { type: 'text', class: 'pl-input', id: 'f-nombre', maxlength: '80', value: nombreInicial, autocomplete: 'name' });
    var inpBio = h('textarea', { class: 'pl-input pl-textarea', id: 'f-bio', maxlength: '300', placeholder: 'Contanos algo sobre vos (opcional)' });
    inpBio.value = (perfil && perfil.bio) || '';
    var guardar = h('button', { type: 'button', class: 'pl-btn pl-btn--negro', text: 'Guardar cambios' });
    var aviso = h('p', { class: 'pl-aviso', hidden: true, role: 'status' });

    function msg(texto, mal) {
      aviso.textContent = texto; aviso.hidden = false;
      aviso.className = 'pl-aviso' + (mal ? ' pl-aviso--mal' : ' pl-aviso--ok');
    }

    guardar.addEventListener('click', function () {
      var nombre = inpNombre.value.trim().replace(/\s+/g, ' ');
      if (nombre.length < 2) { msg('Escribí tu nombre (mínimo 2 letras).', true); inpNombre.focus(); return; }
      guardar.disabled = true; aviso.hidden = true;
      client.from('perfiles').update({ nombre: nombre, bio: inpBio.value.trim() || null }).eq('id', sesion.user.id).select('id')
        .then(check).then(function (d) {
          if (!d || !d.length) throw new Error('la base no permitió guardar el cambio');
          msg('Listo, guardamos tu perfil.', false);
        }).catch(function (e) { msg('No pudimos guardar: ' + ((e && e.message) || e), true); })
        .then(function () { guardar.disabled = false; });
    });

    U.limpiar(cont);
    cont.appendChild(h('section', { class: 'pl-caja pl-form' },
      h('div', { class: 'pl-perfil-cab' },
        h('div', { class: 'pl-avatar pl-avatar--inicial' }, U.linkSeguro(avatar) ? h('img', { src: avatar, alt: '', class: 'pl-avatar__img', referrerpolicy: 'no-referrer' }) : inicial(nombreInicial || sesion.user.email)),
        h('div', null,
          h('p', { class: 'pl-perfil-nombre', text: nombreInicial || 'Sin nombre' }),
          h('p', { class: 'pl-meta', text: sesion.user.email || '' }))),
      h('div', { class: 'pl-campo' }, h('label', { for: 'f-nombre', text: 'Nombre' }), inpNombre),
      h('div', { class: 'pl-campo' }, h('label', { for: 'f-bio', text: 'Sobre vos' }), inpBio, h('small', { text: 'Hasta 300 caracteres.' })),
      aviso,
      h('div', null, guardar)));
  }

  function cargar(sesion) {
    client.from('perfiles').select('nombre, bio, avatar_url').eq('id', sesion.user.id).maybeSingle()
      .then(check).then(function (p) { pintar(sesion, p); })
      .catch(function (e) {
        U.limpiar(cont);
        cont.appendChild(h('div', { class: 'pl-aviso pl-aviso--mal', text: 'No pudimos cargar tu perfil: ' + ((e && e.message) || e) }));
      });
  }

  U.iniciarPagina(client).then(function (s) { if (s) cargar(s); });
})();
