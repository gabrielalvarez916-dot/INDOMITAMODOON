// api.js — lecturas de Supabase para el feed y la página de curso.
// Usa las funciones SQL cursos_feed() y cursos_tambien_compraron() (solo lectura, solo cursos publicados).
(function () {
  var cfg = window.MODO_ON_CONFIG;
  var client = window.modoOnClient || window.supabase.createClient(cfg.url, cfg.key);
  window.modoOnClient = client;

  function check(r) { if (r.error) throw r.error; return r.data; }

  function banners() {
    return client.from('banners')
      .select('id, imagen_url, link_destino, curso_id, tipo, duracion_segundos')
      .eq('activo', true).eq('ubicacion', 'feed').order('orden', { ascending: true })
      .then(check).then(function (d) { return d || []; });
  }

  function categorias() {
    return client.from('categorias').select('id, nombre, slug, orden')
      .eq('visible', true).order('orden', { ascending: true })
      .then(check).then(function (d) { return d || []; });
  }

  function cursosFeed(ids) {
    return client.rpc('cursos_feed', { p_ids: ids || null }).then(check).then(function (d) { return d || []; });
  }

  function cursoDetalle(id) {
    return Promise.all([
      cursosFeed([id]),
      client.from('cursos')
        .select('descripcion, aprenderas, requisitos, modulos(id, titulo, orden, clases(id, titulo, tipo, duracion_seg, orden, es_vista_previa))')
        .eq('id', id).single(),
      client.from('resenas').select('id, autor_nombre, calificacion, comentario, creado_en')
        .eq('curso_id', id).order('creado_en', { ascending: false }).limit(20),
      client.from('inscripciones').select('id').eq('curso_id', id).eq('estado', 'activa').maybeSingle()
    ]).then(function (r) {
      var curso = r[0][0];
      if (!curso) return null;
      if (r[1].error) throw r[1].error;
      return client.from('docentes').select('nombre_publico, bio_publica, avatar_url')
        .eq('usuario_id', curso.docente_id).maybeSingle().then(function (dd) {
          var modulos = (r[1].data.modulos || []).slice().sort(function (a, b) { return a.orden - b.orden; })
            .map(function (m) {
              return Object.assign({}, m, { clases: (m.clases || []).slice().sort(function (a, b) { return a.orden - b.orden; }) });
            });
          return {
            curso: curso,
            descripcion: r[1].data.descripcion || '',
            aprenderas: r[1].data.aprenderas || [],
            requisitos: r[1].data.requisitos || [],
            modulos: modulos,
            resenas: r[2].data || [],
            docente: dd.data || null,
            inscripto: !!(r[3].data)
          };
        });
    });
  }

  // "Los estudiantes también compraron": primero alumnos en común; si hay pocos, se completa con la misma categoría.
  function tambienCompraron(curso) {
    return client.rpc('cursos_tambien_compraron', { p_curso: curso.id }).then(function (r) {
      var idsAfines = (r.data || []).map(function (f) { return f.curso_id; });
      return (idsAfines.length ? cursosFeed(idsAfines) : Promise.resolve([])).then(function (afines) {
        afines.sort(function (a, b) { return idsAfines.indexOf(a.id) - idsAfines.indexOf(b.id); });
        if (afines.length >= 6) return afines;
        return cursosFeed().then(function (todos) {
          var usados = {}; usados[curso.id] = true;
          afines.forEach(function (c) { usados[c.id] = true; });
          var misma = todos.filter(function (c) { return !usados[c.id] && c.categoria_id === curso.categoria_id; });
          misma.forEach(function (c) { usados[c.id] = true; });
          var resto = todos.filter(function (c) { return !usados[c.id]; });
          return afines.concat(misma, resto).slice(0, 8);
        });
      });
    });
  }

  window.ModoOnApi = { client: client, banners: banners, categorias: categorias, cursosFeed: cursosFeed, cursoDetalle: cursoDetalle, tambienCompraron: tambienCompraron };
})();
