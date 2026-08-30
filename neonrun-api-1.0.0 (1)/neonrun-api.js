/*!
 * neonrun-api.js — petite bibliothèque d'accès à l'API du jeu Neon Run
 * Version 1.0.0 — aucune dépendance, fonctionne dans un navigateur ou dans la
 * console. Elle ne fait qu'envelopper window.NeonRun : elle n'ajoute aucun
 * pouvoir que le jeu ne donne pas déjà.
 *
 * Utilisation la plus simple (console du navigateur, sur la page du jeu) :
 *     NeonRun.help()
 *
 * Utilisation depuis une page qui affiche le jeu dans une <iframe> :
 *     const api = await NeonRunClient.attach(document.querySelector('iframe'));
 *     api.on('score', s => console.log(s.score));
 *
 * Attention : une iframe n'est lisible que si la page et le jeu viennent de la
 * MÊME origine. En file:// Chrome refuse ; sers les deux fichiers depuis un
 * petit serveur local (par exemple  python3 -m http.server ) et tout marche.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NeonRunClient = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';

  function pick(win) {
    try { return win && win.NeonRun ? win.NeonRun : null; } catch (e) { return null; }
  }

  /**
   * Attend que l'API soit disponible dans une fenêtre donnée.
   * @param {Window|HTMLIFrameElement} [target] fenêtre, iframe, ou rien pour la page courante
   * @param {number} [timeoutMs] abandon au bout de ce délai (défaut 15 s)
   * @returns {Promise<object>} l'objet NeonRun
   */
  function attach(target, timeoutMs) {
    var limit = typeof timeoutMs === 'number' ? timeoutMs : 15000;
    var win;
    if (!target) win = typeof window !== 'undefined' ? window : null;
    else if (target.contentWindow !== undefined) win = target.contentWindow;
    else win = target;

    return new Promise(function (resolve, reject) {
      var t0 = Date.now();
      (function look() {
        var api = pick(win);
        if (api) return resolve(wrap(api));
        if (Date.now() - t0 > limit) {
          return reject(new Error(
            'NeonRunClient : API introuvable. Vérifie que la page du jeu est bien chargée, ' +
            'et que la page et le jeu viennent de la même origine (pas de file://).'));
        }
        setTimeout(look, 120);
      }());
    });
  }

  /** Enveloppe l'API brute avec quelques commodités. */
  function wrap(api) {
    var offs = [];

    var client = {
      clientVersion: VERSION,
      /** l'objet NeonRun d'origine, si tu veux tout faire à la main */
      raw: api,

      info: function () { return api.info(); },
      player: function () { return api.player(); },
      run: function () { return api.run(); },
      stats: function () { return api.stats(); },
      settings: function () { return api.settings(); },
      langs: function () { return api.langs(); },
      screen: function () { return api.screen(); },

      setLang: function (id) { return api.setLang(id); },
      setMuted: function (v) { return api.setMuted(v); },
      open: function (name) { return api.open(name); },
      play: function () { return api.play(); },
      endRun: function () { return api.endRun(); },

      messages: api.messages,

      /** S'abonner. Renvoie une fonction de désabonnement. */
      on: function (ev, fn) { var off = api.on(ev, fn); offs.push(off); return off; },
      off: function (ev, fn) { return api.off(ev, fn); },

      /** Coupe TOUS les abonnements pris via ce client. */
      dispose: function () { offs.splice(0).forEach(function (f) { try { f(); } catch (e) {} }); },

      /**
       * Attend le prochain évènement d'un type donné.
       * @returns {Promise<object>}
       */
      once: function (ev) {
        return new Promise(function (resolve) {
          var off = api.on(ev, function (data) { off(); resolve(data); });
        });
      },

      /**
       * Joue une partie et rend le résultat quand elle se termine.
       * @returns {Promise<{score:number, coins:number, best:number}>}
       */
      playOnce: function () {
        var p = client.once('run:end');
        api.play();
        return p;
      },

      /**
       * Résumé lisible de l'état courant — pratique pour un tableau de bord.
       */
      snapshot: function () {
        var r = api.run(), p = api.player(), s = api.stats();
        return {
          at: Date.now(),
          screen: r.screen, playing: r.playing,
          score: r.score, runCoins: r.coins, distance: r.distance,
          x: r.x, y: r.y, speed: r.speed, zone: r.zone,
          name: p.name, best: p.best, coins: p.coins, equipped: p.equipped,
          fps: s.fps, frameMs: s.frameMs
        };
      },

      /**
       * Appelle `fn` avec un snapshot à intervalle régulier.
       * @returns {function} pour arrêter
       */
      poll: function (fn, everyMs) {
        var id = setInterval(function () { fn(client.snapshot()); }, everyMs || 500);
        var stop = function () { clearInterval(id); };
        offs.push(stop);
        return stop;
      }
    };
    return client;
  }

  return { version: VERSION, attach: attach, wrap: wrap };
}));
