/* ============================================================================
   NEON RUN — Serveur de course en réseau local
   ----------------------------------------------------------------------------
   Aucune dépendance : il suffit d'avoir Node.js installé.

   UTILISATION
     1. Mets ce fichier ET neon_runner7_securise.html dans le MÊME dossier.
     2. Ouvre un terminal dans ce dossier et lance :   node serveur_course.js
     3. Le serveur affiche une adresse du style  http://192.168.1.24:8080
     4. Chaque joueur du réseau local ouvre CETTE adresse dans son navigateur,
        puis clique sur COURSE EN LIGNE.

   Le serveur ne stocke rien sur le disque : tout vit en mémoire et disparaît
   quand tu l'arrêtes (Ctrl+C).
   ========================================================================== */
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
const ROOT = __dirname;

/* --- Réglages de course ------------------------------------------------- */
const COUNTDOWN_MS   = 4000;   // temps entre « LANCER » et le départ réel
const PLAYER_TIMEOUT = 12000;  // un joueur qui ne donne plus signe de vie est retiré
const ROOM_TIMEOUT   = 300000; // un salon vide est supprimé au bout de 5 min

/* --- État en mémoire ---------------------------------------------------- */
/* rooms[nom] = { seed, state, startAt, finishCount, touchedAt, players:{id:{…}} } */
const rooms = Object.create(null);
let nextId = 1;

function now(){ return Date.now(); }

function getRoom(name){
  if(!rooms[name]){
    rooms[name] = {
      seed: (Math.random() * 0x7fffffff) | 0,
      state: 'lobby',          // lobby | countdown | racing | done
      startAt: 0,
      finishCount: 0,
      touchedAt: now(),
      players: Object.create(null)
    };
  }
  rooms[name].touchedAt = now();
  return rooms[name];
}

/** Retire les joueurs muets et les salons vides, puis fait avancer l'état. */
function prune(){
  const t = now();
  for(const name in rooms){
    const room = rooms[name];
    for(const id in room.players){
      if(t - room.players[id].lastSeen > PLAYER_TIMEOUT) delete room.players[id];
    }
    const ids = Object.keys(room.players);
    if(!ids.length && t - room.touchedAt > ROOM_TIMEOUT){ delete rooms[name]; continue; }
    if(!ids.length){ room.state = 'lobby'; room.finishCount = 0; continue; }

    if(room.state === 'countdown' && t >= room.startAt) room.state = 'racing';

    if(room.state === 'racing'){
      // La course se termine dès que plus personne n'est encore en piste.
      let running = 0;
      for(const id of ids){
        const p = room.players[id];
        if(p.alive && !p.finished) running++;
      }
      if(!running) room.state = 'done';
    }
  }
}
setInterval(prune, 1000).unref();

/** Liste des joueurs telle qu'elle est renvoyée aux clients. */
function playersView(room){
  const out = [];
  for(const id in room.players){
    const p = room.players[id];
    out.push({
      id: id, name: p.name, dist: Math.round(p.dist),
      alive: !!p.alive, finished: !!p.finished, finishOrder: p.finishOrder | 0
    });
  }
  // Classement : arrivés d'abord (dans l'ordre d'arrivée), puis encore en course
  // (le plus loin devant), puis éliminés (le plus loin devant aussi).
  out.sort(function(a, b){
    const ta = a.finished ? 0 : (a.alive ? 1 : 2);
    const tb = b.finished ? 0 : (b.alive ? 1 : 2);
    if(ta !== tb) return ta - tb;
    if(ta === 0) return a.finishOrder - b.finishOrder;
    return b.dist - a.dist;
  });
  out.forEach(function(p, i){ p.place = i + 1; });
  return out;
}

function roomView(room){
  return {
    ok: true,
    state: room.state,
    seed: room.seed,
    startAt: room.startAt,
    serverTime: now(),
    players: playersView(room)
  };
}

/* --- Utilitaires HTTP --------------------------------------------------- */
function sendJson(res, code, obj){
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
  });
  res.end(body);
}

function readBody(req){
  return new Promise(function(resolve, reject){
    let data = '';
    req.on('data', function(chunk){
      data += chunk;
      if(data.length > 1e5){ reject(new Error('corps trop volumineux')); req.destroy(); }
    });
    req.on('end', function(){
      if(!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch(e){ reject(new Error('JSON invalide')); }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',   '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json'
};

/** Fichier servi quand on ouvre l'adresse racine. */
function findIndex(){
  const preferred = ['index.html', 'neon_runner7_securise.html', 'neon_runner7.html'];
  for(const f of preferred){ if(fs.existsSync(path.join(ROOT, f))) return f; }
  const html = fs.readdirSync(ROOT).filter(function(f){ return f.endsWith('.html'); });
  return html.length ? html[0] : null;
}

function serveStatic(req, res, urlPath){
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if(rel === '/' || rel === ''){
    const idx = findIndex();
    if(!idx){
      res.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'});
      return res.end('Aucun fichier .html trouvé dans ' + ROOT +
        '\nPlace le jeu à côté de serveur_course.js.');
    }
    rel = '/' + idx;
  }
  // On ne sort jamais du dossier du serveur.
  const file = path.join(ROOT, path.normalize(rel).replace(/^([/\\])+/, ''));
  if(!file.startsWith(ROOT)){
    res.writeHead(403); return res.end('interdit');
  }
  fs.stat(file, function(err, st){
    if(err || !st.isFile()){
      res.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'});
      return res.end('introuvable : ' + rel);
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(file).pipe(res);
  });
}

/* --- Routes de course --------------------------------------------------- */
function cleanRoom(v){
  const s = String(v || '').trim();
  return /^[a-zA-Z0-9_-]{1,24}$/.test(s) ? s : '';
}
function cleanName(v){
  return String(v || '').trim().slice(0, 16) || 'JOUEUR';
}

async function handleRace(req, res, route){
  let body;
  try { body = await readBody(req); }
  catch(e){ return sendJson(res, 400, {ok: false, error: e.message}); }

  const roomName = cleanRoom(body.room);
  if(!roomName) return sendJson(res, 400, {ok: false, error: 'nom de salon invalide'});
  const room = getRoom(roomName);

  if(route === 'join'){
    const id = String(nextId++);
    room.players[id] = {
      name: cleanName(body.name), dist: 0, alive: true, finished: false,
      finishOrder: 0, lastSeen: now()
    };
    const view = roomView(room);
    view.id = id;
    return sendJson(res, 200, view);
  }

  const id = String(body.id || '');
  const me = room.players[id];
  if(!me) return sendJson(res, 410, {ok: false, error: 'session expirée', rejoin: true});
  me.lastSeen = now();

  if(route === 'leave'){
    delete room.players[id];
    return sendJson(res, 200, {ok: true});
  }

  if(route === 'start'){
    if(room.state === 'countdown' || room.state === 'racing'){
      return sendJson(res, 200, roomView(room));   // déjà lancée : on suit simplement
    }
    room.seed = (Math.random() * 0x7fffffff) | 0;
    room.state = 'countdown';
    room.startAt = now() + COUNTDOWN_MS;
    room.finishCount = 0;
    for(const pid in room.players){
      const p = room.players[pid];
      p.dist = 0; p.alive = true; p.finished = false; p.finishOrder = 0;
    }
    return sendJson(res, 200, roomView(room));
  }

  if(route === 'poll'){
    if(room.state === 'racing' || room.state === 'countdown'){
      if(typeof body.dist === 'number' && isFinite(body.dist)){
        me.dist = Math.max(me.dist, body.dist);   // la distance ne recule jamais
      }
      if(body.alive === false) me.alive = false;
      if(body.finished === true && !me.finished){
        me.finished = true;
        me.finishOrder = ++room.finishCount;
      }
    }
    prune();
    return sendJson(res, 200, roomView(room));
  }

  return sendJson(res, 404, {ok: false, error: 'route inconnue'});
}

/* --- Serveur ------------------------------------------------------------ */
const server = http.createServer(function(req, res){
  if(req.method === 'OPTIONS'){
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Max-Age': '86400'
    });
    return res.end();
  }

  const url = req.url || '/';
  const m = url.match(/^\/race\/(join|poll|start|leave)\b/);
  if(m){
    if(req.method !== 'POST') return sendJson(res, 405, {ok: false, error: 'POST attendu'});
    return handleRace(req, res, m[1]).catch(function(e){
      sendJson(res, 500, {ok: false, error: String(e && e.message || e)});
    });
  }
  if(url.startsWith('/race/etat')) return sendJson(res, 200, {ok: true, rooms: Object.keys(rooms)});

  if(req.method !== 'GET') { res.writeHead(405); return res.end(); }
  serveStatic(req, res, url);
});

function localAddresses(){
  const out = [];
  const ifs = os.networkInterfaces();
  for(const name in ifs){
    for(const a of ifs[name] || []){
      if(a.family === 'IPv4' && !a.internal) out.push(a.address);
    }
  }
  return out;
}

server.listen(PORT, '0.0.0.0', function(){
  const idx = findIndex();
  console.log('');
  console.log('  ┌──────────────────────────────────────────────┐');
  console.log('  │   NEON RUN — serveur de course réseau local   │');
  console.log('  └──────────────────────────────────────────────┘');
  console.log('');
  console.log('  Jeu servi     : ' + (idx || '⚠ AUCUN .html DANS CE DOSSIER'));
  console.log('  Sur ce PC     : http://localhost:' + PORT);
  localAddresses().forEach(function(ip){
    console.log('  Réseau local  : http://' + ip + ':' + PORT + '   ← à donner aux autres joueurs');
  });
  console.log('');
  console.log('  Chaque joueur ouvre cette adresse, clique sur COURSE EN LIGNE,');
  console.log('  entre le MÊME nom de salon, puis un seul lance la course.');
  console.log('  Ctrl+C pour arrêter.');
  console.log('');
});
