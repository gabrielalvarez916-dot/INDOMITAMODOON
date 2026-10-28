(function () {
  var cfg = window.MODO_ON_CONFIG;
  var client = window.supabase.createClient(cfg.url, cfg.key);
  window.modoOnClient = client;

  var btn = document.getElementById('btn-google');
  var sw = document.getElementById('switch');
  var err = document.getElementById('error');

  function showError(msg) { err.textContent = msg; err.hidden = false; }
  function reset() { sw.classList.remove('is-on'); btn.disabled = false; }

  // Si ya hay sesión (o volvemos de Google), pasamos directo a los cursos.
  client.auth.getSession().then(function (r) {
    if (r.data && r.data.session) window.location.replace('cursos.html');
  });

  btn.addEventListener('click', function () {
    err.hidden = true;
    btn.disabled = true;
    sw.classList.add('is-on'); // el interruptor se prende

    setTimeout(function () {
      client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + '/' }
      }).then(function (r) {
        if (r.error) throw r.error;
      }).catch(function () {
        reset();
        showError('No pudimos conectar con Google. Probá de nuevo.');
      });
    }, 650);
  });

  // Si vuelve con el botón "atrás" del navegador, reiniciamos el estado.
  window.addEventListener('pageshow', function (e) { if (e.persisted) reset(); });
})();
