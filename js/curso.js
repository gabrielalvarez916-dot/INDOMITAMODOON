// curso.js — página de cada curso.
// Arriba repite la tarjeta (portada, título, sinopsis, docente, valoraciones, última actualización);
// después: lo que aprenderás, contenido, requisitos, descripción, docente, valoraciones y
// "los estudiantes también compraron". A la derecha (escritorio) va la tarjeta de compra con
// "este curso incluye".
(function () {
  var U = window.ModoOnUI, API = window.ModoOnApi, T = window.ModoOnTarjetas, h = U.h;
  var raiz = document.getElementById('curso');
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function aviso(titulo, texto) {
    U.limpiar(raiz);
    raiz.appendChild(h('div', { class: 'pl-vacio pl-vacio--pagina' },
      h('h2', { text: titulo }), texto ? h('p', { text: texto }) : null,
      h('a', { class: 'pl-btn pl-btn--negro', href: 'cursos.html', text: 'Volver a los cursos' })));
  }

  function seccion(titulo, contenido, clase) {
    return h('section', { class: 'pl-seccion ' + (clase || '') }, h('h2', { text: titulo }), contenido);
  }

  function render(d) {
    var c = d.curso;
    var clases = [];
    d.modulos.forEach(function (m) { clases = clases.concat(m.clases); });
    var segVideo = clases.filter(function (k) { return k.tipo === 'video'; })
      .reduce(function (s, k) { return s + (k.duracion_seg || 0); }, 0);
    var descargables = clases.filter(function (k) { return k.tipo !== 'video'; }).length;
    var tieneNota = Number(c.cant_resenas) > 0;
    var est = U.estudiantesTexto(c.cant_estudiantes);
    var act = U.mesAnio(c.actualizado_en);

    document.title = c.titulo + ' · Indómita Modo On';

    /* ---- Parte de arriba (igual que la tarjeta del feed) ---- */
    var hero = h('div', { class: 'pl-hero' },
      h('div', { class: 'pl-hero__inner' },
        h('a', { class: 'pl-volver', href: 'cursos.html', text: '← Todos los cursos' }),
        c.categoria_nombre ? h('span', { class: 'pl-pill pl-pill--cat pl-pill--lima', text: c.categoria_nombre.toUpperCase() }) : null,
        h('h1', { class: 'pl-hero__titulo', text: c.titulo }),
        c.subtitulo ? h('p', { class: 'pl-hero__sinopsis', text: c.subtitulo }) : null,
        h('div', { class: 'pl-nota pl-nota--hero' }, (function () {
          var f = [];
          if (tieneNota) {
            f.push(h('strong', { text: U.nota(c.promedio) }), U.estrellas(c.promedio),
              h('span', { text: '(' + c.cant_resenas + (Number(c.cant_resenas) === 1 ? ' valoración)' : ' valoraciones)') }));
          } else f.push(h('span', { class: 'pl-pill pl-pill--nuevo', text: 'NUEVO' }));
          if (est) f.push(h('span', { text: '· ' + est }));
          return f;
        })()),
        h('p', { class: 'pl-hero__meta' }, 'Creado por ', h('strong', { text: c.docente_nombre })),
        act ? h('p', { class: 'pl-hero__meta', text: 'Última actualización: ' + act }) : null
      )
    );

    /* ---- Tarjeta de compra + "este curso incluye" ---- */
    var incluye = [];
    if (segVideo > 0) incluye.push(['▶', U.duracionLarga(segVideo) + ' de video bajo demanda']);
    if (clases.length) incluye.push(['☰', clases.length + ' clases en ' + d.modulos.length + (d.modulos.length === 1 ? ' módulo' : ' módulos')]);
    if (descargables) incluye.push(['⬇', descargables + (descargables === 1 ? ' recurso descargable' : ' recursos descargables')]);
    incluye.push(['∞', 'Acceso de por vida'], ['📱', 'Acceso desde el celular y la computadora'], ['🏅', 'Certificado de finalización']);

    var boton = h('button', { type: 'button', class: 'pl-btn pl-btn--lima pl-btn--ancho',
      text: d.inscripto ? 'Ir al curso' : (c.es_gratis ? 'Empezar gratis' : 'Comprar curso'),
      onclick: function () {
        U.toast(d.inscripto ? 'El reproductor de clases llega en el próximo paso.' : 'El pago y la inscripción se activan en el próximo paso.');
      } });

    var compra = h('aside', { class: 'pl-compra' },
      T.portada(c),
      h('div', { class: 'pl-compra__cuerpo' },
        h('p', { class: 'pl-compra__precio', text: d.inscripto ? 'Ya es tuyo' : U.precioTexto(c) }),
        boton,
        h('h2', { class: 'pl-compra__titulo', text: 'Este curso incluye' }),
        h('ul', { class: 'pl-incluye' }, incluye.map(function (it) {
          return h('li', null, h('span', { class: 'pl-incluye__icono', 'aria-hidden': 'true', text: it[0] }), h('span', { text: it[1] }));
        }))
      )
    );

    /* ---- Columna principal ---- */
    var main = h('div', { class: 'pl-curso__main' });

    if (d.aprenderas.length) {
      main.appendChild(seccion('Lo que aprenderás',
        h('ul', { class: 'pl-checks pl-caja' }, d.aprenderas.map(function (t) {
          return h('li', null, h('span', { class: 'pl-check', 'aria-hidden': 'true', text: '✓' }), h('span', { text: t }));
        }))));
    }

    /* Contenido del curso (plan de estudios) */
    var contenido;
    if (!d.modulos.length) {
      contenido = h('p', { class: 'pl-texto', text: 'El docente todavía está cargando las clases.' });
    } else {
      contenido = h('div', null,
        h('p', { class: 'pl-meta pl-meta--resumen', text: d.modulos.length + (d.modulos.length === 1 ? ' módulo' : ' módulos') + ' · ' +
          clases.length + (clases.length === 1 ? ' clase' : ' clases') + (segVideo > 0 ? ' · ' + U.duracionLarga(segVideo) + ' en total' : '') }),
        h('div', { class: 'pl-caja pl-caja--sinpad' }, d.modulos.map(function (m, i) {
          var seg = m.clases.reduce(function (s, k) { return s + (k.duracion_seg || 0); }, 0);
          var icono = { video: '▶', pdf: '📄', descargable: '⬇' };
          return h('details', { class: 'pl-modulo', open: i === 0 },
            h('summary', null,
              h('span', { class: 'pl-modulo__titulo', text: m.titulo }),
              h('span', { class: 'pl-meta', text: m.clases.length + (m.clases.length === 1 ? ' clase' : ' clases') + (seg > 0 ? ' · ' + U.duracionLarga(seg) : '') })),
            h('ul', { class: 'pl-clases' }, m.clases.map(function (k) {
              return h('li', null,
                h('span', { class: 'pl-clase__icono', 'aria-hidden': 'true', text: icono[k.tipo] || '•' }),
                h('span', { class: 'pl-clase__titulo' }, k.titulo, k.es_vista_previa ? h('em', { class: 'pl-vista', text: 'Vista previa' }) : null),
                h('span', { class: 'pl-meta', text: U.duracionClase(k.duracion_seg) }));
            })));
        })));
    }
    main.appendChild(seccion('Contenido del curso', contenido));

    if (d.requisitos.length) {
      main.appendChild(seccion('Requisitos', h('ul', { class: 'pl-lista' }, d.requisitos.map(function (t) { return h('li', { text: t }); }))));
    }
    if (d.descripcion) {
      main.appendChild(seccion('Descripción', h('p', { class: 'pl-texto pl-texto--pre', text: d.descripcion })));
    }

    var doc = d.docente;
    var avatar = doc && doc.avatar_url
      ? h('img', { class: 'pl-avatar', src: doc.avatar_url, alt: '', loading: 'lazy' })
      : h('span', { class: 'pl-avatar pl-avatar--inicial', 'aria-hidden': 'true', text: (c.docente_nombre || '?').charAt(0).toUpperCase() });
    main.appendChild(seccion('Docente', h('div', { class: 'pl-docente' }, avatar,
      h('div', null, h('h3', { text: (doc && doc.nombre_publico) || c.docente_nombre }),
        doc && doc.bio_publica ? h('p', { class: 'pl-texto', text: doc.bio_publica }) : null))));

    var vals;
    if (tieneNota) {
      vals = h('div', null,
        h('div', { class: 'pl-resumen-nota' }, h('span', { class: 'pl-nota-grande', text: U.nota(c.promedio) }),
          h('div', null, U.estrellas(c.promedio), h('p', { class: 'pl-meta', text: c.cant_resenas + (Number(c.cant_resenas) === 1 ? ' valoración' : ' valoraciones') }))),
        d.resenas.slice(0, 5).map(function (r) {
          return h('article', { class: 'pl-resena' },
            h('div', { class: 'pl-resena__cab' }, h('strong', { text: r.autor_nombre }), h('span', { class: 'pl-meta', text: U.fechaCorta(r.creado_en) })),
            U.estrellas(r.calificacion),
            r.comentario ? h('p', { class: 'pl-texto', text: r.comentario }) : null);
        }));
    } else {
      vals = h('p', { class: 'pl-texto', text: 'Todavía no hay valoraciones. ¡Podés ser la primera persona en dejar una!' });
    }
    main.appendChild(seccion('Valoraciones', vals));

    U.limpiar(raiz);
    raiz.appendChild(hero);
    raiz.appendChild(h('div', { class: 'pl-curso' }, main, compra));

    /* ---- Los estudiantes también compraron ---- */
    var bloque = h('section', { class: 'pl-relacionados', hidden: true });
    raiz.appendChild(bloque);
    API.tambienCompraron(c).then(function (lista) {
      if (!lista.length) return;
      bloque.appendChild(h('h2', { text: 'Los estudiantes también compraron' }));
      bloque.appendChild(h('div', { class: 'pl-grid pl-grid--compacto' }, lista.map(T.compacta)));
      bloque.hidden = false;
    }).catch(function () {});
  }

  function cargar() {
    var id = new URLSearchParams(window.location.search).get('id');
    if (!id || !UUID.test(id)) return aviso('No encontramos ese curso', 'El link no es válido.');
    API.cursoDetalle(id).then(function (d) {
      if (!d) return aviso('Este curso ya no está disponible', '');
      render(d);
    }).catch(function (e) {
      console.log('Error cargando el curso:', e);
      aviso('No pudimos cargar el curso', 'Revisá tu conexión e intentá de nuevo.');
    });
  }

  U.iniciarPagina(API.client).then(function (s) { if (s) cargar(); });
})();
