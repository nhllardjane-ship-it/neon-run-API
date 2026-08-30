// Types de l'API du jeu Neon Run — version 1.0.0
// Place ce fichier à côté de ton code : les éditeurs (VS Code…) proposeront
// l'autocomplétion sur window.NeonRun et sur NeonRunClient.

export type NeonRunScreen =
  | 'start' | 'playing' | 'gameover' | 'shop' | 'profile' | 'settings'
  | 'messages' | 'online' | 'contest' | 'pass' | 'auth' | 'admin'
  | 'race-intro' | 'raceresult' | 'ol-countdown' | 'caged';

export type NeonRunOpenable =
  'menu' | 'shop' | 'profile' | 'settings' | 'messages' | 'online' | 'contest' | 'pass';

export type NeonRunLangId = 'fr' | 'en' | 'es' | 'pt' | 'ar' | 'ru' | 'zh' | 'hi';

export type NeonRunZone = 'glitch' | 'admin' | 'diamond' | 'pcb' | null;

export type NeonRunEvent =
  | 'run:start' | 'run:end' | 'score' | 'coins'
  | 'message' | 'peer' | 'lang' | 'screen';

export interface NeonRunInfo {
  version: string;
  game: 'Neon Run';
  lang: NeonRunLangId;
  screen: NeonRunScreen;
  online: boolean;
  /** pseudo du correspondant si une liaison pair à pair est ouverte */
  peer: string | null;
}

export interface NeonRunPlayer {
  name: string;
  logged: boolean;
  /** le compte a-t-il accès au panel d'administration (lecture seule) */
  admin: boolean;
  best: number;
  coins: number;
  runs: number;
  skins: string[];
  equipped: string;
  abilities: string[];
  levels: Record<string, number>;
  trophies: number;
  pass: { season: number; level: number; premium: boolean };
}

export interface NeonRunRun {
  playing: boolean;
  screen: NeonRunScreen;
  score: number;
  /** pièces ramassées dans la partie en cours */
  coins: number;
  distance: number;
  x: number;
  y: number;
  speed: number;
  online: boolean;
  zone: NeonRunZone;
}

export interface NeonRunStats {
  fps: number;
  frameMs: number;
  obstacles: number;
  particles: number;
  /** graine de la piste — identique chez tous les joueurs d'une course en ligne */
  seed: number;
  debug: boolean;
}

export interface NeonRunSettings {
  lang: NeonRunLangId;
  muted: boolean;
  hitboxes: boolean;
}

export interface NeonRunLang {
  id: NeonRunLangId;
  name: string;
  flag: string;
  rtl: boolean;
}

export interface NeonRunMessage {
  mine: boolean;
  text: string;
  at: number;
}

export interface NeonRunContact {
  name: string;
  unread: number;
  last: number;
  count: number;
}

export interface NeonRunMessages {
  connected(): boolean;
  peer(): string | null;
  unread(): number;
  contacts(): NeonRunContact[];
  history(name?: string): NeonRunMessage[];
  /** lève une erreur si aucune liaison pair à pair n'est ouverte */
  send(text: string): true;
}

/** Charges utiles des évènements, par nom. */
export interface NeonRunEventMap {
  'run:start': { at: number };
  'run:end': { score: number; coins: number; best: number; record: boolean };
  'score': { score: number; coins: number; distance: number };
  'coins': { coins: number };
  'message': { from: string; text: string; at: number; mine: boolean };
  'peer': { connected: boolean; name: string };
  'lang': { lang: NeonRunLangId };
  'screen': { screen: NeonRunScreen };
}

export interface NeonRunApi {
  readonly version: string;
  readonly events: NeonRunEvent[];

  info(): NeonRunInfo;
  player(): NeonRunPlayer;
  run(): NeonRunRun;
  stats(): NeonRunStats;
  settings(): NeonRunSettings;
  langs(): NeonRunLang[];
  screen(): NeonRunScreen;

  setLang(id: NeonRunLangId): true;
  setMuted(v: boolean): boolean;
  open(name: NeonRunOpenable): boolean;
  play(): boolean;
  endRun(): boolean;

  messages: NeonRunMessages;

  /** renvoie une fonction de désabonnement */
  on<K extends NeonRunEvent>(ev: K, fn: (data: NeonRunEventMap[K], ev: K) => void): () => void;
  off(ev: NeonRunEvent, fn: Function): boolean;
  help(): string;
}

export interface NeonRunClientInstance extends
  Pick<NeonRunApi, 'info' | 'player' | 'run' | 'stats' | 'settings' | 'langs' |
       'screen' | 'setLang' | 'setMuted' | 'open' | 'play' | 'endRun' | 'messages' | 'off'> {
  readonly clientVersion: string;
  readonly raw: NeonRunApi;
  on<K extends NeonRunEvent>(ev: K, fn: (data: NeonRunEventMap[K], ev: K) => void): () => void;
  once<K extends NeonRunEvent>(ev: K): Promise<NeonRunEventMap[K]>;
  playOnce(): Promise<NeonRunEventMap['run:end']>;
  snapshot(): Record<string, unknown>;
  poll(fn: (snap: Record<string, unknown>) => void, everyMs?: number): () => void;
  dispose(): void;
}

export declare const NeonRunClient: {
  version: string;
  attach(target?: Window | HTMLIFrameElement, timeoutMs?: number): Promise<NeonRunClientInstance>;
  wrap(api: NeonRunApi): NeonRunClientInstance;
};

declare global {
  interface Window {
    NeonRun?: NeonRunApi;
    NeonRunClient?: typeof NeonRunClient;
  }
}
