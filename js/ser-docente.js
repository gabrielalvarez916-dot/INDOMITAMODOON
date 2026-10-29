// ser-docente.js — centro del docente: solicitud + tus cursos.
// Para evaluar a alguien necesitamos ver su curso: la solicitud arranca con el nombre público y enseguida
// se carga el curso completo (video y PDF en cada clase). El estado (pendiente / aprobado / rechazado)
// solo lo cambia el admin.
(function () {
  var U = window.ModoOnUI, API = window.ModoOnApi, h = U.h, client = API.client;
  var cont = document.getElementById('contenido');

  function check(r) { if (r.error) throw r.error; return r.data; }
  function fail(e) { U.toast('No se pudo completar: ' + ((e && e.message) || e)); }

  var ESTADO_CURSO = {
    borrador: 'BORRADOR', en_revision: 'EN REVISIÓN', publicado: 'PUBLICADO', pausado: 'PAUSADO'
  };

  function boton(texto, cls, onclick) { return h('button', { type: 'button', class: 'ed-btn ' + (cls || ''), text: texto, onclick: onclick }); }
  function aviso(el, texto, mal) { el.textContent = texto; el.hidden = false; el.className = 'pl-aviso' + (mal ? ' pl-aviso--mal' : ' pl-aviso--ok'); }

  /* ---------- Estado de la solicitud ---------- */
  function textoEstado(doc, cursos) {
    if (doc.estado === 'aprobado') return ['APROBADO', '¡Ya sos docente de Modo On! Podés crear y enviar cursos para que los revisemos.'];
    if (doc.estado === 'suspendido') return ['SUSPENDIDO', 'Tu cuenta de docente está suspendida por ahora. Escribinos si querés saber más.'];
    if (doc.estado === 'rechazado') return ['NO APROBADO', 'Esta vez no pudimos aprobar tu solicitud. Escribinos si querés revisarla juntos.'];
    var enRev = cursos.some(function (c) { return c.estado === 'en_revision'; });
    var publicado = cursos.some(function (c) { return c.estado === 'publicado'; });
    if (enRev || publicado) return ['EN REVISIÓN', 'Recibimos tu curso y lo estamos revisando. Apenas se resuelva, vas a verlo acá.'];
    if (cursos.length) return ['EN PREPARACIÓN', 'Tenés un curso en borrador. Completalo (con video y PDF en cada clase) y enviálo a revisión: es lo que evaluamos para aprobar tu solicitud.'];
    return ['FALTA TU CURSO', 'Para evaluar tu solicitud necesitamos ver tu curso. Cargalo completo y enviálo a revisión.'];
  }

  /* ---------- Sin solicitud todavía ---------- */
  function pantallaInicio(sesion, nombreSugerido) {
    var inpNombre = h('input', { type: 'text', class: 'pl-input', id: 'f-nombre', maxlength: '80', value: nombreSugerido, placeholder: 'Cómo querés que te vean los alumnos' });
    var inpBio = h('textarea', { class: 'pl-input pl-textarea', id: 'f-bio', maxlength: '600', placeholder: 'Opcional: contanos algo sobre vos' });
    var enviar = h('button', { type: 'button', class: 'pl-btn pl-btn--lima', text: 'Empezar y cargar mi curso' });
    var av = h('p', { class: 'pl-aviso', hidden: true, role: 'status' });

    enviar.addEventListener('click', function () {
      var nombre = inpNombre.value.trim().replace(/\s+/g, ' ');
      if (nombre.length < 2) { aviso(av, 'Escribí tu nombre público.', true); inpNombre.focus(); return; }
      enviar.disabled = true; av.hidden = true;
      client.from('docentes').insert({ usuario_id: sesion.user.id, nombre_publico: nombre, bio_publica: inpBio.value.trim() || null })
        .then(check).then(function () { window.location.href = 'editar-curso.html'; })
        .catch(function (e) {
          enviar.disabled = false;
          aviso(av, e && e.code === '23505' ? 'Ya enviaste una solicitud.' : 'No pudimos enviarla: ' + ((e && e.message) || e), true);
        });
    });

    U.limpiar(cont);
    cont.appendChild(h('section', { class: 'pl-caja' },
      h('ul', { class: 'pl-checks' },
        h('li', null, h('span', { class: 'pl-check', text: '1' }), 'Contanos cómo te llamás (nombre público).'),
        h('li', null, h('span', { class: 'pl-check', text: '2' }), 'Cargá tu curso completo: datos, portada y, en cada clase, un video y un PDF.'),
        h('li', null, h('span', { class: 'pl-check', text: '3' }), 'Lo revisamos. Si está bien, publicamos tu curso y quedás como docente.'))));
    cont.appendChild(h('section', { class: 'pl-caja pl-form' },
      h('h2', { class: 'pl-form__titulo', text: 'Tus datos' }),
      h('div', { class: 'pl-campo' }, h('label', { for: 'f-nombre', text: 'Nombre público' }), inpNombre),
      h('div', { class: 'pl-campo' }, h('label', { for: 'f-bio', text: 'Sobre vos (opcional)' }), inpBio),
      av, h('div', null, enviar)));
  }

  /* ---------- Con solicitud ---------- */
  function listaCursos(cursos, puedeCrear) {
    var sec = h('section', { class: 'pl-caja ed-seccion' }, h('h2', { text: 'Tus cursos' }));
    if (!cursos.length) {
      sec.appendChild(h('p', { class: 'pl-texto', text: 'Todavía no cargaste ningún curso.' }));
    } else {
      sec.appendChild(h('div', { class: 'ed-cursos' }, cursos.map(function (c) {
        var editable = c.estado === 'borrador';
        return h('article', { class: 'ed-curso' },
          h('div', { class: 'ed-curso__info' },
            h('p', { class: 'ed-curso__titulo' }, c.titulo || 'Sin título', h('span', { class: 'pl-pill pl-pill--cat ed-pill', text: ESTADO_CURSO[c.estado] || c.estado })),
            h('p', { class: 'pl-meta', text: 'Actualizado el ' + U.fechaCorta(c.actualizado_en) }),
            editable && c.nota_revision ? h('p', { class: 'ed-curso__nota', text: 'Devuelto: ' + c.nota_revision }) : null),
          h('a', { class: 'ed-btn ' + (editable ? 'ed-btn--ok' : ''), href: 'editar-curso.html?id=' + encodeURIComponent(c.id), text: editable ? 'Editar' : 'Ver' }));
      })));
    }
    if (puedeCrear) sec.appendChild(h('div', { class: 'ed-acciones' }, h('a', { class: 'ed-btn ed-btn--ok ed-btn--grande', href: 'editar-curso.html', text: '＋ Crear un curso' })));
    return sec;
  }

  function editarDatos(sesion, doc) {
    var inpNombre = h('input', { type: 'text', class: 'pl-input', id: 'f-nombre', maxlength: '80', value: doc.nombre_publico });
    var inpBio = h('textarea', { class: 'pl-input pl-textarea', id: 'f-bio', maxlength: '600', placeholder: 'Opcional' });
    inpBio.value = doc.bio_publica || '';
    var av = h('p', { class: 'pl-aviso', hidden: true, role: 'status' });
    var guardar = boton('Guardar cambios', 'ed-btn--ok', function () {
      var nombre = inpNombre.value.trim().replace(/\s+/g, ' ');
      if (nombre.length < 2) { aviso(av, 'Escribí tu nombre público.', true); return; }
      guardar.disabled = true;
      client.from('docentes').update({ nombre_publico: nombre, bio_publica: inpBio.value.trim() || null }).eq('usuario_id', sesion.user.id).select('usuario_id')
        .then(check).then(function (d) {
          if (!d || !d.length) throw new Error('la base no permitió guardar el cambio');
          doc.nombre_publico = nombre; aviso(av, 'Listo, guardamos los cambios.', false);
        }).catch(function (e) { aviso(av, 'No pudimos guardar: ' + ((e && e.message) || e), true); })
        .then(function () { guardar.disabled = false; });
    });
    return h('details', { class: 'pl-caja ed-datos' }, h('summary', { text: 'Editar mis datos de docente' }),
      h('div', { class: 'pl-form', style: 'margin-top:14px' },
        h('div', { class: 'pl-campo' }, h('label', { for: 'f-nombre', text: 'Nombre público' }), inpNombre),
        h('div', { class: 'pl-campo' }, h('label', { for: 'f-bio', text: 'Sobre vos' }), inpBio),
        av, h('div', null, guardar)));
  }

  function pantallaDocente(sesion, doc, cursos) {
    var e = textoEstado(doc, cursos);
    var activo = doc.estado === 'pendiente' || doc.estado === 'aprobado';
    U.limpiar(cont);
    cont.appendChild(h('section', { class: 'pl-caja pl-estado' },
      h('p', { class: 'pl-estado__fila' }, h('span', { class: 'pl-pill ' + (doc.estado === 'aprobado' ? 'pl-pill--nuevo' : 'pl-pill--cat'), text: e[0] }),
        h('span', { class: 'pl-meta', text: 'Solicitud del ' + U.fechaCorta(doc.creado_en) })),
      h('p', { class: 'pl-texto', text: e[1] })));
    if (!activo) return;
    cont.appendChild(listaCursos(cursos, true));
    cont.appendChild(editarDatos(sesion, doc));
  }

  function cargar(sesion) {
    var meta = sesion.user.user_metadata || {};
    Promise.all([
      client.from('docentes').select('nombre_publico, bio_publica, estado, creado_en').eq('usuario_id', sesion.user.id).maybeSingle().then(check),
      client.from('perfiles').select('nombre').eq('id', sesion.user.id).maybeSingle().then(check),
      client.from('cursos').select('id, titulo, estado, nota_revision, actualizado_en').eq('docente_id', sesion.user.id).order('actualizado_en', { ascending: false }).then(check)
    ]).then(function (r) {
      if (!r[0]) pantallaInicio(sesion, (r[1] && r[1].nombre) || meta.full_name || meta.name || '');
      else pantallaDocente(sesion, r[0], r[2] || []);
    }).catch(function (e) {
      U.limpiar(cont);
      cont.appendChild(h('div', { class: 'pl-aviso pl-aviso--mal', text: 'No pudimos cargar esta sección: ' + ((e && e.message) || e) }));
    });
  }

  U.iniciarPagina(client).then(function (s) { if (s) cargar(s); });
})();
