import { useEffect, useReducer, useRef, useState, useSyncExternalStore, type ChangeEvent, type CSSProperties, type ReactNode } from "react"
import { motion } from "motion/react"
import {
  App as KApp, Page, Navbar, Link, Tabbar, TabbarLink, Sheet, List, ListItem, ListInput, ListButton,
  BlockTitle, BlockFooter, Block, Button, Segmented, SegmentedButton, Toggle, Dialog, DialogButton, Notification,
} from "konsta/react"
import { NumberTicker } from "@/components/magicui/number-ticker"
import { AnimatedCircularProgressBar } from "@/components/magicui/animated-circular-progress-bar"
import { BlurFade } from "@/components/magicui/blur-fade"
import { Confetti, type ConfettiRef } from "@/components/magicui/confetti"
import {
  store, todayKey, shiftKey, dayLabel, longDate, fmtTime, unitWord, keyToDate, nextResetTime,
  PLATES, PLATE_NAMES, WEEK, WD_LONG, MAX_BACK_DAYS, DEFAULT_QUICK, type Exercise, type Plate, type Unit, type ParsedBackup,
} from "@/lib/store"

type Tab = "log" | "history" | "settings"

const col = (c: Plate) => `var(--ex-${c})`
const ink = (c: Plate) => `var(--ex-${c}-ink)`
const tint = (c: Plate, pct = 16) => `color-mix(in srgb, var(--ex-${c}) ${pct}%, transparent)`
const reducedMotion = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches } catch { return false } }

/* ---------- icons ---------- */
const Svg = ({ children, className = "size-7" }: { children: ReactNode; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">{children}</svg>
)
const IconLog = () => <Svg><path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" /></Svg>
const IconHistory = () => <Svg><rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></Svg>
const IconSettings = () => <Svg><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></Svg>
const IconPlus = () => <Svg className="size-6"><path d="M12 5v14M5 12h14" /></Svg>
const IconChevron = ({ dir }: { dir: "left" | "right" }) => <Svg className="size-5"><path d={dir === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} /></Svg>
const Dot = ({ c }: { c: Plate }) => <span className="block size-3 rounded-full" style={{ background: col(c) }} aria-hidden="true" />

/* ---------- app ---------- */
export default function DailyReps() {
  useSyncExternalStore(store.subscribe, store.getVersion)
  const [tab, setTabState] = useState<Tab>(() => {
    try { const v = sessionStorage.getItem("daily-reps-tab"); if (v === "history" || v === "settings") return v } catch { /* ignore */ }
    return "log"
  })
  const setTab = (t: Tab) => { setTabState(t); try { sessionStorage.setItem("daily-reps-tab", t) } catch { /* ignore */ } }
  const [selectedKey, setSelectedKey] = useState(todayKey())
  const [, force] = useReducer((x: number) => x + 1, 0)
  const [amountFor, setAmountFor] = useState<string | null>(null)
  const [setsFor, setSetsFor] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ id?: string } | null>(null)
  const [notice, setNotice] = useState<{ title: string; text: string } | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const confettiRef = useRef<ConfettiRef>(null)
  const cardEls = useRef(new Map<string, HTMLElement>())

  /* midnight rollover + retry sync when the phone wakes */
  const lastKey = useRef(todayKey())
  useEffect(() => {
    const tick = () => {
      const k = todayKey()
      if (k !== lastKey.current) {
        const prev = lastKey.current
        lastKey.current = k
        setSelectedKey((s) => (s === prev ? k : s))
        force()
      }
    }
    const id = setInterval(tick, 30000)
    const vis = () => { if (!document.hidden) tick() }
    document.addEventListener("visibilitychange", vis)
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", vis) }
  }, [])

  function celebrate(ex: Exercise, r: { allDone: boolean; dayDone: boolean; streak: number; total: number; goal: number }) {
    const when = selectedKey === todayKey() ? "today" : dayLabel(selectedKey).toLowerCase()
    const streakText = r.dayDone && r.streak > 0 ? ` ${r.streak}-day streak.` : ""
    setNotice(r.allDone
      ? { title: "All goals done", text: `Every exercise finished for ${when}.${streakText}` }
      : { title: "Goal hit", text: `${ex.name} · ${r.total} / ${r.goal} ${unitWord(ex.unit, r.goal)}${streakText ? ` ·${streakText}` : ""}` })
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(null), 3500)
    if (reducedMotion()) return
    const rect = cardEls.current.get(ex.id)?.getBoundingClientRect()
    const origin = rect
      ? { x: (rect.left + 72) / window.innerWidth, y: (rect.top + 72) / window.innerHeight }
      : { x: 0.5, y: 0.35 }
    const cs = getComputedStyle(document.documentElement)
    const colors = PLATES.slice(0, 4).map((p) => cs.getPropertyValue(`--ex-${p}`).trim() || "#888888")
    confettiRef.current?.fire({ particleCount: 140, spread: 100, startVelocity: 38, ticks: 220, origin, colors })
    if (r.allDone) {
      setTimeout(() => {
        confettiRef.current?.fire({ particleCount: 90, angle: 60, spread: 70, origin: { x: 0, y: 0.7 }, colors })
        confettiRef.current?.fire({ particleCount: 90, angle: 120, spread: 70, origin: { x: 1, y: 0.7 }, colors })
      }, 250)
    }
  }

  function logReps(exId: string, n: number) {
    const r = store.addReps(exId, n, selectedKey)
    const ex = store.findEx(exId)
    if (r && r.crossed && ex) celebrate(ex, r)
    return !!r
  }

  return (
    <KApp theme="ios" safeAreas>
      {tab === "log" && (
        <LogPage
          k={selectedKey}
          setK={setSelectedKey}
          onAdd={logReps}
          onOther={setAmountFor}
          onSets={setSetsFor}
          onEdit={(id) => setEditing({ id })}
          onNew={() => setEditing({})}
          cardEls={cardEls.current}
        />
      )}
      {tab === "history" && <HistoryPage onOpenDay={(k) => { setSelectedKey(k); setTab("log") }} />}
      {tab === "settings" && <SettingsPage />}

      <Tabbar labels icons className="left-0 bottom-0 fixed">
        <TabbarLink active={tab === "log"} onClick={() => setTab("log")} icon={<IconLog />} label="Log" />
        <TabbarLink active={tab === "history"} onClick={() => setTab("history")} icon={<IconHistory />} label="History" />
        <TabbarLink active={tab === "settings"} onClick={() => setTab("settings")} icon={<IconSettings />} label="Settings" />
      </Tabbar>

      <AmountSheet exId={amountFor} k={selectedKey} onClose={() => setAmountFor(null)} onAdd={logReps} />
      <SetsSheet exId={setsFor} k={selectedKey} onClose={() => setSetsFor(null)} />
      <ExerciseSheet editing={editing} onClose={() => setEditing(null)} />

      <Notification
        opened={!!notice}
        icon={<span className="grid size-5 place-items-center rounded-[6px] text-white" style={{ background: col("red") }}><Svg className="size-3.5"><path d="M5 12l4 4 10-10" /></Svg></span>}
        title="Daily Reps"
        titleRightText="now"
        subtitle={notice?.title}
        text={notice?.text}
        onClose={() => setNotice(null)}
      />
      <Confetti
        ref={confettiRef}
        manualstart
        globalOptions={{ resize: true, useWorker: false }}
        className="pointer-events-none fixed inset-0 z-[60] size-full"
        aria-hidden="true"
      />
    </KApp>
  )
}

/* ---------- Log ---------- */
function LogPage(props: {
  k: string; setK: (k: string) => void
  onAdd: (id: string, n: number) => boolean; onOther: (id: string) => void; onSets: (id: string) => void
  onEdit: (id: string) => void; onNew: () => void; cardEls: Map<string, HTMLElement>
}) {
  const { k, setK } = props
  const t = todayKey()
  const rest = store.isRest(k)
  const exs = store.exercises
  const canBack = k > shiftKey(t, -MAX_BACK_DAYS)
  const canFwd = k < t
  return (
    <Page>
      <Navbar
        large
        transparent
        centerTitle={false}
        className="mx-auto max-w-[600px]"
        title={dayLabel(k)}
        right={<Link navbar iconOnly onClick={props.onNew} aria-label="Add exercise"><IconPlus /></Link>}
      />
      <div className="mx-auto w-full max-w-[600px]">
      <div className="mx-4 mt-2 flex items-center gap-3">
        <button type="button" aria-label="Previous day" disabled={!canBack} onClick={() => setK(shiftKey(k, -1))}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-fill-3 text-primary active:opacity-60 disabled:opacity-30">
          <IconChevron dir="left" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="text-[15px] font-semibold">{longDate(k)}</div>
          <div className="text-[13px] text-label-2">{rest ? "Rest day · no goal" : k === t ? `Resets ${fmtTime(nextResetTime())} · midnight in Texas` : "Past day"}</div>
        </div>
        <button type="button" aria-label="Next day" disabled={!canFwd} onClick={() => setK(shiftKey(k, 1))}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-fill-3 text-primary active:opacity-60 disabled:opacity-30">
          <IconChevron dir="right" />
        </button>
      </div>

      {k === t && !!exs.length && <StreakPill />}

      {k !== t && (
        <div className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-2xl px-4 py-2.5 text-[15px]" style={{ background: tint("yellow", 22) }}>
          <span>Adding reps to <b>{k === shiftKey(t, -1) ? "yesterday" : longDate(k)}</b></span>
          <button type="button" className="font-semibold text-primary" onClick={() => setK(t)}>Back to today</button>
        </div>
      )}

      {exs.map((ex, i) => (
        <ExerciseCard key={ex.id} ex={ex} k={k} index={i} {...props} />
      ))}

      {!exs.length && (
        <Block className="text-center">
          <p className="text-label-2">Add an exercise and set your daily goal.</p>
          <Button large rounded className="mt-4" onClick={props.onNew}>Add exercise</Button>
        </Block>
      )}
      {!!exs.length && (
        <div className="mx-4 mt-4">
          <button type="button" onClick={props.onNew}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-[22px] border-2 border-dashed border-black/10 text-[17px] font-medium text-label-2 active:opacity-60 dark:border-white/15">
            <IconPlus /> Add exercise
          </button>
        </div>
      )}
      </div>
      <div className="h-36" />
    </Page>
  )
}

const IconFlame = () => (
  <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
    <path d="M12 2c.6 3.2-1.1 5.1-2.7 6.9C7.8 10.6 6.5 12.1 6.5 14.5a5.5 5.5 0 0 0 11 0c0-2-.9-3.6-1.9-4.8-.2 1.3-.9 2.3-2 2.8.5-3.6-.4-7.5-1.6-10.5Z" />
  </svg>
)

function StreakPill() {
  const t = todayKey()
  const n = store.streak
  const todayDone = store.dayComplete(t)
  const rest = store.isRest(t)
  const hint = rest
    ? "Rest day · streak is safe"
    : todayDone
      ? "Today's done"
      : n > 0 ? `Finish every goal today to make it ${n + 1}` : "Finish every goal today to start one"
  return (
    <div className="mx-4 mt-3 flex items-center gap-3 rounded-2xl px-4 py-2.5" role="status"
      style={{ background: "color-mix(in srgb, var(--streak) 16%, transparent)" }}>
      <span className="grid size-9 shrink-0 place-items-center rounded-full text-white" style={{ background: n > 0 ? "var(--streak)" : "var(--fill-3)" }}>
        <IconFlame />
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="tabular text-[17px] font-semibold" style={{ color: n > 0 ? "var(--streak-ink)" : undefined }}>
          {n > 0 ? `${n}-day streak` : "No streak yet"}
        </div>
        <div className="text-[13px] text-label-2">{hint}</div>
      </div>
      {todayDone && (
        <span className="grid size-7 shrink-0 place-items-center rounded-full text-white" style={{ background: col("green") }} aria-hidden="true">
          <Svg className="size-4"><path d="M5 12l4 4 10-10" /></Svg>
        </span>
      )}
    </div>
  )
}

function ExerciseCard({ ex, k, index, onAdd, onOther, onSets, onEdit, cardEls }: {
  ex: Exercise; k: string; index: number
  onAdd: (id: string, n: number) => boolean; onOther: (id: string) => void; onSets: (id: string) => void
  onEdit: (id: string) => void; cardEls: Map<string, HTMLElement>
}) {
  const total = store.totalFor(k, ex.id)
  const goal = store.goalOn(k, ex)
  const rest = store.isRest(k)
  const sets = store.entriesFor(k, ex.id).length
  const sec = ex.unit === "sec"
  const done = !rest && total >= goal
  const status = rest
    ? "Rest day"
    : done
      ? total > goal ? `+${total - goal}${sec ? " sec" : ""} over your goal` : "Goal reached"
      : `${goal - total}${sec ? " sec" : ""} to go`
  return (
    <BlurFade delay={index * 0.06} offset={10} direction="up">
      <section
        ref={(el) => { if (el) cardEls.set(ex.id, el); else cardEls.delete(ex.id) }}
        className="bg-card mx-4 mt-4 rounded-[28px] p-4 shadow-[0_1px_3px_rgb(0_0_0/0.06)]"
        aria-label={ex.name}
      >
        <div className="flex items-center gap-4">
          <AnimatedCircularProgressBar
            className="size-[116px] shrink-0"
            value={rest ? 0 : total}
            max={goal}
            strokeWidth={11}
            gaugePrimaryColor={col(ex.color)}
            gaugeSecondaryColor={tint(ex.color, 18)}
          >
            <NumberTicker value={total} className="text-[30px] leading-none font-bold tracking-tight text-current dark:text-current" />
            <span className="tabular mt-1 text-[12px] text-label-2">{rest ? unitWord(ex.unit, total) : `of ${goal}${sec ? "s" : ""}`}</span>
          </AnimatedCircularProgressBar>
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <h2 className="m-0 min-w-0 flex-1 text-[21px] leading-tight font-semibold break-words">{ex.name}</h2>
              <button type="button" className="shrink-0 text-[16px] text-primary active:opacity-60" onClick={() => onEdit(ex.id)}>Edit</button>
            </div>
            {sec && <div className="mt-0.5 text-[13px] text-label-2">Timed · seconds</div>}
            <div className="mt-2">
              {done ? (
                <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[14px] font-semibold" style={{ background: tint("green", 18), color: ink("green") }}>
                  <Svg className="size-4"><path d="M5 12l4 4 10-10" /></Svg>{status}
                </span>
              ) : (
                <span className="tabular text-[15px] text-label-2">{status}</span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-2" style={{ gridTemplateColumns: `repeat(${ex.quick.length}, minmax(0, 1fr))` }}>
          {ex.quick.map((n) => (
            <motion.button
              key={n}
              type="button"
              whileTap={{ scale: 0.92 }}
              onClick={() => onAdd(ex.id, n)}
              aria-label={`Add ${n} ${unitWord(ex.unit, n)}`}
              className="tabular h-14 rounded-2xl text-[20px] font-semibold"
              style={{ background: tint(ex.color, 15), color: ink(ex.color) } as CSSProperties}
            >
              +{n}{sec ? "s" : ""}
            </motion.button>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2 text-[15px]">
          <button type="button" className="bg-fill-3 h-10 rounded-full px-4 font-medium active:opacity-60" onClick={() => onOther(ex.id)}>Other</button>
          <button type="button" className="bg-fill-3 h-10 rounded-full px-4 font-medium active:opacity-60 disabled:opacity-35" disabled={!sets} onClick={() => store.undoLast(ex.id, k)}>Undo</button>
          <button type="button" className="ml-auto h-10 px-1 font-medium text-primary active:opacity-60" onClick={() => onSets(ex.id)}>
            {sets} {sets === 1 ? "set" : "sets"} ›
          </button>
        </div>
      </section>
    </BlurFade>
  )
}

/* ---------- sheets ---------- */
function SheetHeader({ title, onCancel, onDone, doneLabel = "Done" }: { title: string; onCancel: () => void; onDone?: () => void; doneLabel?: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center px-4 pt-4 pb-2">
      <button type="button" className="justify-self-start text-[17px] text-primary active:opacity-60" onClick={onCancel}>Cancel</button>
      <h2 className="m-0 max-w-[60vw] truncate text-[17px] font-semibold">{title}</h2>
      {onDone ? <button type="button" className="justify-self-end text-[17px] font-semibold text-primary active:opacity-60" onClick={onDone}>{doneLabel}</button> : <span />}
    </div>
  )
}

function AmountSheet({ exId, k, onClose, onAdd }: { exId: string | null; k: string; onClose: () => void; onAdd: (id: string, n: number) => boolean }) {
  const ex = exId ? store.findEx(exId) : undefined
  const [value, setValue] = useState("")
  const [error, setError] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (exId) { setValue(""); setError(""); setTimeout(() => inputRef.current?.focus(), 350) } }, [exId])
  const submit = () => {
    if (!exId) return
    const n = Math.round(Number(value))
    if (!(n >= 1 && n <= 9999)) { setError("Enter a number from 1 to 9999."); return }
    onAdd(exId, n)
    onClose()
  }
  const unit: Unit = ex?.unit || "reps"
  return (
    <Sheet opened={!!exId} onBackdropClick={onClose} className="w-full pb-safe">
      <SheetHeader title={ex ? `Add to ${ex.name}` : "Add"} onCancel={onClose} />
      <form className="px-6 pb-6" onSubmit={(e) => { e.preventDefault(); submit() }}>
        <label htmlFor="amount" className="sr-only">Amount</label>
        <input
          id="amount"
          ref={inputRef}
          type="number"
          inputMode="numeric"
          pattern="[0-9]*"
          min={1}
          max={9999}
          placeholder="0"
          value={value}
          onChange={(e) => { setValue(e.target.value); setError("") }}
          className="tabular w-full bg-transparent text-center text-[64px] leading-tight font-bold outline-none placeholder:text-black/15 dark:placeholder:text-white/20"
          style={{ color: ex ? col(ex.color) : undefined }}
        />
        <p className="m-0 text-center text-[15px] text-label-2">{unit === "sec" ? "seconds" : "reps"}{k !== todayKey() ? ` · ${dayLabel(k)}` : ""}</p>
        {error && <p className="m-0 mt-2 text-center text-[14px]" style={{ color: ink("red") }}>{error}</p>}
        <Button large rounded className="mt-5" component="button" type="submit">Add</Button>
      </form>
    </Sheet>
  )
}

function SetsSheet({ exId, k, onClose }: { exId: string | null; k: string; onClose: () => void }) {
  const ex = exId ? store.findEx(exId) : undefined
  const entries = exId ? store.entriesFor(k, exId).slice().reverse() : []
  const [confirm, setConfirm] = useState<string | null>(null)
  const sec = ex?.unit === "sec"
  return (
    <>
      <Sheet opened={!!exId} onBackdropClick={onClose} className="w-full pb-safe">
        <SheetHeader title={ex ? `${ex.name} · ${dayLabel(k)}` : "Sets"} onCancel={onClose} onDone={onClose} />
        <div className="max-h-[60vh] overflow-auto pb-4">
          <List strong inset className="!my-2">
            {!entries.length && <ListItem title="Nothing logged yet" />}
            {entries.map((e) => (
              <ListItem
                key={e.id}
                title={<span className="tabular text-[17px] font-semibold">+{e.n}{sec ? " sec" : ` ${unitWord("reps", e.n)}`}</span>}
                after={
                  <span className="flex items-center gap-3">
                    <span className="tabular text-label-2">{fmtTime(e.t)}</span>
                    <button type="button" className="text-[15px] font-medium active:opacity-60" style={{ color: ink("red") }} onClick={() => setConfirm(e.id)}
                      aria-label={`Delete +${e.n} at ${fmtTime(e.t)}`}>Delete</button>
                  </span>
                }
              />
            ))}
          </List>
        </div>
      </Sheet>
      <Dialog
        opened={!!confirm}
        onBackdropClick={() => setConfirm(null)}
        title="Delete this set?"
        content="It comes off this day's total."
        buttons={
          <>
            <DialogButton onClick={() => setConfirm(null)}>Cancel</DialogButton>
            <DialogButton strong onClick={() => { if (confirm) store.deleteEntry(k, confirm); setConfirm(null) }}>Delete</DialogButton>
          </>
        }
      />
    </>
  )
}

function ExerciseSheet({ editing, onClose }: { editing: { id?: string } | null; onClose: () => void }) {
  const ex = editing?.id ? store.findEx(editing.id) : undefined
  const isNew = !!editing && !editing.id
  const [name, setName] = useState("")
  const [goal, setGoal] = useState("")
  const [unit, setUnit] = useState<Unit>("reps")
  const [quick, setQuick] = useState("")
  const [color, setColor] = useState<Plate>("red")
  const [errors, setErrors] = useState<{ name?: string; goal?: string }>({})
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!editing) return
    setErrors({})
    if (ex) { setName(ex.name); setGoal(String(ex.goal)); setUnit(ex.unit); setQuick(ex.quick.join(", ")); setColor(ex.color) }
    else { setName(""); setGoal("50"); setUnit("reps"); setQuick(DEFAULT_QUICK.reps.join(", ")); setColor(store.nextColor()) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  const changeUnit = (u: Unit) => {
    if (u === unit) return
    if (quick.replace(/\s/g, "") === DEFAULT_QUICK[unit].join(",")) setQuick(DEFAULT_QUICK[u].join(", "))
    if (isNew && goal === (unit === "reps" ? "50" : "180")) setGoal(u === "reps" ? "50" : "180")
    setUnit(u)
  }
  const save = () => {
    const g = Math.round(Number(goal))
    const errs: { name?: string; goal?: string } = {}
    if (!name.trim()) errs.name = "Give it a name."
    if (!(g >= 1 && g <= 99999)) errs.goal = "Enter a goal of at least 1."
    setErrors(errs)
    if (errs.name || errs.goal) return
    store.saveExercise({ id: ex?.id, name, goal: g, unit, quick, color })
    onClose()
  }

  return (
    <>
      <Sheet opened={!!editing} onBackdropClick={onClose} className="w-full pb-safe">
        <SheetHeader title={isNew ? "New exercise" : "Edit exercise"} onCancel={onClose} onDone={save} doneLabel={isNew ? "Add" : "Save"} />
        <div className="max-h-[78vh] overflow-auto pb-6">
          <List strong inset className="!my-2">
            <ListInput label="Name" type="text" placeholder="Squats" value={name} maxLength={40} autoComplete="off"
              onChange={(e: any) => { setName(e.target.value); setErrors((x) => ({ ...x, name: undefined })) }} error={errors.name} />
            <ListInput label={unit === "sec" ? "Daily goal (seconds)" : "Daily goal (reps)"} type="number" inputMode="numeric" pattern="[0-9]*" value={goal}
              onChange={(e: any) => { setGoal(e.target.value); setErrors((x) => ({ ...x, goal: undefined })) }} error={errors.goal} />
            <ListInput label="Quick buttons" type="text" placeholder="5, 10, 20" value={quick} autoComplete="off"
              onChange={(e: any) => setQuick(e.target.value)} info="Up to 4 amounts, separated by commas." />
          </List>

          <h3 className="m-0 mx-4 mt-6 px-4 text-[13px] font-medium tracking-wide text-label-2 uppercase">Count in</h3>
          <div className="mx-4 mt-2">
            <Segmented strong rounded>
              <SegmentedButton strong rounded active={unit === "reps"} onClick={() => changeUnit("reps")}>Reps</SegmentedButton>
              <SegmentedButton strong rounded active={unit === "sec"} onClick={() => changeUnit("sec")}>Seconds</SegmentedButton>
            </Segmented>
          </div>

          <h3 className="m-0 mx-4 mt-6 px-4 text-[13px] font-medium tracking-wide text-label-2 uppercase">Colour</h3>
          <div className="mx-4 mt-3 px-4">
            <div className="flex gap-4" role="radiogroup" aria-label="Colour">
              {PLATES.map((p) => (
                <button key={p} type="button" role="radio" aria-checked={color === p} aria-label={PLATE_NAMES[p]} onClick={() => setColor(p)}
                  className="size-10 rounded-full transition-transform active:scale-90"
                  style={{ background: col(p), boxShadow: color === p ? `0 0 0 3px var(--card-bg), 0 0 0 5px ${col(p)}` : "none" }} />
              ))}
            </div>
          </div>

          {!isNew && ex && (
            <List strong inset className="!mt-6">
              <ListButton onClick={() => setConfirmDelete(true)} colors={{ textIos: "text-[var(--ex-red-ink)]" }}>Delete exercise</ListButton>
            </List>
          )}
        </div>
      </Sheet>
      <Dialog
        opened={confirmDelete}
        onBackdropClick={() => setConfirmDelete(false)}
        title={`Delete ${ex?.name || "exercise"}?`}
        content="It disappears from the Log tab. Days you already logged stay in History."
        buttons={
          <>
            <DialogButton onClick={() => setConfirmDelete(false)}>Cancel</DialogButton>
            <DialogButton strong onClick={() => { if (ex) store.deleteExercise(ex.id); setConfirmDelete(false); onClose() }}>Delete</DialogButton>
          </>
        }
      />
    </>
  )
}

/* ---------- History ---------- */
function HistoryPage({ onOpenDay }: { onOpenDay: (k: string) => void }) {
  const t = todayKey()
  const days = Array.from({ length: 30 }, (_, i) => shiftKey(t, -i))
  return (
    <Page>
      <Navbar large transparent centerTitle={false} className="mx-auto max-w-[600px]" title="History" />
      <div className="mx-auto w-full max-w-[600px]">
      {!!store.exercises.length && <StreakPill />}
      {days.map((k, i) => {
        const rest = store.isRest(k)
        const complete = store.dayComplete(k)
        const rows = [
          ...store.exercises.map((ex) => ({ id: ex.id, name: ex.name, color: ex.color, unit: ex.unit, goal: store.goalOn(k, ex), total: store.totalFor(k, ex.id) })),
          ...store.removedOn(k).map((g) => ({ id: g.id, name: g.name, color: g.color, unit: g.unit, goal: g.goal, total: store.totalFor(k, g.id) })),
        ]
        const any = rows.some((r) => r.total > 0)
        return (
          <section key={k} aria-label={dayLabel(k)}>
            <div className="mx-4 mt-6 mb-1.5 flex items-center gap-2 px-4">
              <h3 className="m-0 flex-1 text-[13px] font-medium tracking-wide text-label-2 uppercase">{dayLabel(k)}{i > 1 ? "" : ` · ${keyToDate(k).toLocaleDateString([], { month: "short", day: "numeric" })}`}</h3>
              {rest && <span className="rounded-full px-2 py-0.5 text-[12px] font-semibold" style={{ background: tint("blue", 16), color: ink("blue") }}>Rest day</span>}
              {complete && (
                <span className="inline-flex items-center gap-0.5 rounded-full py-0.5 pr-2 pl-1 text-[12px] font-semibold"
                  style={{ background: "color-mix(in srgb, var(--streak) 18%, transparent)", color: "var(--streak-ink)" }}>
                  <span className="[&>svg]:size-3.5"><IconFlame /></span>All done
                </span>
              )}
              <button type="button" className="text-[15px] text-primary active:opacity-60" onClick={() => onOpenDay(k)} aria-label={`Edit ${dayLabel(k)}`}>Edit</button>
            </div>
            <List strong inset className="!my-0">
              {!any ? (
                <ListItem title={<span className="text-label-2">{i === 0 ? "Nothing logged yet" : "Nothing logged"}</span>} />
              ) : (
                rows.map((r) => {
                  const hit = !rest && r.total >= r.goal
                  const pct = rest ? (r.total > 0 ? 100 : 0) : Math.min(100, (r.total / r.goal) * 100)
                  const sfx = r.unit === "sec" ? " sec" : ""
                  return (
                    <ListItem
                      key={r.id}
                      media={<Dot c={r.color} />}
                      title={r.name}
                      after={
                        <span className="tabular font-medium" style={{ color: hit ? ink("green") : undefined }}>
                          {hit ? "✓ " : ""}{rest ? `${r.total}${sfx}` : `${r.total} / ${r.goal}${sfx}`}
                        </span>
                      }
                      text={
                        <span className="bg-fill-3 mt-1.5 block h-1.5 w-full overflow-hidden rounded-full">
                          <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: col(r.color) }} />
                        </span>
                      }
                    />
                  )
                })
              )}
            </List>
          </section>
        )
      })}
      </div>
      <div className="h-36" />
    </Page>
  )
}

/* ---------- Settings ---------- */
function SettingsPage() {
  const rest = store.state.settings.restDays
  const exs = store.exercises
  return (
    <Page>
      <Navbar large transparent centerTitle={false} className="mx-auto max-w-[600px]" title="Settings" />
      <div className="mx-auto w-full max-w-[600px]">
      <BlockTitle>Rest days</BlockTitle>
      <List strong inset>
        {WEEK.map((d) => (
          <ListItem key={d} title={WD_LONG[d]} after={<Toggle checked={rest.includes(d)} onChange={() => store.toggleRestDay(d)} aria-label={`${WD_LONG[d]} is a rest day`} />} />
        ))}
      </List>
      <BlockFooter>No goal on these days. You can still log if you train anyway.</BlockFooter>

      <BlockTitle>Exercise order</BlockTitle>
      <List strong inset>
        {!exs.length && <ListItem title={<span className="text-label-2">No exercises yet</span>} />}
        {exs.map((ex, i) => (
          <ListItem
            key={ex.id}
            media={<Dot c={ex.color} />}
            title={ex.name}
            after={
              <span className="flex gap-2">
                <button type="button" aria-label={`Move ${ex.name} up`} disabled={i === 0} onClick={() => store.moveExercise(ex.id, -1)}
                  className="bg-fill-3 grid size-9 place-items-center rounded-full text-primary disabled:opacity-30">
                  <Svg className="size-4"><path d="M12 19V5M6 11l6-6 6 6" /></Svg>
                </button>
                <button type="button" aria-label={`Move ${ex.name} down`} disabled={i === exs.length - 1} onClick={() => store.moveExercise(ex.id, 1)}
                  className="bg-fill-3 grid size-9 place-items-center rounded-full text-primary disabled:opacity-30">
                  <Svg className="size-4"><path d="M12 5v14M6 13l6 6 6-6" /></Svg>
                </button>
              </span>
            }
          />
        ))}
      </List>
      <BlockFooter>The top one shows first on the Log tab.</BlockFooter>

      <DataSection />
      <p className="m-0 mt-6 text-center text-[13px] text-label-2">
        Version {new Date(__BUILD_TIME__).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
      </p>
      </div>
      <div className="h-36" />
    </Page>
  )
}

function DataSection() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<ParsedBackup | null>(null)
  const [message, setMessage] = useState<{ text: string; bad?: boolean } | null>(null)

  async function backUp() {
    setMessage(null)
    const file = store.backupFile()
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "Daily Reps backup" })
        setMessage({ text: "Backup ready. Save it to Files or iCloud Drive." })
        return
      }
    } catch (e: any) {
      if (e && e.name === "AbortError") return
    }
    const url = URL.createObjectURL(file)
    const a = document.createElement("a")
    a.href = url
    a.download = file.name
    document.body.append(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
    setMessage({ text: `Saved ${file.name}.` })
  }

  async function pickFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files && e.target.files[0]
    e.target.value = ""
    if (!f) return
    const parsed = store.parseBackup(await f.text())
    if (!parsed) { setMessage({ text: "That file isn't a Daily Reps backup. Pick the .json file you saved from Back up.", bad: true }); return }
    setPending(parsed)
  }

  const exported = pending?.exportedAt ? new Date(pending.exportedAt).toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" }) : null
  return (
    <>
      <BlockTitle>Your data</BlockTitle>
      <List strong inset>
        <ListItem title="Saved on" after={store.storageOk ? "This iPhone only" : "Not saving"} />
        <ListItem title="Days logged" after={<span className="tabular">{store.loggedDayCount}</span>} />
        <ListButton onClick={backUp}>Back up</ListButton>
        <ListButton onClick={() => fileRef.current?.click()}>Restore from backup</ListButton>
      </List>
      <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={pickFile} aria-hidden="true" tabIndex={-1} />
      {message && (
        <p className="m-0 mx-4 px-4 text-[14px]" role="status" style={{ color: message.bad ? ink("red") : ink("green") }}>{message.text}</p>
      )}
      <BlockFooter>
        {store.storageOk
          ? "Nothing leaves your phone. Deleting the app from your Home Screen erases its data, so back up now and then."
          : "This browser is blocking storage, so reps won't be kept. Turn off Private Browsing and open the app again."}
      </BlockFooter>
      <Dialog
        opened={!!pending}
        onBackdropClick={() => setPending(null)}
        title="Replace your data?"
        content={`This backup${exported ? ` from ${exported}` : ""} has ${pending?.dayCount ?? 0} logged ${pending?.dayCount === 1 ? "day" : "days"}. It replaces everything on this phone.`}
        buttons={
          <>
            <DialogButton onClick={() => setPending(null)}>Cancel</DialogButton>
            <DialogButton strong onClick={() => { if (pending) store.restore(pending); setPending(null); setMessage({ text: "Backup restored." }) }}>Replace</DialogButton>
          </>
        }
      />
    </>
  )
}
