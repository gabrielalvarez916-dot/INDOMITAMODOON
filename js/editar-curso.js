// editar-curso.js — el docente arma su curso: datos, portada, temario y, en cada clase, un VIDEO y un PDF
// que sube desde su computadora (no links). Al final lo envía a revisión.
// Mientras el curso es borrador se puede editar todo; una vez enviado queda en solo lectura.
(function () {
  var U = window.ModoOnUI, API = window.ModoOnApi, S = window.ModoOnSubidas, h = U.h, client = API.client;
  var cont = document.getElementById('contenido');
  var cursoId = new URLSearchParams(window.location.search).get('id');
  var uid = null;
  var datos = { categorias: [], escalones: [], curso: null };
  var subiendo = 0; // cantidad de subidas en curso
  var temarioEl = null, checkEl = null;

  var MAX_PORTADA_MB = 5, MAX_VIDEO_MB = 2048, MAX_PDF_MB = 100;
  var TIPOS_PORTADA = ['image/jpeg', 'image/png', 'image/webp'];
  var TIPOS_VIDEO = ['video/mp4', 'video/webm', 'video/quicktime'];
  var TIPOS_PDF = ['application/pdf'];

  /* ---------------- Ayudas ---------------- */
  function check(r) { if (r.error) throw r.error; return r.data; }
  function fail(e) { U.toast('No se pudo completar: ' + ((e && e.message) || e)); }
  function uno(x) { return Array.isArray(x) ? x[0] : x; }
  function boton(texto, cls, onclick, extra) {
    var props = { type: 'button', class: 'ed-btn ' + (cls || ''), text: texto, onclick: onclick };
    if (extra) Object.keys(extra).forEach(function (k) { props[k] = extra[k]; });
    return h('button', props);
  }
  function campo(etiqueta, control, ayuda, id) {
    return h('div', { class: 'pl-campo' }, h('label', { for: id || null, text: etiqueta }), control, ayuda ? h('small', { text: ayuda }) : null);
  }
  function lineas(texto) {
    return String(texto || '').split('\n').map(function (t) { return t.trim().slice(0, 200); }).filter(Boolean).slice(0, 12);
  }
  function libre() {
    if (subiendo > 0) { U.toast('Esperá a que terminen las subidas en curso.'); return false; }
    return true;
  }
  function slugDe(t) { return U.normalizar(t).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60); }
  function mb(n) { return n >= 1024 ? (n / 1024).toFixed(0) + ' GB' : n + ' MB'; }

  window.addEventListener('beforeunload', function (e) {
    if (subiendo > 0) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ---------------- Carga ---------------- */
  function normalizar(curso) {
    curso.modulos = (curso.modulos || []).slice().sort(function (a, b) { return a.orden - b.orden; }).map(function (m) {
      m.clases = (m.clases || []).slice().sort(function (a, b) { return a.orden - b.orden; }).map(function (cl) {
        cl.contenido = uno(cl.clases_contenido) || null;
        delete cl.clases_contenido;
        return cl;
      });
      return m;
    });
    return curso;
  }

  function cargar() {
    return Promise.all([
      client.from('categorias').select('id, nombre').order('orden', { ascending: true }).order('nombre', { ascending: true }).then(check),
      client.from('escalones_precio').select('precio_web_usd, precio_app_usd').eq('activo', true).order('precio_web_usd', { ascending: true }).then(check),
      cursoId
        ? client.from('cursos')
            .select('id, titulo, subtitulo, descripcion, categoria_id, precio_usd, portada_url, estado, nota_revision, aprenderas, requisitos, modulos(id, titulo, orden, clases(id, titulo, descripcion, tipo, duracion_seg, orden, es_vista_previa, clases_contenido(video_path, archivo_path, descargable)))')
            .eq('id', cursoId).eq('docente_id', uid).maybeSingle().then(check)
        : Promise.resolve(null)
    ]).then(function (r) {
      datos.categorias = r[0]; datos.escalones = r[1];
      if (cursoId && !r[2]) { U.limpiar(cont); cont.appendChild(h('div', { class: 'pl-aviso pl-aviso--mal', text: 'No encontramos este curso.' })); return; }
      datos.curso = r[2] ? normalizar(r[2]) : null;
      pintar();
    });
  }

  /* ---------------- Pantalla ---------------- */
  var ESTADO_TXT = {
    en_revision: ['EN REVISIÓN', 'Tu curso está en revisión. Lo estamos mirando y apenas lo resolvamos vas a verlo acá. Mientras tanto no se puede editar.'],
    publicado: ['PUBLICADO', 'Tu curso está publicado y ya lo pueden ver los alumnos.'],
    pausado: ['PAUSADO', 'Tu curso está pausado: por ahora no se muestra en el feed.']
  };

  function pintar() {
    var c = datos.curso;
    var editable = !c || c.estado === 'borrador';
    U.limpiar(cont);
    cont.appendChild(h('a', { class: 'ed-volver', href: 'ser-docente.html', text: '← Volver a Ser docente' }));
    if (c) document.getElementById('titulo-pagina').textContent = c.titulo;

    if (c && editable && c.nota_revision) {
      cont.appendChild(h('div', { class: 'pl-aviso pl-aviso--mal ed-devuelto' },
        h('strong', { text: 'Te devolvimos el curso para que lo corrijas: ' }), c.nota_revision));
    }
    if (c && !editable) {
      var e = ESTADO_TXT[c.estado] || [String(c.estado).toUpperCase(), ''];
      cont.appendChild(h('section', { class: 'pl-caja pl-estado' },
        h('p', { class: 'pl-estado__fila' }, h('span', { class: 'pl-pill pl-pill--cat', text: e[0] })),
        h('p', { class: 'pl-texto', text: e[1] })));
    }

    cont.appendChild(seccionDatos(editable));
    if (c) cont.appendChild(seccionTemario(editable));
    else cont.appendChild(h('section', { class: 'pl-caja ed-seccion' }, h('h2', { text: '2. Temario' }),
      h('p', { class: 'pl-texto', text: 'Guardá primero los datos del curso y después vas a poder cargar módulos y clases.' })));
    if (c && editable) cont.appendChild(seccionEnviar());
  }

  /* ================= 1. DATOS ================= */
  function seccionDatos(editable) {
    var c = datos.curso || {};
    var dis = !editable;

    var inpTitulo = h('input', { type: 'text', class: 'pl-input', id: 'f-titulo', maxlength: '100', value: c.titulo || '', disabled: dis, placeholder: 'Ej.: Marketing digital desde cero' });
    var inpSub = h('input', { type: 'text', class: 'pl-input', id: 'f-sub', maxlength: '140', value: c.subtitulo || '', disabled: dis, placeholder: 'Una frase que explique para qué sirve' });
    var inpDesc = h('textarea', { class: 'pl-input pl-textarea ed-grande', id: 'f-desc', maxlength: '4000', disabled: dis, placeholder: 'Contá de qué trata el curso, a quién le sirve y qué se van a llevar.' });
    inpDesc.value = c.descripcion || '';

    var selCat = h('select', { class: 'pl-input', id: 'f-cat', disabled: dis },
      h('option', { value: '', text: 'Elegí una categoría…' }),
      datos.categorias.map(function (k) { return h('option', { value: k.id, text: k.nombre, selected: c.categoria_id === k.id }); }));
    var selPrecio = h('select', { class: 'pl-input', id: 'f-precio', disabled: dis },
      h('option', { value: '', text: 'Elegí un precio…' }),
      datos.escalones.map(function (e) {
        return h('option', {
          value: String(e.precio_web_usd), selected: c.precio_usd === e.precio_web_usd,
          text: 'USD ' + e.precio_web_usd + ' en la web · USD ' + Number(e.precio_app_usd).toFixed(2).replace('.', ',') + ' en la app'
        });
      }));

    var inpAprender = h('textarea', { class: 'pl-input pl-textarea', id: 'f-aprender', maxlength: '2500', disabled: dis, placeholder: 'Una cosa por línea.\nEj.: Armar una campaña en redes\nMedir resultados' });
    inpAprender.value = (c.aprenderas || []).join('\n');
    var inpReq = h('textarea', { class: 'pl-input pl-textarea', id: 'f-req', maxlength: '2500', disabled: dis, placeholder: 'Una por línea. Dejalo vacío si no hace falta nada.' });
    inpReq.value = (c.requisitos || []).join('\n');

    // Portada
    var portadaPendiente = null;
    var prev = h('div', { class: 'ed-portada' });
    function mostrarPortada(src) {
      U.limpiar(prev);
      prev.classList.toggle('is-on', !!src);
      if (src) prev.appendChild(h('img', { src: src, alt: 'Portada del curso' }));
    }
    mostrarPortada(U.linkSeguro(c.portada_url));
    var estadoPortada = h('small', { class: 'ed-portada__estado' });
    var inpPortada = h('input', { type: 'file', accept: TIPOS_PORTADA.join(','), hidden: true, 'aria-label': 'Portada del curso' });
    inpPortada.addEventListener('change', function () {
      var f = inpPortada.files && inpPortada.files[0];
      inpPortada.value = '';
      if (!f) return;
      if (TIPOS_PORTADA.indexOf(f.type) < 0) { U.toast('La portada tiene que ser JPG, PNG o WebP.'); return; }
      if (f.size > MAX_PORTADA_MB * 1024 * 1024) { U.toast('La portada pesa más de ' + MAX_PORTADA_MB + ' MB.'); return; }
      if (!datos.curso) { portadaPendiente = f; mostrarPortada(URL.createObjectURL(f)); estadoPortada.textContent = 'Se sube cuando guardes los datos.'; return; }
      subirPortada(f, estadoPortada).then(mostrarPortada).catch(fail);
    });
    var selector = editable ? h('label', { class: 'ed-btn ed-subir' }, h('span', { text: c.portada_url ? 'Cambiar portada' : 'Elegir portada' }), inpPortada) : null;

    var guardarBtn = editable ? boton(datos.curso ? 'Guardar datos' : 'Guardar y seguir con el temario', 'ed-btn--ok', guardar) : null;

    function guardar() {
      var titulo = inpTitulo.value.trim().replace(/\s+/g, ' ');
      if (titulo.length < 4) { U.toast('Poné un título para el curso (mínimo 4 letras).'); inpTitulo.focus(); return; }
      if (!selCat.value) { U.toast('Elegí una categoría.'); selCat.focus(); return; }
      var campos = {
        titulo: titulo, subtitulo: inpSub.value.trim() || null, descripcion: inpDesc.value.trim() || null,
        categoria_id: selCat.value, precio_usd: selPrecio.value ? Number(selPrecio.value) : null,
        aprenderas: lineas(inpAprender.value), requisitos: lineas(inpReq.value)
      };
      guardarBtn.disabled = true;
      var op;
      if (!datos.curso) {
        campos.docente_id = uid;
        campos.slug = (slugDe(titulo) || 'curso') + '-' + S.azar();
        op = client.from('cursos').insert(campos).select('id').single().then(check).then(function (fila) {
          if (!portadaPendiente) return fila.id;
          return subirPortada(portadaPendiente, estadoPortada, fila.id).then(function () { return fila.id; }, function (e) {
            fail(e); return new Promise(function (ok) { setTimeout(function () { ok(fila.id); }, 2500); });
          });
        }).then(function (id) { window.location.replace('editar-curso.html?id=' + encodeURIComponent(id)); });
      } else {
        op = client.from('cursos').update(campos).eq('id', cursoId).select('id').then(check).then(function (d) {
          if (!d || !d.length) throw new Error('la base no permitió guardar el cambio');
          Object.assign(datos.curso, campos);
          document.getElementById('titulo-pagina').textContent = titulo;
          U.toast('Datos guardados');
          pintarChecklist();
        });
      }
      op.catch(fail).then(function () { guardarBtn.disabled = false; });
    }

    return h('section', { class: 'pl-caja ed-seccion' },
      h('h2', { text: '1. Datos del curso' }),
      campo('Título', inpTitulo, null, 'f-titulo'),
      campo('Subtítulo', inpSub, 'Opcional pero recomendado: aparece debajo del título en el feed.', 'f-sub'),
      campo('Descripción', inpDesc, null, 'f-desc'),
      h('div', { class: 'ed-grid2' },
        campo('Categoría', selCat, null, 'f-cat'),
        campo('Precio', selPrecio, 'Elegís el precio web; el de la app se calcula solo.', 'f-precio')),
      h('div', { class: 'pl-campo' }, h('label', { text: 'Portada' }), prev,
        h('div', { class: 'ed-fila' }, selector, estadoPortada),
        h('small', { text: 'JPG, PNG o WebP · hasta ' + MAX_PORTADA_MB + ' MB · proporción 16:9 (por ejemplo 1280 × 720).' })),
      campo('Qué se aprende', inpAprender, 'Una cosa por línea.', 'f-aprender'),
      campo('Requisitos', inpReq, 'Una por línea.', 'f-req'),
      guardarBtn ? h('div', { class: 'ed-acciones' }, guardarBtn) : null);
  }

  // Sube la portada, la guarda en el curso y borra la anterior. Devuelve la URL pública.
  function subirPortada(file, estadoEl, idDirecto) {
    var id = idDirecto || cursoId;
    var path = uid + '/' + id + '-' + S.azar() + '.' + S.extension(file, 'jpg');
    var vieja = datos.curso ? S.rutaDeUrlPublica('portadas', datos.curso.portada_url) : null;
    subiendo++;
    estadoEl.textContent = 'Subiendo… 0%';
    return S.subir('portadas', path, file, function (p) { estadoEl.textContent = 'Subiendo… ' + p + '%'; }).then(function () {
      var url = S.urlPublica('portadas', path);
      return client.from('cursos').update({ portada_url: url }).eq('id', id).select('id').then(check).then(function (d) {
        if (!d || !d.length) { S.borrar('portadas', [path]); throw new Error('la base no permitió guardar la portada'); }
        if (datos.curso) datos.curso.portada_url = url;
        if (vieja) S.borrar('portadas', [vieja]);
        estadoEl.textContent = '✓ Portada cargada';
        pintarChecklist();
        return url;
      });
    }).then(function (url) { subiendo--; return url; }, function (e) { subiendo--; estadoEl.textContent = ''; throw e; });
  }

  /* ================= 2. TEMARIO ================= */
  function seccionTemario(editable) {
    temarioEl = h('div', { class: 'ed-temario' });
    var sec = h('section', { class: 'pl-caja ed-seccion' },
      h('h2', { text: '2. Temario' }),
      h('p', { class: 'pl-texto', text: editable ? 'Armá los módulos y, dentro de cada uno, las clases. Cada clase lleva un video y un PDF que subís desde tu computadora.' : 'Contenido del curso.' }),
      temarioEl,
      editable ? h('div', { class: 'ed-acciones' }, boton('＋ Agregar módulo', 'ed-btn--ok', agregarModulo)) : null);
    pintarTemario(editable);
    return sec;
  }

  function pintarTemario(editable) {
    if (editable === undefined) editable = datos.curso.estado === 'borrador';
    U.limpiar(temarioEl);
    var mods = datos.curso.modulos;
    if (!mods.length) { temarioEl.appendChild(h('div', { class: 'pl-vacio ed-vacio' }, h('p', { text: 'Todavía no hay módulos. Agregá el primero.' }))); }
    mods.forEach(function (m, i) { temarioEl.appendChild(editable ? tarjetaModulo(m, i, mods) : moduloSoloLectura(m, i)); });
    pintarChecklist();
  }

  function moduloSoloLectura(m, i) {
    return h('div', { class: 'ed-modulo' },
      h('h3', { class: 'ed-modulo__titulo', text: (i + 1) + '. ' + m.titulo }),
      h('ul', { class: 'ed-lista' }, m.clases.map(function (cl) {
        var ct = cl.contenido || {};
        return h('li', { text: cl.titulo + ' — ' + (ct.video_path ? 'video ✓' : 'sin video') + ' · ' + (ct.archivo_path ? 'PDF ✓' : 'sin PDF') + (cl.duracion_seg ? ' · ' + U.duracionClase(cl.duracion_seg) : '') });
      })));
  }

  function mover(tabla, lista, i, dir) {
    var j = i + dir;
    if (j < 0 || j >= lista.length || !libre()) return;
    var a = lista[i], b = lista[j];
    Promise.all([
      client.from(tabla).update({ orden: b.orden }).eq('id', a.id).select('id').then(check),
      client.from(tabla).update({ orden: a.orden }).eq('id', b.id).select('id').then(check)
    ]).then(function () {
      var t = a.orden; a.orden = b.orden; b.orden = t;
      lista[i] = b; lista[j] = a;
      pintarTemario();
    }).catch(fail);
  }

  function agregarModulo() {
    if (!libre()) return;
    var n = datos.curso.modulos.length;
    var orden = n ? Math.max.apply(null, datos.curso.modulos.map(function (m) { return m.orden; })) + 1 : 0;
    client.from('modulos').insert({ curso_id: cursoId, titulo: 'Módulo ' + (n + 1), orden: orden }).select('id, titulo, orden').single()
      .then(check).then(function (m) { m.clases = []; datos.curso.modulos.push(m); pintarTemario(); }).catch(fail);
  }

  function rutasDeClase(cl) {
    var ct = cl.contenido || {};
    return [ct.video_path, ct.archivo_path].filter(Boolean);
  }

  function tarjetaModulo(m, i, lista) {
    var inp = h('input', { type: 'text', class: 'pl-input ed-modulo__input', maxlength: '100', value: m.titulo, 'aria-label': 'Título del módulo' });
    inp.addEventListener('change', function () {
      var t = inp.value.trim().replace(/\s+/g, ' ');
      if (!t) { inp.value = m.titulo; U.toast('El módulo necesita un título.'); return; }
      client.from('modulos').update({ titulo: t }).eq('id', m.id).select('id').then(check).then(function (d) {
        if (!d || !d.length) throw new Error('la base no permitió el cambio');
        m.titulo = t;
      }).catch(function (e) { inp.value = m.titulo; fail(e); });
    });
    var clasesEl = h('div', { class: 'ed-clases' }, m.clases.map(function (cl, k) { return tarjetaClase(cl, k, m.clases, m); }));
    if (!m.clases.length) clasesEl.appendChild(h('p', { class: 'ed-sinclases', text: 'Este módulo todavía no tiene clases.' }));

    return h('div', { class: 'ed-modulo' },
      h('div', { class: 'ed-modulo__cab' },
        h('span', { class: 'ed-num', text: String(i + 1) }), inp,
        boton('↑', 'ed-btn--suave ed-flecha', function () { mover('modulos', lista, i, -1); }, { disabled: i === 0, 'aria-label': 'Subir módulo' }),
        boton('↓', 'ed-btn--suave ed-flecha', function () { mover('modulos', lista, i, 1); }, { disabled: i === lista.length - 1, 'aria-label': 'Bajar módulo' }),
        boton('Borrar', 'ed-btn--mal ed-btn--chico', function () {
          if (!libre()) return;
          if (!window.confirm('¿Borrar el módulo "' + m.titulo + '" con sus ' + m.clases.length + ' clases y sus archivos? No se puede deshacer.')) return;
          var rutas = []; m.clases.forEach(function (cl) { rutas = rutas.concat(rutasDeClase(cl)); });
          client.from('modulos').delete().eq('id', m.id).select('id').then(check).then(function (d) {
            if (!d || !d.length) throw new Error('la base no permitió borrarlo');
            S.borrar('clases', rutas);
            datos.curso.modulos = datos.curso.modulos.filter(function (x) { return x.id !== m.id; });
            pintarTemario();
          }).catch(fail);
        })),
      clasesEl,
      h('div', { class: 'ed-acciones' }, boton('＋ Agregar clase', '', function () { agregarClase(m); })));
  }

  function agregarClase(m) {
    if (!libre()) return;
    var n = m.clases.length;
    var orden = n ? Math.max.apply(null, m.clases.map(function (c) { return c.orden; })) + 1 : 0;
    client.from('clases').insert({ modulo_id: m.id, titulo: 'Clase ' + (n + 1), tipo: 'video', orden: orden })
      .select('id, titulo, descripcion, tipo, duracion_seg, orden, es_vista_previa').single()
      .then(check).then(function (cl) { cl.contenido = null; m.clases.push(cl); pintarTemario(); }).catch(fail);
  }

  function tarjetaClase(cl, k, lista, m) {
    var inpTitulo = h('input', { type: 'text', class: 'pl-input', maxlength: '120', value: cl.titulo, 'aria-label': 'Título de la clase' });
    inpTitulo.addEventListener('change', function () {
      var t = inpTitulo.value.trim().replace(/\s+/g, ' ');
      if (!t) { inpTitulo.value = cl.titulo; U.toast('La clase necesita un título.'); return; }
      campoClase(cl, { titulo: t }).catch(function (e) { inpTitulo.value = cl.titulo; fail(e); });
    });
    var inpDesc = h('textarea', { class: 'pl-input pl-textarea ed-chica', maxlength: '1000', placeholder: 'Descripción de la clase (opcional)', 'aria-label': 'Descripción de la clase' });
    inpDesc.value = cl.descripcion || '';
    inpDesc.addEventListener('change', function () { campoClase(cl, { descripcion: inpDesc.value.trim() || null }).catch(fail); });

    var chkVista = h('input', { type: 'checkbox', checked: !!cl.es_vista_previa });
    chkVista.addEventListener('change', function () {
      campoClase(cl, { es_vista_previa: chkVista.checked }).catch(function (e) { chkVista.checked = !chkVista.checked; fail(e); });
    });

    return h('div', { class: 'ed-clase' },
      h('div', { class: 'ed-clase__cab' },
        h('span', { class: 'ed-clase__n', text: 'Clase ' + (k + 1) }),
        h('div', { class: 'ed-clase__acc' },
          boton('↑', 'ed-btn--suave ed-flecha', function () { mover('clases', lista, k, -1); }, { disabled: k === 0, 'aria-label': 'Subir clase' }),
          boton('↓', 'ed-btn--suave ed-flecha', function () { mover('clases', lista, k, 1); }, { disabled: k === lista.length - 1, 'aria-label': 'Bajar clase' }),
          boton('Borrar', 'ed-btn--mal ed-btn--chico', function () {
            if (!libre()) return;
            if (!window.confirm('¿Borrar la clase "' + cl.titulo + '" y sus archivos? No se puede deshacer.')) return;
            var rutas = rutasDeClase(cl);
            client.from('clases').delete().eq('id', cl.id).select('id').then(check).then(function (d) {
              if (!d || !d.length) throw new Error('la base no permitió borrarla');
              S.borrar('clases', rutas);
              m.clases = m.clases.filter(function (x) { return x.id !== cl.id; });
              pintarTemario();
            }).catch(fail);
          }))),
      campo('Título', inpTitulo),
      campo('Descripción', inpDesc),
      h('div', { class: 'ed-slots' },
        slotArchivo({ cl: cl, tipo: 'video', etiqueta: 'Video', accept: TIPOS_VIDEO.join(','), tipos: TIPOS_VIDEO, maxMb: MAX_VIDEO_MB, errorTipo: 'El video tiene que ser MP4, WebM o MOV.' }),
        slotArchivo({ cl: cl, tipo: 'pdf', etiqueta: 'PDF', accept: 'application/pdf', tipos: TIPOS_PDF, maxMb: MAX_PDF_MB, errorTipo: 'El material tiene que ser un archivo PDF.', conDescargable: true })),
      h('label', { class: 'ed-check' }, chkVista, h('span', { text: 'Vista previa gratis (cualquiera puede ver esta clase antes de comprar)' })));
  }

  function campoClase(cl, cambios) {
    return client.from('clases').update(cambios).eq('id', cl.id).select('id').then(check).then(function (d) {
      if (!d || !d.length) throw new Error('la base no permitió el cambio');
      Object.assign(cl, cambios);
    });
  }

  // Un casillero para subir un archivo de la clase (video o PDF)
  function slotArchivo(o) {
    var cl = o.cl;
    var col = o.tipo === 'video' ? 'video_path' : 'archivo_path';
    var estadoEl = h('p', { class: 'ed-slot__estado' });
    var barra = h('div', { class: 'ed-barra', hidden: true, role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100' }, h('span'));
    var textoSel = h('span');
    var input = h('input', { type: 'file', accept: o.accept, hidden: true, 'aria-label': o.etiqueta + ' de la clase' });
    var selector = h('label', { class: 'ed-btn ed-subir' }, textoSel, input);
    var ver = boton('Ver', 'ed-btn--suave ed-btn--chico', function () {
      var p = (cl.contenido || {})[col];
      if (p) S.abrirPrivado('clases', p, fail);
    });
    var chkDesc = null;
    if (o.conDescargable) {
      chkDesc = h('input', { type: 'checkbox', checked: !cl.contenido || cl.contenido.descargable !== false });
      chkDesc.addEventListener('change', function () {
        if (!cl.contenido) return;
        client.from('clases_contenido').update({ descargable: chkDesc.checked }).eq('clase_id', cl.id).select('clase_id').then(check).then(function (d) {
          if (!d || !d.length) throw new Error('la base no permitió el cambio');
          cl.contenido.descargable = chkDesc.checked;
        }).catch(function (e) { chkDesc.checked = !chkDesc.checked; fail(e); });
      });
    }
    var filaDesc = chkDesc ? h('label', { class: 'ed-check ed-check--chico' }, chkDesc, h('span', { text: 'Los alumnos pueden descargarlo' })) : null;

    function refrescar() {
      var p = (cl.contenido || {})[col];
      estadoEl.textContent = p ? '✓ ' + o.etiqueta + ' cargado' : 'Falta cargar el ' + (o.tipo === 'video' ? 'video' : 'PDF');
      estadoEl.className = 'ed-slot__estado ' + (p ? 'is-ok' : 'is-falta');
      textoSel.textContent = p ? 'Reemplazar' : 'Elegir archivo';
      ver.hidden = !p;
      if (filaDesc) filaDesc.hidden = !p;
    }
    refrescar();

    var ui = {
      empezar: function () { barra.hidden = false; selector.classList.add('is-off'); input.disabled = true; this.progreso(0); },
      progreso: function (p) { barra.firstChild.style.width = p + '%'; barra.setAttribute('aria-valuenow', String(p)); estadoEl.textContent = 'Subiendo… ' + p + '%'; estadoEl.className = 'ed-slot__estado'; },
      terminar: function () { barra.hidden = true; selector.classList.remove('is-off'); input.disabled = false; refrescar(); }
    };

    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      input.value = '';
      if (!f) return;
      if (o.tipos.indexOf(f.type) < 0) { U.toast(o.errorTipo); return; }
      if (f.size > o.maxMb * 1024 * 1024) { U.toast('El archivo pesa más de ' + mb(o.maxMb) + '.'); return; }
      subirArchivoClase(cl, o.tipo, col, f, ui);
    });

    return h('div', { class: 'ed-slot' },
      h('p', { class: 'ed-slot__titulo', text: o.etiqueta }),
      estadoEl, barra,
      h('div', { class: 'ed-fila' }, selector, ver),
      filaDesc,
      h('small', { text: o.tipo === 'video' ? 'MP4, WebM o MOV · hasta ' + mb(o.maxMb) + '.' : 'PDF · hasta ' + mb(o.maxMb) + '.' }));
  }

  function subirArchivoClase(cl, tipo, col, file, ui) {
    var viejo = (cl.contenido || {})[col];
    var path = uid + '/' + cursoId + '/' + cl.id + '-' + tipo + '-' + S.azar() + '.' + S.extension(file, tipo === 'video' ? 'mp4' : 'pdf');
    var set = {}; set[col] = path;
    var segundos = 0;
    subiendo++; ui.empezar();
    var dur = tipo === 'video' ? S.duracionVideo(file) : Promise.resolve(0);
    S.subir('clases', path, file, ui.progreso).then(function () {
      var op = cl.contenido
        ? client.from('clases_contenido').update(set).eq('clase_id', cl.id).select('clase_id')
        : client.from('clases_contenido').insert(Object.assign({ clase_id: cl.id, descargable: true }, set)).select('clase_id');
      return op.then(check).then(function (d) {
        if (!d || !d.length) throw new Error('la base no permitió guardar el archivo');
      }).catch(function (e) { S.borrar('clases', [path]); throw e; });
    }).then(function () { return dur; }).then(function (seg) {
      segundos = seg;
      if (seg) return client.from('clases').update({ duracion_seg: seg }).eq('id', cl.id).select('id').then(check);
    }).then(function () {
      cl.contenido = Object.assign(cl.contenido || { descargable: true }, set);
      if (segundos) cl.duracion_seg = segundos;
      if (viejo) S.borrar('clases', [viejo]);
      U.toast(tipo === 'video' ? 'Video subido' : 'PDF subido');
    }).catch(fail).then(function () { subiendo--; ui.terminar(); pintarChecklist(); });
  }

  /* ================= 3. ENVIAR ================= */
  function pendientes() {
    var c = datos.curso, p = [];
    p.push([!!(c.titulo && c.titulo.trim()), 'Título']);
    p.push([!!(c.descripcion && c.descripcion.trim()), 'Descripción']);
    p.push([!!c.portada_url, 'Portada']);
    p.push([!!c.precio_usd, 'Precio']);
    var mods = c.modulos, clases = [];
    mods.forEach(function (m) { clases = clases.concat(m.clases); });
    p.push([mods.length > 0, 'Al menos un módulo']);
    p.push([mods.length > 0 && mods.every(function (m) { return m.clases.length > 0; }), 'Todos los módulos tienen clases']);
    var sinVideo = clases.filter(function (x) { return !(x.contenido && x.contenido.video_path); }).length;
    var sinPdf = clases.filter(function (x) { return !(x.contenido && x.contenido.archivo_path); }).length;
    p.push([clases.length > 0 && sinVideo === 0, clases.length ? (sinVideo ? sinVideo + (sinVideo === 1 ? ' clase sin video' : ' clases sin video') : 'Todas las clases tienen video') : 'Al menos una clase con video']);
    p.push([clases.length > 0 && sinPdf === 0, clases.length ? (sinPdf ? sinPdf + (sinPdf === 1 ? ' clase sin PDF' : ' clases sin PDF') : 'Todas las clases tienen PDF') : 'Al menos una clase con PDF']);
    return p;
  }

  var enviarBtn = null;
  function pintarChecklist() {
    if (!checkEl || !datos.curso || datos.curso.estado !== 'borrador') return;
    var p = pendientes();
    U.limpiar(checkEl);
    p.forEach(function (x) {
      checkEl.appendChild(h('li', { class: x[0] ? 'is-ok' : 'is-falta' }, h('span', { 'aria-hidden': 'true', text: x[0] ? '✓' : '○' }), ' ' + x[1]));
    });
    if (enviarBtn) enviarBtn.disabled = !p.every(function (x) { return x[0]; });
  }

  function seccionEnviar() {
    checkEl = h('ul', { class: 'ed-checklist' });
    enviarBtn = boton('Enviar a revisión', 'ed-btn--ok ed-btn--grande', function () {
      if (!libre()) return;
      if (!window.confirm('Una vez enviado no vas a poder editar el curso hasta que lo revisemos. ¿Enviarlo ahora?')) return;
      enviarBtn.disabled = true;
      client.rpc('enviar_curso_a_revision', { _curso: cursoId }).then(check).then(function () {
        U.toast('¡Curso enviado a revisión!');
        setTimeout(function () { window.location.replace('ser-docente.html'); }, 900);
      }).catch(function (e) { enviarBtn.disabled = false; fail(e); });
    });
    var borrarBtn = boton('Borrar este borrador', 'ed-btn--mal ed-btn--chico', function () {
      if (!libre()) return;
      if (!window.confirm('¿Borrar el curso "' + datos.curso.titulo + '" con todo su contenido? No se puede deshacer.')) return;
      var rutas = [];
      datos.curso.modulos.forEach(function (m) { m.clases.forEach(function (cl) { rutas = rutas.concat(rutasDeClase(cl)); }); });
      var portada = S.rutaDeUrlPublica('portadas', datos.curso.portada_url);
      client.from('cursos').delete().eq('id', cursoId).select('id').then(check).then(function (d) {
        if (!d || !d.length) throw new Error('la base no permitió borrarlo');
        S.borrar('clases', rutas); if (portada) S.borrar('portadas', [portada]);
        window.location.replace('ser-docente.html');
      }).catch(fail);
    });
    var sec = h('section', { class: 'pl-caja ed-seccion' },
      h('h2', { text: '3. Enviar a revisión' }),
      h('p', { class: 'pl-texto', text: 'Para poder enviarlo, el curso tiene que estar completo. Guardá los datos antes de enviar.' }),
      checkEl,
      h('div', { class: 'ed-acciones' }, enviarBtn, borrarBtn));
    pintarChecklist();
    return sec;
  }

  /* ================= Arranque ================= */
  U.iniciarPagina(client).then(function (sesion) {
    if (!sesion) return;
    uid = sesion.user.id;
    return client.from('docentes').select('estado').eq('usuario_id', uid).maybeSingle().then(check).then(function (d) {
      if (!d || (d.estado !== 'pendiente' && d.estado !== 'aprobado')) { window.location.replace('ser-docente.html'); return; }
      return cargar();
    });
  }).catch(function (e) {
    U.limpiar(cont);
    cont.appendChild(h('div', { class: 'pl-aviso pl-aviso--mal', text: 'No pudimos cargar esta sección: ' + ((e && e.message) || e) }));
  });
})();
