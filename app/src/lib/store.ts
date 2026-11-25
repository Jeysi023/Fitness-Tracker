/* Data model and on-device storage for Daily Reps.
   Everything is saved on this phone only (localStorage). Backups are JSON files the user keeps. */

export const PLATES = ["red", "blue", "yellow", "green", "gray"] as const;
export type Plate = (typeof PLATES)[number];
export type Unit = "reps" | "sec";
export const PLATE_NAMES: Record<Plate, string> = { red: "Red", blue: "Blue", yellow: "Yellow", green: "Green", gray: "Gray" };
export const DEFAULT_QUICK: Record<Unit, number[]> = { reps: [1, 5, 10, 20], sec: [15, 30, 60] };
export const WEEK = [1, 2, 3, 4, 5, 6, 0];
export const WD_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const MAX_BACK_DAYS = 60;

export interface Exercise { id: string; name: string; goal: number; color: Plate; unit: Unit; quick: number[] }
export interface Settings { kind: "settings"; restDays: number[]; exercises: Exercise[] }
export interface GoalSnap { goal: number; name: string; color: Plate; unit: Unit }
export interface Entry { id: string; ex: string; n: number; t: number }
export interface Day { kind: "day"; date: string; rest: boolean; goals: Record<string, GoalSnap>; entries: Entry[] }
export interface State { settings: Settings; days: Record<string, Day> }
export interface ParsedBackup { state: State; exportedAt: string | null; dayCount: number }

const LS_KEY = "daily-reps-v1";
const ID_RE = /^[a-z0-9]{4,32}$/;

/* ---------- helpers ---------- */
export function newId() {
  return (Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-5)).replace(/[^a-z0-9]/g, "x");
}
/* The day rolls over at midnight US Central time (Texas), whatever time zone the phone is in.
   "America/Chicago" follows Texas clocks, including daylight saving. Set times still show on the phone's own clock. */
export const DAY_TIME_ZONE = "America/Chicago";
let dayFmt: Intl.DateTimeFormat | null = null;
/* The calendar date (YYYY-MM-DD) in Texas right now, or at time `at`. */
export function todayKey(at?: number) {
  try {
    dayFmt = dayFmt || new Intl.DateTimeFormat("en-CA", { timeZone: DAY_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
    const p = Object.fromEntries(dayFmt.formatToParts(at === undefined ? new Date() : new Date(at)).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}`;
  } catch {
    return dateKey(at === undefined ? new Date() : new Date(at));
  }
}
/* A local calendar Date to its YYYY-MM-DD key (calendar arithmetic only, no time zone). */
function dateKey(d: Date) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
/* When the current day ends (next midnight in Texas), as a timestamp, so it can be shown on the phone's clock. */
export function nextResetTime(now = Date.now()) {
  const k = todayKey(now);
  let t = now - (now % 60000);
  for (let i = 0; i < 26 && todayKey(t + 3600000) === k; i++) t += 3600000;
  for (let i = 0; i < 61 && todayKey(t) === k; i++) t += 60000;
  return t;
}
export function keyToDate(k: string) { const p = k.split("-").map(Number); return new Date(p[0], p[1] - 1, p[2]); }
export function shiftKey(k: string, days: number) { const d = keyToDate(k); d.setDate(d.getDate() + days); return dateKey(d); }
export function longDate(k: string) { return keyToDate(k).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }); }
export function dayLabel(k: string) {
  const t = todayKey();
  if (k === t) return "Today";
  if (k === shiftKey(t, -1)) return "Yesterday";
  return keyToDate(k).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}
export function fmtTime(t: number) {
  try { return new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); } catch { return ""; }
}
export function unitWord(unit: Unit, n: number) { return unit === "sec" ? "sec" : n === 1 ? "rep" : "reps"; }
export function clampGoal(g: unknown) { const n = Math.round(Number(g)); return Number.isFinite(n) && n >= 1 ? Math.min(n, 99999) : 100; }
export function parseQuick(v: unknown, unit: Unit) {
  const raw = Array.isArray(v) ? v : String(v || "").split(/[\s,]+/);
  const nums = raw.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 9999);
  const uniq = Array.from(new Set(nums)).sort((a, b) => a - b).slice(0, 4);
  return uniq.length ? uniq : DEFAULT_QUICK[unit].slice();
}

function defaultSettings(): Settings {
  return { kind: "settings", restDays: [], exercises: [{ id: newId(), name: "Push-ups", goal: 100, color: "red", unit: "reps", quick: DEFAULT_QUICK.reps.slice() }] };
}
function cleanSettings(o: any): Settings | null {
  if (!o || !Array.isArray(o.exercises)) return null;
  const exercises = o.exercises
    .filter((e: any) => e && typeof e.id === "string" && ID_RE.test(e.id))
    .slice(0, 30)
    .map((e: any) => {
      const unit: Unit = e.unit === "sec" ? "sec" : "reps";
      return {
        id: e.id,
        name: String(e.name || "Exercise").slice(0, 40),
        goal: clampGoal(e.goal),
        color: (PLATES as readonly string[]).includes(e.color) ? e.color : "gray",
        unit,
        quick: parseQuick(e.quick, unit),
      };
    });
  const restDays = Array.isArray(o.restDays)
    ? Array.from(new Set<number>(o.restDays.filter((d: any) => Number.isInteger(d) && d >= 0 && d <= 6)))
    : [];
  return { kind: "settings", restDays, exercises };
}
function cleanDay(o: any): Day | null {
  if (!o || typeof o.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(o.date)) return null;
  const goals: Record<string, GoalSnap> = {};
  if (o.goals && typeof o.goals === "object") {
    for (const [k, v] of Object.entries<any>(o.goals)) {
      if (ID_RE.test(k) && v && typeof v === "object") {
        goals[k] = {
          goal: clampGoal(v.goal),
          name: String(v.name || "").slice(0, 40),
          color: (PLATES as readonly string[]).includes(v.color) ? v.color : "gray",
          unit: v.unit === "sec" ? "sec" : "reps",
        };
      }
    }
  }
  const entries: Entry[] = Array.isArray(o.entries)
    ? o.entries
        .filter((e: any) => e && ID_RE.test(String(e.ex)) && Number.isFinite(Number(e.n)) && Number(e.n) > 0)
        .slice(0, 2000)
        .map((e: any) => ({ id: ID_RE.test(String(e.id)) ? String(e.id) : newId(), ex: String(e.ex), n: Math.min(9999, Math.round(Number(e.n))), t: Number(e.t) || 0 }))
    : [];
  return { kind: "day", date: o.date, rest: o.rest === true, goals, entries };
}
function parseState(o: any): State | null {
  const s = cleanSettings(o && o.settings);
  if (!s) return null;
  const days: Record<string, Day> = {};
  if (o.days && typeof o.days === "object") {
    for (const d of Object.values(o.days)) { const c = cleanDay(d); if (c) days[c.date] = c; }
  }
  return { settings: s, days };
}

/* ---------- store ---------- */
class RepStore {
  state: State = { settings: defaultSettings(), days: {} };
  version = 0;
  storageOk = true;
  persisted: boolean | null = null;
  private listeners = new Set<() => void>();

  constructor() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) { const s = parseState(JSON.parse(raw)); if (s) this.state = s; }
    } catch { this.storageOk = false; }
  }

  subscribe = (l: () => void) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };
  getVersion = () => this.version;
  private emit() { this.version++; this.listeners.forEach((l) => l()); }
  private save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(this.state)); this.storageOk = true; }
    catch { this.storageOk = false; }
    this.emit();
  }

  /* Ask the browser not to clear this app's storage when the phone runs low on space. */
  async requestPersist() {
    try {
      if (navigator.storage?.persisted && (await navigator.storage.persisted())) { this.persisted = true; }
      else if (navigator.storage?.persist) { this.persisted = await navigator.storage.persist(); }
    } catch { this.persisted = null; }
    this.emit();
  }

  /* ----- reads ----- */
  get exercises() { return this.state.settings.exercises; }
  findEx(id: string) { return this.state.settings.exercises.find((e) => e.id === id); }
  totalFor(k: string, exId: string) {
    const d = this.state.days[k];
    return d ? d.entries.reduce((s, e) => (e.ex === exId ? s + e.n : s), 0) : 0;
  }
  entriesFor(k: string, exId: string) { const d = this.state.days[k]; return d ? d.entries.filter((e) => e.ex === exId) : []; }
  isRest(k: string) {
    const d = this.state.days[k];
    if (d) return !!d.rest;
    return this.state.settings.restDays.includes(keyToDate(k).getDay());
  }
  goalOn(k: string, ex: Exercise) {
    if (k === todayKey()) return ex.goal;
    const d = this.state.days[k];
    return d && d.goals[ex.id] ? d.goals[ex.id].goal : ex.goal;
  }
  removedOn(k: string) {
    const d = this.state.days[k];
    if (!d) return [];
    return Object.entries(d.goals)
      .filter(([id]) => !this.findEx(id) && this.totalFor(k, id) > 0)
      .map(([id, g]) => ({ id, ...g, name: g.name || "Removed exercise" }));
  }
  get loggedDayCount() { return Object.values(this.state.days).filter((d) => d.entries.length > 0).length; }

  /* Every exercise hit its goal on day k. Today is judged against the current exercises.
     A past day is judged against the exercises it had then (its goal snapshot), so adding an
     exercise later never breaks old days; exercises you've since deleted are left out. */
  dayComplete(k: string) {
    if (this.isRest(k)) return false;
    if (k === todayKey()) {
      return this.exercises.length > 0 && this.exercises.every((e) => this.totalFor(k, e.id) >= e.goal);
    }
    const d = this.state.days[k];
    if (!d || !d.entries.length) return false;
    let ids = Object.keys(d.goals).filter((id) => this.findEx(id));
    if (!ids.length) ids = Object.keys(d.goals);
    return ids.length > 0 && ids.every((id) => this.totalFor(k, id) >= d.goals[id].goal);
  }
  /* Days in a row with every goal done. Rest days are skipped (they don't break it or add to it).
     Today only counts once it's complete; an unfinished today doesn't break the streak yet. */
  get streak() {
    const t = todayKey();
    const keys = Object.keys(this.state.days);
    const earliest = keys.length ? keys.reduce((a, b) => (a < b ? a : b)) : t;
    let n = this.dayComplete(t) ? 1 : 0;
    let k = shiftKey(t, -1);
    for (let i = 0; i < 3660 && k >= earliest; i++, k = shiftKey(k, -1)) {
      if (this.isRest(k)) continue;
      if (!this.dayComplete(k)) break;
      n++;
    }
    return n;
  }

  /* ----- writes ----- */
  private snap(ex: Exercise): GoalSnap { return { goal: ex.goal, name: ex.name, color: ex.color, unit: ex.unit }; }
  private ensureDay(k: string) {
    if (!this.state.days[k]) {
      const goals: Record<string, GoalSnap> = {};
      for (const ex of this.state.settings.exercises) goals[ex.id] = this.snap(ex);
      this.state.days[k] = { kind: "day", date: k, rest: this.state.settings.restDays.includes(keyToDate(k).getDay()), goals, entries: [] };
    }
    return this.state.days[k];
  }

  addReps(exId: string, n: number, k: string) {
    n = Math.round(Number(n));
    const ex = this.findEx(exId);
    if (!ex || !(n > 0) || n > 9999) return null;
    const day = this.ensureDay(k);
    const goal = this.goalOn(k, ex);
    const before = this.totalFor(k, exId);
    if (k === todayKey() || !day.goals[exId]) day.goals[exId] = this.snap(ex);
    let t = Date.now();
    if (k !== todayKey()) { const d = keyToDate(k), now = new Date(); d.setHours(now.getHours(), now.getMinutes(), 0, 0); t = d.getTime(); }
    day.entries.push({ id: newId(), ex: exId, n, t });
    this.save();
    if (this.persisted === null) this.requestPersist();
    const total = before + n;
    const crossed = !day.rest && before < goal && total >= goal;
    const dayDone = crossed && this.dayComplete(k);
    const allDone = dayDone && this.exercises.length > 1;
    return { crossed, allDone, dayDone, streak: dayDone ? this.streak : 0, total, goal };
  }
  undoLast(exId: string, k: string) {
    const day = this.state.days[k];
    if (!day) return;
    for (let i = day.entries.length - 1; i >= 0; i--) {
      if (day.entries[i].ex === exId) { day.entries.splice(i, 1); this.save(); return; }
    }
  }
  deleteEntry(k: string, entryId: string) {
    const day = this.state.days[k];
    if (!day) return;
    const i = day.entries.findIndex((e) => e.id === entryId);
    if (i >= 0) { day.entries.splice(i, 1); this.save(); }
  }
  saveExercise(input: { id?: string; name: string; goal: number; unit: Unit; quick: string; color: Plate }) {
    const name = input.name.trim().slice(0, 40);
    const goal = clampGoal(input.goal);
    if (!name) return;
    if (input.id) {
      const ex = this.findEx(input.id);
      if (!ex) return;
      let quickText = input.quick;
      if (input.unit !== ex.unit && quickText.replace(/\s/g, "") === DEFAULT_QUICK[ex.unit].join(",")) quickText = "";
      Object.assign(ex, { name, goal, unit: input.unit, color: input.color, quick: parseQuick(quickText, input.unit) });
      const t = todayKey();
      if (this.state.days[t]) this.state.days[t].goals[ex.id] = this.snap(ex);
    } else {
      const ex: Exercise = { id: newId(), name, goal, unit: input.unit, color: input.color, quick: parseQuick(input.quick, input.unit) };
      this.state.settings.exercises.push(ex);
      /* keep today's snapshot in step, so today is judged the same way after midnight */
      const today = this.state.days[todayKey()];
      if (today) today.goals[ex.id] = this.snap(ex);
    }
    this.save();
  }
  deleteExercise(id: string) {
    this.state.settings.exercises = this.state.settings.exercises.filter((e) => e.id !== id);
    const t = todayKey(), today = this.state.days[t];
    if (today && !this.totalFor(t, id)) delete today.goals[id];
    this.save();
  }
  moveExercise(id: string, dir: -1 | 1) {
    const exs = this.state.settings.exercises;
    const i = exs.findIndex((e) => e.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= exs.length) return;
    [exs[i], exs[j]] = [exs[j], exs[i]];
    this.save();
  }
  toggleRestDay(d: number) {
    const s = new Set(this.state.settings.restDays);
    if (s.has(d)) s.delete(d); else s.add(d);
    this.state.settings.restDays = Array.from(s);
    const t = todayKey();
    if (this.state.days[t] && keyToDate(t).getDay() === d) this.state.days[t].rest = s.has(d);
    this.save();
  }
  nextColor(): Plate {
    const used = this.exercises.map((x) => x.color);
    return PLATES.find((p) => !used.includes(p)) || PLATES[this.exercises.length % PLATES.length];
  }

  /* ----- backup and restore ----- */
  backupFile() {
    const body = { app: "daily-reps", version: 1, exportedAt: new Date().toISOString(), settings: this.state.settings, days: this.state.days };
    const name = `daily-reps-backup-${todayKey()}.json`;
    return new File([JSON.stringify(body, null, 2)], name, { type: "application/json" });
  }
  parseBackup(text: string): ParsedBackup | null {
    try {
      const o = JSON.parse(text);
      if (!o || o.app !== "daily-reps") return null;
      const state = parseState(o);
      if (!state) return null;
      const dayCount = Object.values(state.days).filter((d) => d.entries.length > 0).length;
      return { state, exportedAt: typeof o.exportedAt === "string" ? o.exportedAt : null, dayCount };
    } catch { return null; }
  }
  restore(b: ParsedBackup) {
    this.state = b.state;
    this.save();
  }
}

export const store = new RepStore();
