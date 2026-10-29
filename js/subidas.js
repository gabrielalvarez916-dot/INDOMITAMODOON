// subidas.js — subir archivos reales (video, PDF, imágenes), con barra de progreso.
// Nada de links: lo que carga el docente queda guardado en la plataforma.
// Portadas (imágenes chicas) → Supabase Storage, bucket "portadas". Videos → Cloudflare Stream. PDF → Cloudflare R2.
(function () {
  var cfg = window.MODO_ON_CONFIG, client = window.modoOnClient;

  function rutaCodificada(path) { return path.split('/').map(encodeURIComponent).join('/'); }

  // Sube un archivo. onProgress recibe un número de 0 a 100. Devuelve la ruta guardada.
  function subir(bucket, path, file, onProgress) {
    return client.auth.getSession().then(function (r) {
      var sesion = r.data && r.data.session;
      if (!sesion) throw new Error('Tu sesión se cerró. Volvé a ingresar.');
      return new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', cfg.url + '/storage/v1/object/' + bucket + '/' + rutaCodificada(path));
        xhr.setRequestHeader('Authorization', 'Bearer ' + sesion.access_token);
        xhr.setRequestHeader('apikey', cfg.key);
        xhr.setRequestHeader('x-upsert', 'false');
        xhr.setRequestHeader('cache-control', 'max-age=3600');
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        xhr.upload.onprogress = function (e) {
          if (onProgress && e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = function () {
          if (xhr.status >= 200 && xhr.status < 300) { resolve(path); return; }
          var msg = '';
          try { var j = JSON.parse(xhr.responseText); msg = j.message || j.error || ''; } catch (e) { /* sin detalle */ }
          if (xhr.status === 413 || /exceeded|too large/i.test(msg)) msg = 'El archivo es más grande de lo que permite el servidor.';
          reject(new Error(msg || 'No se pudo subir el archivo (error ' + xhr.status + ').'));
        };
        xhr.onerror = function () { reject(new Error('Se cortó la conexión mientras se subía el archivo. Probá de nuevo.')); };
        xhr.onabort = function () { reject(new Error('Subida cancelada.')); };
        xhr.send(file);
      });
    });
  }

  function urlPublica(bucket, path) {
    return client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }

  // Ruta guardada a partir de una URL pública de nuestro bucket (para poder borrar el archivo viejo)
  function rutaDeUrlPublica(bucket, url) {
    var marca = '/storage/v1/object/public/' + bucket + '/';
    var k = String(url || '').indexOf(marca);
    if (k < 0) return null;
    return decodeURIComponent(url.slice(k + marca.length).split('?')[0]);
  }

  // Enlace temporal (1 hora) para ver un archivo privado
  function urlFirmada(bucket, path) {
    return client.storage.from(bucket).createSignedUrl(path, 3600).then(function (r) {
      if (r.error) throw r.error;
      return r.data.signedUrl;
    });
  }

  // Abre un archivo privado en una pestaña nueva (se abre primero para que el navegador no la bloquee)
  function abrirPrivado(bucket, path, onError) {
    var w = window.open('', '_blank');
    urlFirmada(bucket, path).then(function (u) {
      if (w) w.location.href = u; else window.location.href = u;
    }).catch(function (e) { if (w) w.close(); if (onError) onError(e); });
  }

  function borrar(bucket, paths) {
    var lista = (paths || []).filter(Boolean);
    if (!lista.length) return Promise.resolve();
    return client.storage.from(bucket).remove(lista).then(function () {}, function () {});
  }

  // Duración de un video en segundos (la lee el navegador del propio archivo)
  function duracionVideo(file) {
    return new Promise(function (resolve) {
      var v = document.createElement('video');
      var url = URL.createObjectURL(file);
      var fin = function (s) { URL.revokeObjectURL(url); resolve(s); };
      v.preload = 'metadata';
      v.onloadedmetadata = function () { fin(isFinite(v.duration) ? Math.round(v.duration) : 0); };
      v.onerror = function () { fin(0); };
      v.src = url;
    });
  }


  /* ---------- Cloudflare: videos en Stream, PDF en R2 (vía la función "archivos") ---------- */
  function llamar(accion, datos) {
    return client.functions.invoke('archivos', { body: Object.assign({ accion: accion }, datos) }).then(function (r) {
      if (!r.error) return r.data;
      var ctx = r.error.context;
      var base = 'No se pudo comunicar con el servidor de archivos.';
      if (ctx && typeof ctx.json === 'function') {
        return ctx.json().then(function (j) { throw new Error((j && j.error) || base); }, function () { throw new Error(base); });
      }
      throw new Error(base);
    });
  }

  // Video → Cloudflare Stream (subida reanudable: si se corta la conexión, retoma donde quedó). Devuelve el id del video.
  function subirVideo(claseId, file, onProgress) {
    if (!window.tus) return Promise.reject(new Error('No cargó el módulo de subida de videos. Recargá la página.'));
    return llamar('video_subida', { clase_id: claseId, tamano: file.size }).then(function (r) {
      return new Promise(function (resolve, reject) {
        var up = new window.tus.Upload(file, {
          uploadUrl: r.upload_url, uploadSize: file.size, chunkSize: 50 * 1024 * 1024,
          retryDelays: [0, 3000, 5000, 10000, 20000],
          metadata: { filename: file.name, filetype: file.type },
          onError: function () { reject(new Error('Se cortó la subida del video. Probá de nuevo.')); },
          onProgress: function (sent, total) { if (onProgress) onProgress(Math.round((sent / total) * 100)); },
          onSuccess: function () { resolve(r.video_uid); }
        });
        up.start();
      });
    });
  }

  // PDF → Cloudflare R2 (enlace temporal de subida). Devuelve la ruta guardada.
  function subirPdf(claseId, file, onProgress) {
    return llamar('pdf_subida', { clase_id: claseId, tamano: file.size, tipo: file.type }).then(function (r) {
      return new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open('PUT', r.upload_url);
        xhr.setRequestHeader('Content-Type', 'application/pdf');
        xhr.upload.onprogress = function (e) { if (onProgress && e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
        xhr.onload = function () {
          if (xhr.status >= 200 && xhr.status < 300) resolve(r.key);
          else reject(new Error('No se pudo subir el PDF (error ' + xhr.status + ').'));
        };
        xhr.onerror = function () { reject(new Error('No se pudo subir el PDF. Si pasa siempre, falta permitir esta web (CORS) en el bucket de Cloudflare R2.')); };
        xhr.send(file);
      });
    });
  }

  // Abre el video o el PDF de una clase en una pestaña nueva (enlace temporal; la base decide quién puede)
  function verArchivo(claseId, tipo, onError) {
    var w = window.open('', '_blank');
    llamar('ver', { clase_id: claseId, tipo: tipo }).then(function (r) {
      if (w) w.location.href = r.url; else window.location.href = r.url;
    }).catch(function (e) { if (w) w.close(); if (onError) onError(e); });
  }

  // Borra de Cloudflare lo que ya no usa ninguna clase: { video_uids: [], archivos: [] }
  function borrarRemoto(lo) {
    if (!lo || (!(lo.video_uids || []).length && !(lo.archivos || []).length)) return Promise.resolve();
    return llamar('borrar', lo).then(function () {}, function () {});
  }

  function extension(file, porDefecto) {
    var e = (file.name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return e || porDefecto;
  }
  function azar() { return Math.random().toString(36).slice(2, 8); }

  window.ModoOnSubidas = {
    subir: subir, urlPublica: urlPublica, rutaDeUrlPublica: rutaDeUrlPublica, urlFirmada: urlFirmada,
    abrirPrivado: abrirPrivado, borrar: borrar, duracionVideo: duracionVideo, extension: extension, azar: azar,
    subirVideo: subirVideo, subirPdf: subirPdf, verArchivo: verArchivo, borrarRemoto: borrarRemoto
  };
})();
