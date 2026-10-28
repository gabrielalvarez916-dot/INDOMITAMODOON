// ser-docente.js — solicitud para ser docente. El estado (pendiente / aprobado / rechazado)
// solo lo cambia el admin; acá la persona envía su nombre público y su bio.
(function () {
  var U = window.ModoOnUI, API = window.ModoOnApi, h = U.h, client = API.client;
  var cont = document.getElementById('contenido');

  function check(r) { if (r.error) throw r.error; return r.data; }

  var ESTADOS = {
    pendiente: { pill: 'En revisión', cls: 'pl-pill--cat', texto: 'Recibimos tu solicitud. La estamos revisando y apenas se resuelva vas a verlo acá.' },
    aprobado: { pill: 'Aprobado', cls: 'pl-pill--nuevo', texto: '¡Ya sos docente de Modo On! Tu nombre público y tu bio aparecen en tus cursos.' },
    suspendido: { pill: 'Suspendido', cls: 'pl-pill--cat', texto: 'Tu cuenta de docente está suspendida por ahora. Escribinos si querés saber más.' },
    rechazado: { pill: 'No aprobado', cls: 'pl-pill--cat', texto: 'Esta vez no pudimos aprobar tu solicitud. Escribinos si querés revisarla juntos.' }
  };

  function formulario(sesion, docente, nombreSugerido) {
    var existe = !!docente;
    var inpNombre = h('input', { type: 'text', class: 'pl-input', id: 'f-nombre', maxlength: '80', value: existe ? docente.nombre_publico : nombreSugerido, placeholder: 'Cómo querés que te vean los alumnos' });
    var inpBio = h('textarea', { class: 'pl-input pl-textarea', id: 'f-bio', maxlength: '600', placeholder: 'Contanos qué enseñás y tu experiencia' });
    inpBio.value = existe ? (docente.bio_publica || '') : '';
    var enviar = h('button', { type: 'button', class: 'pl-btn pl-btn--lima', text: existe ? 'Guardar cambios' : 'Enviar solicitud' });
    var aviso = h('p', { class: 'pl-aviso', hidden: true, role: 'status' });

    function msg(t, mal) { aviso.textContent = t; aviso.hidden = false; aviso.className = 'pl-aviso' + (mal ? ' pl-aviso--mal' : ' pl-aviso--ok'); }

    enviar.addEventListener('click', function () {
      var nombre = inpNombre.value.trim().replace(/\s+/g, ' ');
      var bio = inpBio.value.trim();
      if (nombre.length < 2) { msg('Escribí tu nombre público.', true); inpNombre.focus(); return; }
      if (!existe && bio.length < 20) { msg('Contanos un poco más sobre vos (mínimo 20 caracteres).', true); inpBio.focus(); return; }
      enviar.disabled = true; aviso.hidden = true;
      var op = existe
        ? client.from('docentes').update({ nombre_publico: nombre, bio_publica: bio || null }).eq('usuario_id', sesion.user.id).select('usuario_id').then(check).then(function (d) {
            if (!d || !d.length) throw new Error('la base no permitió guardar el cambio');
            msg('Listo, guardamos los cambios.', false);
          })
        : client.from('docentes').insert({ usuario_id: sesion.user.id, nombre_publico: nombre, bio_publica: bio }).then(check).then(function () { cargar(sesion); });
      op.catch(function (e) {
        msg(e && e.code === '23505' ? 'Ya enviaste una solicitud.' : 'No pudimos enviarla: ' + ((e && e.message) || e), true);
      }).then(function () { enviar.disabled = false; });
    });

    return h('section', { class: 'pl-caja pl-form' },
      h('h2', { class: 'pl-form__titulo', text: existe ? 'Tus datos de docente' : 'Completá tu solicitud' }),
      h('div', { class: 'pl-campo' }, h('label', { for: 'f-nombre', text: 'Nombre público' }), inpNombre),
      h('div', { class: 'pl-campo' }, h('label', { for: 'f-bio', text: 'Biografía' }), inpBio, h('small', { text: 'Hasta 600 caracteres. La ven los alumnos.' })),
      aviso, h('div', null, enviar));
  }

  function pintar(sesion, docente, nombreSugerido) {
    U.limpiar(cont);
    if (docente) {
      var e = ESTADOS[docente.estado] || { pill: docente.estado, cls: 'pl-pill--cat', texto: '' };
      cont.appendChild(h('section', { class: 'pl-caja pl-estado' },
        h('p', { class: 'pl-estado__fila' }, h('span', { class: 'pl-pill ' + e.cls, text: e.pill.toUpperCase() }), h('span', { class: 'pl-meta', text: 'Solicitud del ' + U.fechaCorta(docente.creado_en) })),
        h('p', { class: 'pl-texto', text: e.texto })));
      if (docente.estado === 'rechazado' || docente.estado === 'suspendido') return;
    } else {
      cont.appendChild(h('section', { class: 'pl-caja' },
        h('ul', { class: 'pl-checks' },
          h('li', null, h('span', { class: 'pl-check', text: '✓' }), 'Publicás tus cursos con tu nombre y tu bio.'),
          h('li', null, h('span', { class: 'pl-check', text: '✓' }), 'Revisamos tu solicitud antes de aprobarla.'),
          h('li', null, h('span', { class: 'pl-check', text: '✓' }), 'Si te aprueban, ya podés empezar a armar tu primer curso.'))));
    }
    cont.appendChild(formulario(sesion, docente, nombreSugerido));
  }

  function cargar(sesion) {
    var meta = sesion.user.user_metadata || {};
    Promise.all([
      client.from('docentes').select('nombre_publico, bio_publica, estado, creado_en').eq('usuario_id', sesion.user.id).maybeSingle().then(check),
      client.from('perfiles').select('nombre').eq('id', sesion.user.id).maybeSingle().then(check)
    ]).then(function (r) {
      pintar(sesion, r[0], (r[1] && r[1].nombre) || meta.full_name || meta.name || '');
    }).catch(function (e) {
      U.limpiar(cont);
      cont.appendChild(h('div', { class: 'pl-aviso pl-aviso--mal', text: 'No pudimos cargar esta sección: ' + ((e && e.message) || e) }));
    });
  }

  U.iniciarPagina(client).then(function (s) { if (s) cargar(s); });
})();
