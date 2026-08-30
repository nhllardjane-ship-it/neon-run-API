# API de Neon Run — version 1.0.0

Le jeu expose une interface JavaScript appelée **`window.NeonRun`**. N'importe
quel script tournant sur la page du jeu peut s'en servir pour lire l'état de la
partie, réagir aux évènements, changer la langue, ouvrir un écran ou envoyer un
message privé.

## Ce que l'API fait — et ce qu'elle ne fait pas

**Elle fait :** lire la progression, suivre une partie en direct, écouter des
évènements, naviguer entre les écrans, régler la langue et le son, et utiliser
la messagerie pair à pair.

**Elle ne fait pas :** donner des pièces, débloquer des skins, monter le pass,
ouvrir le panel admin, activer une triche, ni lire un mot de passe. Ce n'est pas
un oubli, c'est une décision : une API qui distribue des récompenses vide le jeu
de son intérêt, et un mot de passe n'a rien à faire dans une interface publique.
Ce qui triche reste dans le panel admin, derrière son mot de passe.

## Démarrer en dix secondes

Ouvre le jeu, puis la console du navigateur (F12), et tape :

```js
NeonRun.help()          // la liste complète, dans la console
NeonRun.player()        // ton pseudo, ton record, tes pièces, tes skins
NeonRun.run()           // la partie en cours
```

## Lecture

| Appel | Ce que ça rend |
|---|---|
| `NeonRun.version` | la version de l'API, ici `"1.0.0"` |
| `NeonRun.info()` | `{version, game, lang, screen, online, peer}` |
| `NeonRun.player()` | pseudo, record, pièces, parties jouées, skins possédés, skin équipé, capacités et leurs niveaux, coupes, pass |
| `NeonRun.run()` | `{playing, screen, score, coins, distance, x, y, speed, online, zone}` |
| `NeonRun.stats()` | `{fps, frameMs, obstacles, particles, seed, debug}` |
| `NeonRun.settings()` | `{lang, muted, hitboxes}` |
| `NeonRun.langs()` | les huit langues : `{id, name, flag, rtl}` |
| `NeonRun.screen()` | le nom de l'écran affiché |

`zone` vaut `null` hors zone, sinon `"glitch"`, `"admin"`, `"diamond"` ou
`"pcb"` selon le trou emprunté. `seed` est la graine de la piste : en course en
ligne, elle est la même chez tous les joueurs — c'est ce qui garantit que
personne ne court sur un tracé différent.

## Actions

```js
NeonRun.play()               // lance une partie (rend false si une partie tourne déjà)
NeonRun.endRun()             // termine la partie en cours
NeonRun.open('shop')         // menu, shop, profile, settings, messages, online, contest, pass
NeonRun.setLang('es')        // fr, en, es, pt, ar, ru, zh, hi
NeonRun.setMuted(true)       // coupe le son ; rend l'état obtenu
```

`open()` refuse de changer d'écran pendant une partie (sauf `'menu'`) : sinon on
se retrouverait avec un joueur qui court derrière une boutique ouverte.

## Évènements

```js
const off = NeonRun.on('score', d => console.log(d.score, d.distance));
// ... plus tard
off();                        // se désabonner
```

`on()` renvoie **la fonction de désabonnement** ; `off(nom, fonction)` marche
aussi. Une erreur levée dans ton code d'abonné est avalée : elle n'interrompt
jamais la boucle du jeu.

| Évènement | Charge utile | Quand |
|---|---|---|
| `run:start` | `{at}` | une partie démarre |
| `run:end` | `{score, coins, best, record}` | la partie se termine ; `record` dit si c'est un nouveau record |
| `score` | `{score, coins, distance}` | le score change (au plus 5 fois par seconde) |
| `coins` | `{coins}` | le total de pièces du profil change |
| `message` | `{from, text, at, mine}` | un message privé part ou arrive |
| `peer` | `{connected, name}` | une liaison pair à pair s'ouvre ou se ferme |
| `lang` | `{lang}` | la langue change |
| `screen` | `{screen}` | on change d'écran |

## Messagerie privée

Les messages voyagent **directement d'un appareil à l'autre**, par la liaison
WebRTC déjà utilisée pour la course en ligne. Aucun serveur, aucun compte
distant : si la liaison n'est pas ouverte, on ne peut rien envoyer, et c'est
normal.

```js
NeonRun.messages.connected()      // true si la liaison est ouverte
NeonRun.messages.peer()           // pseudo du correspondant, ou null
NeonRun.messages.contacts()       // conversations conservées, la plus récente d'abord
NeonRun.messages.history('Bob')   // [{mine, text, at}, ...]
NeonRun.messages.send('salut !')  // lève une erreur s'il n'y a pas de liaison
```

Pour ouvrir la liaison : écran **MESSAGES** (ou **COURSE EN LIGNE → PAIR À
PAIR**), l'un crée une invitation, l'autre colle le code et renvoie sa réponse.
C'est le même échange de codes dans les deux écrans, parce que c'est la même et
unique liaison.

Les conversations sont gardées sur l'appareil : les douze correspondants les
plus récents, 300 messages chacun.

## La bibliothèque `neonrun-api.js`

Facultative. Elle enveloppe `window.NeonRun` et ajoute quelques commodités :
attendre que le jeu soit prêt, attendre un évènement sous forme de promesse,
prendre des instantanés, et tout désabonner d'un coup.

```html
<script src="neonrun-api.js"></script>
<script>
  (async () => {
    const api = await NeonRunClient.attach();      // ou .attach(monIframe)
    api.poll(s => console.log(s.score, s.fps), 500);
    const fin = await api.playOnce();
    console.log('Partie finie avec', fin.score);
  })();
</script>
```

### Depuis une page extérieure, via une iframe

`NeonRunClient.attach(iframe)` lit l'API à travers l'iframe — **à condition que
la page et le jeu viennent de la même origine.** En `file://`, Chrome traite
chaque fichier comme une origine différente et bloque l'accès. Sers les deux
fichiers depuis un petit serveur local et tout fonctionne :

```
python3 -m http.server 8000
```

puis ouvre `http://localhost:8000/exemple.html`.

La page d'exemple cherche le jeu à côté d'elle, sous le nom
`neon_runner7_securise.html`. S'il est ailleurs, dis-le dans l'adresse :
`exemple.html?jeu=../neon_runner7_securise.html`.

Si tu ne veux pas de serveur, ouvre simplement le jeu et travaille dans sa
console : `window.NeonRun` y est directement accessible.

## Stabilité

Le numéro de version suit les règles habituelles : tant que le premier chiffre
ne change pas, ce qui est écrit ici continue de marcher. Les champs peuvent
s'enrichir, pas disparaître.

Vérifie la version si ton script doit être prudent :

```js
if (!window.NeonRun || parseInt(NeonRun.version) !== 1) {
  throw new Error('API Neon Run version 1 attendue');
}
```
