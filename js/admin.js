// admin.js — panel de administración: docentes, cursos, banners y categorías.
// Solo abre si el usuario tiene rol "admin". La seguridad real la dan las reglas (RLS) y las funciones
// admin_* de la base: aunque alguien abra esta página, la base no le deja tocar nada si no es admin.
(function () {
  var U = window.ModoOnUI, API = window.ModoOnApi, h = U.h, client = API.client;
  var panel = document.getElementById('panel');
  var tabsEl = document.getElementById('tabs');

  var TABS = [
    { id: 'docentes', nombre: 'Docentes' },
    { id: 'cursos', nombre: 'Cursos' },
    { id: 'banners', nombre: 'Banners' },
    { id: 'categorias', nombre: 'Categorías' }
  ];
  var state = {
    tab: 'docentes',
    docFiltro: 'pendiente',
    curFiltro: 'en_revision',
    pendientes: { docentes: 0, cursos: 0 },
    bannerForm: null // null = cerrado, {} = nuevo, {banner} = editar
  };

  /* ---------------- Ayudas ---------------- */
  function check(r) { if (r.error) throw r.error; return r.data; }
  function fail(e) { U.toast('No se pudo completar: ' + ((e && e.message) || e)); }
  function uno(x) { return Array.isArray(x) ? x[0] : x; }
  function btn(text, cls, onclick, extra) {
    var props = { type: 'button', class: 'ad-btn ' + (cls || ''), text: text, onclick: onclick };
    if (extra) Object.keys(extra).forEach(function (k) { props[k] = extra[k]; });
    return h('button', props);
  }
  function cargando() { U.limpiar(panel); panel.appendChild(h('p', { class: 'ad-cargando', text: 'Cargando…' })); }
  function vacio(msg) { return h('div', { class: 'ad-vacio', text: msg }); }
  function errorVista(e) {
    U.limpiar(panel);
    panel.appendChild(h('div', { class: 'ad-error', text: 'No pudimos cargar esta sección: ' + ((e && e.message) || e) }));
  }
  function inicial(t) { return (String(t || '?').trim().charAt(0) || '?').toUpperCase(); }

  // Actualiza una fila y avisa si la base no dejó hacerlo (pasa cuando falta un permiso)
  function actualizar(tabla, id, campos) {
    return client.from(tabla).update(campos).eq('id', id).select('id').then(check).then(function (d) {
      if (!d || !d.length) throw new Error('la base no permitió el cambio');
      return d;
    });
  }

  // Reordena: intercambia el elemento i con su vecino y deja los números de orden 0,1,2…
  function mover(tabla, lista, i, dir) {
    var j = i + dir;
    if (j < 0 || j >= lista.length) return Promise.resolve();
    var arr = lista.slice(), t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    return Promise.all(arr.map(function (it, idx) {
      return it.orden === idx ? null : actualizar(tabla, it.id, { orden: idx });
    }));
  }

  function slugDe(t) {
    return U.normalizar(t).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function interruptor(texto, marcado, onchange) {
    var input = h('input', { type: 'checkbox', checked: marcado });
    input.addEventListener('change', function () { onchange(input.checked, input); });
    return h('label', { class: 'ad-switch' }, input, h('span', { class: 'ad-switch__riel', 'aria-hidden': 'true' }), h('span', { text: texto }));
  }

  function chips(opciones, actual, cuenta, onpick) {
    return h('div', { class: 'ad-filtros', role: 'group' }, opciones.map(function (o) {
      return h('button', {
        type: 'button', class: 'ad-chip' + (o[0] === actual ? ' is-active' : ''), onclick: function () { onpick(o[0]); }
      }, o[1], h('small', { text: String(cuenta[o[0]] || 0) }));
    }));
  }

  /* ---------------- Pestañas ---------------- */
  function contarPendientes() {
    return Promise.all([
      client.from('docentes').select('usuario_id', { count: 'exact', head: true }).eq('estado', 'pendiente'),
      client.from('cursos').select('id', { count: 'exact', head: true }).eq('estado', 'en_revision')
    ]).then(function (r) {
      state.pendientes.docentes = r[0].count || 0;
      state.pendientes.cursos = r[1].count || 0;
      pintarTabs();
    }).catch(function () {});
  }

  function pintarTabs() {
    U.limpiar(tabsEl);
    TABS.forEach(function (t) {
      var n = state.pendientes[t.id] || 0;
      tabsEl.appendChild(h('button', {
        type: 'button', role: 'tab', 'aria-selected': t.id === state.tab ? 'true' : 'false',
        class: 'ad-tab' + (t.id === state.tab ? ' is-active' : ''),
        onclick: function () { ir(t.id); }
      }, t.nombre, n > 0 ? h('span', { class: 'ad-badge', text: String(n), 'aria-label': n + ' pendientes' }) : null));
    });
  }

  function ir(id) {
    state.tab = id;
    if (window.location.hash !== '#' + id) history.replaceState(null, '', '#' + id);
    pintarTabs();
    ({ docentes: vistaDocentes, cursos: vistaCursos, banners: vistaBanners, categorias: vistaCategorias })[id]();
  }

  /* ================= DOCENTES ================= */
  var ESTADOS_DOC = [['pendiente', 'Pendientes'], ['aprobado', 'Aprobados'], ['suspendido', 'Suspendidos'], ['rechazado', 'Rechazados']];
  var PILL_DOC = { pendiente: ['Pendiente', 'ad-pill--warn'], aprobado: ['Aprobado', 'ad-pill--ok'], suspendido: ['Suspendido', 'ad-pill--mal'], rechazado: ['Rechazado', 'ad-pill--mal'] };

  function vistaDocentes() {
    cargando();
    client.from('docentes')
      .select('usuario_id, nombre_publico, bio_publica, avatar_url, estado, creado_en, resuelto_en, perfiles!docentes_usuario_id_fkey(nombre), cursos!cursos_docente_id_fkey(id, titulo, estado)')
      .order('creado_en', { ascending: false })
      .then(check).then(function (lista) {
        var cuenta = {};
        lista.forEach(function (d) { cuenta[d.estado] = (cuenta[d.estado] || 0) + 1; });
        U.limpiar(panel);
        panel.appendChild(chips(ESTADOS_DOC, state.docFiltro, cuenta, function (v) { state.docFiltro = v; vistaDocentes(); }));
        var visibles = lista.filter(function (d) { return d.estado === state.docFiltro; });
        if (!visibles.length) {
          panel.appendChild(vacio(state.docFiltro === 'pendiente' ? 'No hay solicitudes pendientes.' : 'No hay docentes en este estado.'));
          return;
        }
        panel.appendChild(h('div', { class: 'ad-lista' }, visibles.map(tarjetaDocente)));
      }).catch(errorVista);
  }

  var ESTADO_CURSO_TXT = { borrador: 'Borrador', en_revision: 'En revisión', publicado: 'Publicado', pausado: 'Pausado' };

  // Cursos que cargó el docente: es lo que hay que mirar para decidir si se lo aprueba
  function cursosDeDocente(d) {
    var lista = d.cursos || [];
    if (!lista.length) return h('p', { class: 'ad-sub ad-sincurso', text: 'Todavía no cargó ningún curso.' });
    return h('div', { class: 'ad-cursos-doc' }, h('p', { class: 'ad-sub', text: 'Cursos cargados:' }),
      h('ul', null, lista.map(function (c) {
        return h('li', null, c.titulo + ' ', h('span', { class: 'ad-pill ' + (c.estado === 'en_revision' ? 'ad-pill--warn' : c.estado === 'publicado' ? 'ad-pill--ok' : ''), text: ESTADO_CURSO_TXT[c.estado] || c.estado }));
      })),
      d.estado === 'pendiente' ? h('p', { class: 'ad-sub', text: 'Revisalos en la pestaña Cursos. Al aprobar el curso también se aprueba al docente.' }) : null);
  }

  function resolverDocente(d, estado, confirmar, ok) {
    if (estado === 'aprobado' && d.estado === 'pendiente' && !(d.cursos || []).length) {
      confirmar = confirmar || '¿Aprobar a ' + d.nombre_publico + '? Todavía no cargó ningún curso.';
    }
    if (confirmar && !window.confirm(confirmar)) return;
    client.rpc('admin_resolver_docente', { _usuario: d.usuario_id, _estado: estado })
      .then(check).then(function () { U.toast(ok); contarPendientes(); vistaDocentes(); }).catch(fail);
  }

  function tarjetaDocente(d) {
    var perfil = uno(d.perfiles) || {};
    var pill = PILL_DOC[d.estado] || [d.estado, ''];
    var avatar = h('div', { class: 'ad-avatar' }, U.linkSeguro(d.avatar_url)
      ? h('img', { src: d.avatar_url, alt: '', loading: 'lazy' }) : inicial(d.nombre_publico));
    var quien = perfil.nombre && perfil.nombre !== d.nombre_publico ? ' · cuenta de ' + perfil.nombre : '';
    var acciones = [];
    if (d.estado === 'pendiente') {
      acciones.push(btn('Aprobar', 'ad-btn--ok', function () { resolverDocente(d, 'aprobado', null, 'Docente aprobado'); }));
      acciones.push(btn('Rechazar', 'ad-btn--mal', function () { resolverDocente(d, 'rechazado', '¿Rechazar la solicitud de ' + d.nombre_publico + '?', 'Solicitud rechazada'); }));
    } else if (d.estado === 'aprobado') {
      acciones.push(btn('Suspender', 'ad-btn--mal', function () {
        resolverDocente(d, 'suspendido', '¿Suspender a ' + d.nombre_publico + '? Sus cursos dejan de verse en el feed.', 'Docente suspendido');
      }));
    } else if (d.estado === 'suspendido') {
      acciones.push(btn('Reactivar', 'ad-btn--ok', function () { resolverDocente(d, 'aprobado', null, 'Docente reactivado'); }));
    } else if (d.estado === 'rechazado') {
      acciones.push(btn('Aprobar de todos modos', '', function () { resolverDocente(d, 'aprobado', null, 'Docente aprobado'); }));
    }
    return h('article', { class: 'ad-card' },
      h('div', { class: 'ad-fila' }, avatar,
        h('div', { class: 'ad-grow' },
          h('h3', { class: 'ad-titulo' }, d.nombre_publico, h('span', { class: 'ad-pill ' + pill[1], text: pill[0] })),
          h('p', { class: 'ad-sub', text: 'Solicitó el ' + U.fechaCorta(d.creado_en) + quien + (d.resuelto_en && d.estado !== 'pendiente' ? ' · resuelto el ' + U.fechaCorta(d.resuelto_en) : '') }),
          d.bio_publica ? h('p', { class: 'ad-texto', text: d.bio_publica }) : null,
          cursosDeDocente(d),
          h('div', { class: 'ad-acciones' }, acciones))));
  }

  /* ================= CURSOS ================= */
  var ESTADOS_CUR = [['en_revision', 'En revisión'], ['publicado', 'Publicados'], ['pausado', 'Pausados'], ['borrador', 'Borradores']];
  var PILL_CUR = { en_revision: ['En revisión', 'ad-pill--warn'], publicado: ['Publicado', 'ad-pill--ok'], pausado: ['Pausado', ''], borrador: ['Borrador', ''] };
  var TIPO_CLASE = { video: 'Video', pdf: 'PDF', descargable: 'Descargable' };

  function vistaCursos() {
    cargando();
    client.from('cursos')
      .select('id, titulo, subtitulo, descripcion, aprenderas, requisitos, estado, nota_revision, precio_usd, es_gratis, portada_url, actualizado_en, publicado_en, categorias(nombre), docentes!cursos_docente_id_fkey(usuario_id, nombre_publico, estado), modulos(id, titulo, orden, clases(id, titulo, tipo, duracion_seg, orden, clases_contenido(video_uid, archivo_path)))')
      .order('actualizado_en', { ascending: false })
      .then(check).then(function (lista) {
        var cuenta = {};
        lista.forEach(function (c) { cuenta[c.estado] = (cuenta[c.estado] || 0) + 1; });
        U.limpiar(panel);
        panel.appendChild(chips(ESTADOS_CUR, state.curFiltro, cuenta, function (v) { state.curFiltro = v; vistaCursos(); }));
        var visibles = lista.filter(function (c) { return c.estado === state.curFiltro; });
        if (!visibles.length) {
          panel.appendChild(vacio(state.curFiltro === 'en_revision' ? 'No hay cursos esperando revisión.' : 'No hay cursos en este estado.'));
          return;
        }
        panel.appendChild(h('div', { class: 'ad-lista' }, visibles.map(tarjetaCurso)));
      }).catch(errorVista);
  }

  function resolverCurso(c, estado, nota, ok) {
    var doc = uno(c.docentes);
    // Si el docente todavía está pendiente, aprobar su curso es aprobarlo a él también
    if (estado === 'publicado' && doc && doc.estado === 'pendiente') {
      if (!window.confirm('Al publicar este curso también se aprueba a ' + doc.nombre_publico + ' como docente. ¿Seguir?')) return Promise.resolve();
      return client.rpc('admin_resolver_docente', { _usuario: doc.usuario_id, _estado: 'aprobado' }).then(check).then(function () {
        return client.rpc('admin_resolver_curso', { _curso: c.id, _estado: estado, _nota: nota || null }).then(check);
      }).then(function () { U.toast(ok + ' y docente aprobado'); contarPendientes(); vistaCursos(); }).catch(fail);
    }
    return client.rpc('admin_resolver_curso', { _curso: c.id, _estado: estado, _nota: nota || null })
      .then(check).then(function () { U.toast(ok); contarPendientes(); vistaCursos(); }).catch(fail);
  }

  // Abre el video (Cloudflare Stream) o el PDF (R2) de una clase con un enlace temporal
  function abrirArchivo(claseId, tipo) { window.ModoOnSubidas.verArchivo(claseId, tipo, fail); }

  function tarjetaCurso(c) {
    var pill = PILL_CUR[c.estado] || [c.estado, ''];
    var cat = uno(c.categorias), doc = uno(c.docentes);
    var modulos = (c.modulos || []).slice().sort(function (a, b) { return a.orden - b.orden; });
    var nClases = 0, seg = 0;
    modulos.forEach(function (m) { (m.clases || []).forEach(function (cl) { nClases++; seg += cl.duracion_seg || 0; }); });
    var resumen = [
      doc ? 'Docente: ' + doc.nombre_publico + (doc.estado === 'pendiente' ? ' (solicitud pendiente)' : '') : null,
      cat ? cat.nombre : 'Sin categoría',
      c.es_gratis ? 'Gratis' : (c.precio_usd != null ? 'USD ' + c.precio_usd : 'Sin precio'),
      modulos.length + (modulos.length === 1 ? ' módulo' : ' módulos') + ' · ' + nClases + (nClases === 1 ? ' clase' : ' clases') + (seg ? ' · ' + U.duracionLarga(seg) : '')
    ].filter(Boolean).join(' · ');

    var portada = h('div', { class: 'ad-portada' }, U.linkSeguro(c.portada_url) ? h('img', { src: c.portada_url, alt: '', loading: 'lazy' }) : null);

    var detalle = h('details', { class: 'ad-detalle' }, h('summary', { text: 'Ver contenido completo' }),
      c.descripcion ? [h('h4', { text: 'Descripción' }), h('p', { class: 'ad-texto', text: c.descripcion })] : null,
      (c.aprenderas || []).length ? [h('h4', { text: 'Qué se aprende' }), h('ul', null, c.aprenderas.map(function (t) { return h('li', { text: t }); }))] : null,
      (c.requisitos || []).length ? [h('h4', { text: 'Requisitos' }), h('ul', null, c.requisitos.map(function (t) { return h('li', { text: t }); }))] : null,
      h('h4', { text: 'Temario' }),
      modulos.length ? modulos.map(function (m, i) {
        var clases = (m.clases || []).slice().sort(function (a, b) { return a.orden - b.orden; });
        return [h('p', { class: 'ad-modulo', text: (i + 1) + '. ' + m.titulo }),
          h('ul', { class: 'ad-clases' }, clases.map(function (cl) {
            var ct = uno(cl.clases_contenido) || {};
            return h('li', null,
              cl.titulo + (cl.duracion_seg ? ' (' + U.duracionClase(cl.duracion_seg) + ')' : '') + ' ',
              ct.video_uid ? btn('▶ Ver video', 'ad-btn--chico ad-btn--suave', function () { abrirArchivo(cl.id, 'video'); }) : h('span', { class: 'ad-pill ad-pill--mal', text: 'Sin video' }),
              ' ',
              ct.archivo_path ? btn('📄 Ver PDF', 'ad-btn--chico ad-btn--suave', function () { abrirArchivo(cl.id, 'pdf'); }) : h('span', { class: 'ad-pill ad-pill--mal', text: 'Sin PDF' }));
          }))];
      }) : h('p', { class: 'ad-sub', text: 'Todavía no tiene módulos.' }));

    // Devolver con nota
    var nota = h('textarea', { class: 'ad-textarea', placeholder: 'Contale al docente qué tiene que corregir…', maxlength: '1000', 'aria-label': 'Nota para el docente' });
    var enviarNota = btn('Enviar devolución', 'ad-btn--mal', function () {
      var t = nota.value.trim();
      if (!t) { U.toast('Escribí una nota para el docente.'); nota.focus(); return; }
      enviarNota.disabled = true;
      resolverCurso(c, 'borrador', t, 'Curso devuelto al docente').then(function () { enviarNota.disabled = false; });
    });
    var cajaNota = h('div', { class: 'ad-campo', hidden: true }, nota, h('div', { class: 'ad-acciones' }, enviarNota,
      btn('Cancelar', 'ad-btn--suave', function () { cajaNota.hidden = true; })));

    var acciones = [];
    if (c.estado === 'en_revision') {
      acciones.push(btn('Aprobar y publicar', 'ad-btn--ok', function () { resolverCurso(c, 'publicado', null, 'Curso publicado'); }));
      acciones.push(btn('Devolver con nota', 'ad-btn--mal', function () { cajaNota.hidden = false; nota.focus(); }));
    } else if (c.estado === 'publicado') {
      acciones.push(btn('Pausar', '', function () {
        if (window.confirm('¿Pausar "' + c.titulo + '"? Deja de verse en el feed.')) resolverCurso(c, 'pausado', null, 'Curso pausado');
      }));
    } else if (c.estado === 'pausado') {
      acciones.push(btn('Volver a publicar', 'ad-btn--ok', function () { resolverCurso(c, 'publicado', null, 'Curso publicado'); }));
    }
    acciones.push(btn(c.es_gratis ? 'Quitar "gratis"' : 'Marcar como gratis', 'ad-btn--suave', function () {
      client.rpc('admin_fijar_gratis', { _curso: c.id, _gratis: !c.es_gratis })
        .then(check).then(function () { U.toast(c.es_gratis ? 'Ya no es gratis' : 'Curso marcado como gratis'); vistaCursos(); }).catch(fail);
    }));

    return h('article', { class: 'ad-card' },
      h('div', { class: 'ad-fila' }, portada,
        h('div', { class: 'ad-grow' },
          h('h3', { class: 'ad-titulo' }, c.titulo, h('span', { class: 'ad-pill ' + pill[1], text: pill[0] })),
          c.subtitulo ? h('p', { class: 'ad-sub', text: c.subtitulo }) : null,
          h('p', { class: 'ad-sub', text: resumen }),
          c.nota_revision ? h('p', { class: 'ad-nota', text: 'Nota de revisión: ' + c.nota_revision }) : null)),
      detalle,
      h('div', { class: 'ad-acciones' }, acciones),
      cajaNota);
  }

  /* ================= BANNERS ================= */
  var MAX_MB = 50;
  var TIPOS_OK = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm'];

  function vistaBanners() {
    cargando();
    Promise.all([
      client.from('banners').select('*').order('orden', { ascending: true }).order('creado_en', { ascending: true }).then(check),
      client.from('cursos').select('id, titulo').eq('estado', 'publicado').order('titulo', { ascending: true }).then(check)
    ]).then(function (r) {
      var lista = r[0], cursos = r[1];
      U.limpiar(panel);
      panel.appendChild(h('p', { class: 'ad-ayuda', text: 'Los banners activos rotan en el feed en este orden. Medida ideal: 1600 × 400 px (proporción 4 a 1).' }));
      if (state.bannerForm) panel.appendChild(formBanner(state.bannerForm.banner || null, cursos, lista));
      else panel.appendChild(h('div', { class: 'ad-acciones', style: 'margin:0 0 18px' }, btn('＋ Nuevo banner', 'ad-btn--ok', function () { state.bannerForm = {}; vistaBanners(); })));
      if (!lista.length) { panel.appendChild(vacio('Todavía no cargaste banners. El feed muestra el banner de Modo On por defecto.')); return; }
      var porId = {}; cursos.forEach(function (c) { porId[c.id] = c.titulo; });
      panel.appendChild(h('div', { class: 'ad-lista' }, lista.map(function (b, i) { return tarjetaBanner(b, i, lista, porId); })));
    }).catch(errorVista);
  }

  function destinoTexto(b, porId) {
    if (b.curso_id) return 'Lleva al curso: ' + (porId[b.curso_id] || 'curso no publicado');
    if (b.link_destino) return 'Lleva a: ' + b.link_destino;
    return 'Sin destino (no se puede tocar)';
  }

  function tarjetaBanner(b, i, lista, porId) {
    var media = b.tipo === 'video'
      ? h('video', { src: b.imagen_url, muted: true, preload: 'metadata', playsinline: true, 'aria-hidden': 'true' })
      : h('img', { src: b.imagen_url, alt: 'Vista previa del banner', loading: 'lazy' });
    var etiqueta = (b.tipo === 'video' ? 'Video' : 'Imagen') + ' · ' + (b.duracion_segundos || 10) + ' s';
    return h('article', { class: 'ad-card' + (b.activo ? '' : ' is-off') },
      h('div', { class: 'ad-fila ad-fila--centro' },
        h('div', { class: 'ad-banner-prev' }, media),
        h('div', { class: 'ad-grow' },
          h('p', { class: 'ad-titulo', text: '#' + (i + 1) + ' · ' + etiqueta }),
          h('p', { class: 'ad-sub', text: destinoTexto(b, porId) }))),
      h('div', { class: 'ad-acciones' },
        interruptor(b.activo ? 'Activo' : 'Desactivado', b.activo, function (v, input) {
          actualizar('banners', b.id, { activo: v }).then(function () { U.toast(v ? 'Banner activado' : 'Banner desactivado'); vistaBanners(); })
            .catch(function (e) { input.checked = !v; fail(e); });
        }),
        btn('↑', 'ad-btn--suave ad-flecha', function () { mover('banners', lista, i, -1).then(vistaBanners).catch(fail); }, { disabled: i === 0, 'aria-label': 'Subir' }),
        btn('↓', 'ad-btn--suave ad-flecha', function () { mover('banners', lista, i, 1).then(vistaBanners).catch(fail); }, { disabled: i === lista.length - 1, 'aria-label': 'Bajar' }),
        btn('Editar', 'ad-btn--chico', function () { state.bannerForm = { banner: b }; vistaBanners(); window.scrollTo({ top: 0, behavior: 'smooth' }); }),
        btn('Borrar', 'ad-btn--chico ad-btn--mal', function () {
          if (!window.confirm('¿Borrar este banner? No se puede deshacer.')) return;
          client.from('banners').delete().eq('id', b.id).select('id').then(check).then(function (d) {
            if (!d || !d.length) throw new Error('la base no permitió borrarlo');
            borrarArchivo(b.imagen_url);
            U.toast('Banner borrado'); vistaBanners();
          }).catch(fail);
        })));
  }

  // Si el archivo estaba en nuestra carpeta "banners", lo sacamos también del almacenamiento.
  function borrarArchivo(url) {
    var marca = '/storage/v1/object/public/banners/';
    var k = String(url || '').indexOf(marca);
    if (k < 0) return;
    client.storage.from('banners').remove([decodeURIComponent(url.slice(k + marca.length).split('?')[0])]).catch(function () {});
  }

  function subirArchivo(file) {
    var ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
    var ruta = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
    return client.storage.from('banners').upload(ruta, file, { contentType: file.type, cacheControl: '31536000', upsert: false })
      .then(function (r) {
        if (r.error) throw r.error;
        return client.storage.from('banners').getPublicUrl(ruta).data.publicUrl;
      });
  }

  function formBanner(edit, cursos, lista) {
    var esVideo = false, archivo = null;
    var destinoInicial = edit ? (edit.curso_id ? 'curso' : edit.link_destino ? 'link' : 'ninguno') : 'curso';

    var inputArchivo = h('input', { type: 'file', class: 'ad-input', accept: TIPOS_OK.join(','), 'aria-label': 'Archivo del banner' });
    var prevBox = h('div', { class: 'ad-prevbox' });
    var aviso = h('p', { class: 'ad-aviso', hidden: true });

    function mostrarPrev(src, video) {
      U.limpiar(prevBox);
      var el = video ? h('video', { src: src, muted: true, controls: true, playsinline: true }) : h('img', { src: src, alt: 'Vista previa' });
      function medir(w, hh) {
        var ratio = w / hh;
        aviso.hidden = Math.abs(ratio - 4) <= 0.25;
        aviso.textContent = (video ? 'Este video' : 'Esta imagen') + ' mide ' + w + ' × ' + hh + ' (no es 4 a 1): se va a recortar en los bordes.';
      }
      if (video) el.addEventListener('loadedmetadata', function () { medir(el.videoWidth, el.videoHeight); });
      else el.addEventListener('load', function () { medir(el.naturalWidth, el.naturalHeight); });
      prevBox.appendChild(el);
      prevBox.classList.add('is-on');
    }
    if (edit) { esVideo = edit.tipo === 'video'; mostrarPrev(edit.imagen_url, esVideo); }

    inputArchivo.addEventListener('change', function () {
      var f = inputArchivo.files && inputArchivo.files[0];
      archivo = null; aviso.hidden = true;
      if (!f) return;
      if (TIPOS_OK.indexOf(f.type) < 0) { U.toast('Ese formato no sirve. Usá JPG, PNG, WebP, GIF, MP4 o WebM.'); inputArchivo.value = ''; return; }
      if (f.size > MAX_MB * 1024 * 1024) { U.toast('El archivo pesa más de ' + MAX_MB + ' MB.'); inputArchivo.value = ''; return; }
      archivo = f; esVideo = f.type.indexOf('video/') === 0;
      mostrarPrev(URL.createObjectURL(f), esVideo);
    });

    function radio(valor, texto) {
      var r = h('input', { type: 'radio', name: 'destino', value: valor, checked: valor === destinoInicial });
      r.addEventListener('change', sincronizar);
      return h('label', null, r, texto);
    }
    var selCurso = h('select', { class: 'ad-select', 'aria-label': 'Curso de destino' },
      h('option', { value: '', text: cursos.length ? 'Elegí un curso publicado…' : 'No hay cursos publicados todavía' }),
      cursos.map(function (c) { return h('option', { value: c.id, text: c.titulo, selected: edit && edit.curso_id === c.id }); }));
    var inpLink = h('input', { type: 'url', class: 'ad-input', placeholder: 'https://…', value: edit && edit.link_destino ? edit.link_destino : '', 'aria-label': 'Link de destino' });
    var campoCurso = h('div', { class: 'ad-campo' }, selCurso);
    var campoLink = h('div', { class: 'ad-campo' }, inpLink);
    function sincronizar() {
      var v = form.querySelector('input[name=destino]:checked').value;
      campoCurso.hidden = v !== 'curso'; campoLink.hidden = v !== 'link';
    }

    var inpDur = h('input', { type: 'number', class: 'ad-input', min: '1', max: '120', value: String(edit && edit.duracion_segundos ? edit.duracion_segundos : 10), 'aria-label': 'Duración en segundos' });
    var chkActivo = h('input', { type: 'checkbox', checked: edit ? edit.activo : true });
    var guardarBtn = btn(edit ? 'Guardar cambios' : 'Publicar banner', 'ad-btn--ok', guardar);

    var form = h('div', { class: 'ad-card ad-form' },
      h('h3', { text: edit ? 'Editar banner' : 'Nuevo banner' }),
      h('div', { class: 'ad-campo' },
        h('label', { text: edit ? 'Cambiar archivo (opcional)' : 'Imagen o video' }),
        inputArchivo,
        h('small', { text: 'JPG, PNG, WebP, GIF, MP4 o WebM · hasta ' + MAX_MB + ' MB · ideal 1600 × 400 px.' }),
        prevBox, aviso),
      h('div', { class: 'ad-campo' },
        h('span', { class: 'ad-label', text: '¿A dónde lleva al tocarlo?' }),
        h('div', { class: 'ad-opciones' }, radio('curso', 'A un curso'), radio('link', 'A un link'), radio('ninguno', 'A ningún lado')),
        campoCurso, campoLink),
      h('div', { class: 'ad-grid2' },
        h('div', { class: 'ad-campo' }, h('label', { text: 'Segundos en pantalla' }), inpDur, h('small', { text: 'Cuánto se queda antes de pasar al siguiente.' })),
        h('div', { class: 'ad-campo' }, h('span', { class: 'ad-label', text: 'Estado' }),
          h('label', { class: 'ad-switch' }, chkActivo, h('span', { class: 'ad-switch__riel', 'aria-hidden': 'true' }), h('span', { text: 'Activo (se muestra en el feed)' })))),
      h('div', { class: 'ad-acciones' }, guardarBtn,
        btn('Cancelar', 'ad-btn--suave', function () { state.bannerForm = null; vistaBanners(); })));
    sincronizar();

    function guardar() {
      var dest = form.querySelector('input[name=destino]:checked').value;
      var cursoId = null, link = null;
      if (dest === 'curso') { cursoId = selCurso.value; if (!cursoId) { U.toast('Elegí a qué curso lleva el banner.'); return; } }
      if (dest === 'link') { link = U.linkSeguro(inpLink.value.trim()); if (!link) { U.toast('Poné un link completo, que empiece con https://'); return; } }
      var dur = parseInt(inpDur.value, 10);
      if (!dur || dur < 1 || dur > 120) { U.toast('Los segundos tienen que ser entre 1 y 120.'); return; }
      if (!edit && !archivo) { U.toast('Elegí una imagen o un video.'); return; }

      guardarBtn.disabled = true; guardarBtn.textContent = archivo ? 'Subiendo…' : 'Guardando…';
      var campos = { curso_id: cursoId, link_destino: link, duracion_segundos: dur, activo: chkActivo.checked };
      var paso = archivo ? subirArchivo(archivo) : Promise.resolve(null);
      paso.then(function (url) {
        if (url) { campos.imagen_url = url; campos.tipo = esVideo ? 'video' : 'imagen'; }
        if (edit) {
          return actualizar('banners', edit.id, campos).then(function () { if (url) borrarArchivo(edit.imagen_url); });
        }
        var orden = lista.length ? Math.max.apply(null, lista.map(function (b) { return b.orden; })) + 1 : 0;
        campos.orden = orden; campos.ubicacion = 'feed';
        return client.from('banners').insert(campos).select('id').then(check);
      }).then(function () {
        U.toast(edit ? 'Banner actualizado' : 'Banner publicado');
        state.bannerForm = null; vistaBanners();
      }).catch(function (e) {
        guardarBtn.disabled = false; guardarBtn.textContent = edit ? 'Guardar cambios' : 'Publicar banner'; fail(e);
      });
    }
    return form;
  }

  /* ================= CATEGORÍAS ================= */
  function vistaCategorias() {
    cargando();
    Promise.all([
      client.from('categorias').select('id, nombre, slug, visible, orden').order('orden', { ascending: true }).order('nombre', { ascending: true }).then(check),
      client.from('cursos').select('categoria_id, estado').then(check)
    ]).then(function (r) {
      var lista = r[0], cuentaTotal = {}, cuentaPub = {};
      r[1].forEach(function (c) {
        cuentaTotal[c.categoria_id] = (cuentaTotal[c.categoria_id] || 0) + 1;
        if (c.estado === 'publicado') cuentaPub[c.categoria_id] = (cuentaPub[c.categoria_id] || 0) + 1;
      });
      U.limpiar(panel);
      panel.appendChild(h('p', { class: 'ad-ayuda', text: 'El feed muestra como filtro solo las categorías visibles, en este orden. Las nuevas arrancan ocultas.' }));
      panel.appendChild(formCategoria(lista));
      if (!lista.length) { panel.appendChild(vacio('Todavía no hay categorías.')); return; }
      panel.appendChild(h('div', { class: 'ad-lista' }, lista.map(function (c, i) {
        return tarjetaCategoria(c, i, lista, cuentaTotal[c.id] || 0, cuentaPub[c.id] || 0);
      })));
    }).catch(errorVista);
  }

  function formCategoria(lista) {
    var inp = h('input', { type: 'text', class: 'ad-input', placeholder: 'Nombre de la nueva categoría', maxlength: '40', 'aria-label': 'Nombre de la categoría' });
    var agregar = btn('Agregar', 'ad-btn--ok', crear);
    function crear() {
      var nombre = inp.value.trim().replace(/\s+/g, ' ');
      if (nombre.length < 2) { U.toast('Escribí un nombre para la categoría.'); inp.focus(); return; }
      var slug = slugDe(nombre);
      if (!slug) { U.toast('Ese nombre no es válido.'); return; }
      agregar.disabled = true;
      var orden = lista.length ? Math.max.apply(null, lista.map(function (c) { return c.orden; })) + 1 : 0;
      client.from('categorias').insert({ nombre: nombre, slug: slug, orden: orden }).select('id').then(check).then(function () {
        U.toast('Categoría creada (oculta hasta que la actives)'); vistaCategorias();
      }).catch(function (e) {
        agregar.disabled = false;
        if (e && e.code === '23505') U.toast('Ya existe una categoría con ese nombre.'); else fail(e);
      });
    }
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') crear(); });
    return h('div', { class: 'ad-card', style: 'margin-bottom:18px' }, h('div', { class: 'ad-fila ad-fila--centro' }, h('div', { class: 'ad-grow' }, inp), agregar));
  }

  function tarjetaCategoria(c, i, lista, total, publicados) {
    var nombreEl = h('div', { class: 'ad-grow' });
    function verNombre() {
      U.limpiar(nombreEl);
      nombreEl.appendChild(h('p', { class: 'ad-titulo', text: c.nombre }));
      nombreEl.appendChild(h('p', { class: 'ad-sub', text: publicados + (publicados === 1 ? ' curso publicado' : ' cursos publicados') + (c.visible ? '' : ' · oculta en el feed') }));
    }
    function editarNombre() {
      var inp = h('input', { type: 'text', class: 'ad-input', value: c.nombre, maxlength: '40', 'aria-label': 'Nuevo nombre' });
      function guardar() {
        var n = inp.value.trim().replace(/\s+/g, ' ');
        if (n.length < 2) { U.toast('Escribí un nombre.'); return; }
        if (n === c.nombre) { verNombre(); return; }
        actualizar('categorias', c.id, { nombre: n }).then(function () { U.toast('Categoría renombrada'); vistaCategorias(); })
          .catch(function (e) { if (e && e.code === '23505') U.toast('Ya existe una categoría con ese nombre.'); else fail(e); });
      }
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') guardar(); if (e.key === 'Escape') verNombre(); });
      U.limpiar(nombreEl);
      nombreEl.appendChild(h('div', { class: 'ad-fila ad-fila--centro' }, h('div', { class: 'ad-grow' }, inp), btn('Guardar', 'ad-btn--chico ad-btn--ok', guardar), btn('Cancelar', 'ad-btn--chico ad-btn--suave', verNombre)));
      inp.focus(); inp.select();
    }
    verNombre();
    return h('article', { class: 'ad-card' + (c.visible ? '' : ' is-off') },
      h('div', { class: 'ad-fila ad-fila--centro' }, nombreEl,
        interruptor(c.visible ? 'Visible' : 'Oculta', c.visible, function (v, input) {
          actualizar('categorias', c.id, { visible: v }).then(function () { U.toast(v ? 'Categoría visible en el feed' : 'Categoría oculta'); vistaCategorias(); })
            .catch(function (e) { input.checked = !v; fail(e); });
        }),
        btn('↑', 'ad-btn--suave ad-flecha', function () { mover('categorias', lista, i, -1).then(vistaCategorias).catch(fail); }, { disabled: i === 0, 'aria-label': 'Subir' }),
        btn('↓', 'ad-btn--suave ad-flecha', function () { mover('categorias', lista, i, 1).then(vistaCategorias).catch(fail); }, { disabled: i === lista.length - 1, 'aria-label': 'Bajar' }),
        btn('Renombrar', 'ad-btn--chico', editarNombre),
        btn('Borrar', 'ad-btn--chico ad-btn--mal', function () {
          if (total > 0) { U.toast('No se puede borrar: tiene ' + total + (total === 1 ? ' curso' : ' cursos') + '. Ocultala en su lugar.'); return; }
          if (!window.confirm('¿Borrar la categoría "' + c.nombre + '"?')) return;
          client.from('categorias').delete().eq('id', c.id).select('id').then(check).then(function (d) {
            if (!d || !d.length) throw new Error('la base no permitió borrarla');
            U.toast('Categoría borrada'); vistaCategorias();
          }).catch(fail);
        })));
  }

  /* ================= Arranque ================= */
  U.iniciarPagina(client).then(function (sesion) {
    if (!sesion) return;
    return client.from('roles_usuario').select('rol').eq('usuario_id', sesion.user.id).eq('rol', 'admin').maybeSingle().then(function (r) {
      if (!r.data) { window.location.replace('cursos.html'); return; }
      document.getElementById('verificando').hidden = true;
      document.getElementById('app').hidden = false;
      var inicio = (window.location.hash || '').replace('#', '');
      state.tab = TABS.some(function (t) { return t.id === inicio; }) ? inicio : 'docentes';
      contarPendientes();
      ir(state.tab);
    });
  }).catch(function () { window.location.replace('cursos.html'); });
})();
