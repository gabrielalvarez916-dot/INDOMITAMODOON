// tarjetas.js — tarjeta del feed (estilo Udemy) y versión compacta para "también compraron".
(function () {
  var U = window.ModoOnUI, h = U.h;

  function portada(c) {
    var caja = h('div', { class: 'pl-portada' });
    if (c.portada_url) caja.appendChild(h('img', { src: c.portada_url, alt: '', loading: 'lazy', decoding: 'async' }));
    else caja.appendChild(h('span', { class: 'pl-portada__vacia', 'aria-hidden': 'true', text: '▶' }));
    return caja;
  }

  function filaNota(c) {
    var fila = h('div', { class: 'pl-nota' });
    if (Number(c.cant_resenas) > 0) {
      fila.appendChild(h('strong', { text: U.nota(c.promedio) }));
      fila.appendChild(U.estrellas(c.promedio));
      fila.appendChild(h('span', { class: 'pl-meta', text: '(' + c.cant_resenas + ')' }));
    } else {
      fila.appendChild(h('span', { class: 'pl-pill pl-pill--nuevo', text: 'NUEVO' }));
    }
    var est = U.estudiantesTexto(c.cant_estudiantes);
    if (est) fila.appendChild(h('span', { class: 'pl-meta', text: '· ' + est }));
    return fila;
  }

  function precio(c) {
    return c.es_gratis
      ? h('span', { class: 'pl-pill pl-pill--gratis', text: 'GRATIS' })
      : h('span', { class: 'pl-precio', text: U.precioTexto(c) });
  }

  function tarjeta(c) {
    var meta = [];
    if (Number(c.cant_clases) > 0) meta.push(c.cant_clases + ' clases');
    var dur = U.duracionLarga(c.duracion_seg); if (dur) meta.push(dur);
    var act = U.mesAnio(c.actualizado_en); if (act) meta.push('Actualizado ' + act);

    var top = h('div', { class: 'pl-card__top' }, portada(c));
    if (c.categoria_nombre) top.appendChild(h('span', { class: 'pl-pill pl-pill--cat', text: c.categoria_nombre.toUpperCase() }));

    return h('a', { class: 'pl-card', href: 'curso.html?id=' + encodeURIComponent(c.id) },
      top,
      h('div', { class: 'pl-card__cuerpo' },
        h('h3', { class: 'pl-card__titulo', text: c.titulo }),
        c.subtitulo ? h('p', { class: 'pl-card__sinopsis', text: c.subtitulo }) : null,
        h('p', { class: 'pl-card__docente' }, 'Creado por ', h('strong', { text: c.docente_nombre })),
        filaNota(c),
        h('p', { class: 'pl-meta', text: meta.join(' · ') }),
        h('div', { class: 'pl-card__precio' }, precio(c))
      )
    );
  }

  function compacta(c) {
    var nota = Number(c.cant_resenas) > 0
      ? h('div', { class: 'pl-nota' }, h('strong', { text: U.nota(c.promedio) }), U.estrellas(c.promedio))
      : null;
    return h('a', { class: 'pl-card pl-card--compacta', href: 'curso.html?id=' + encodeURIComponent(c.id) },
      portada(c),
      h('div', { class: 'pl-card__cuerpo' },
        h('h3', { class: 'pl-card__titulo', text: c.titulo }),
        h('p', { class: 'pl-card__docente', text: c.docente_nombre }),
        nota,
        h('div', { class: 'pl-card__precio' }, precio(c))
      )
    );
  }

  window.ModoOnTarjetas = { tarjeta: tarjeta, compacta: compacta, portada: portada, filaNota: filaNota };
})();
