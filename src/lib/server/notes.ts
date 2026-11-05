// Morning Notes: short observations from counting the dreamer's own log. No model call,
// no meanings, no diagnosis. Only the dreamer sees them.
import { getDb } from "./db";

export type NoteDream = {
  id: string;
  day: number;
  feeling: string | null;
  saga: string | null;
  themes: string[];
  things: string[]; // places, objects and people, lowercase
};

export type Note = { kind: "streak" | "again" | "gap" | "saga" | "quiet" | "milestone" | "recall"; text: string; saga?: string };

const NUMBER = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const ORDINAL = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth"];
const MILESTONES: Record<number, string> = { 10: "Ten", 25: "Twenty-five", 50: "Fifty", 100: "A hundred", 200: "Two hundred", 365: "Three hundred and sixty-five" };
const THEME_WORD: Record<string, string> = {
  water: "water", flight: "flying", falling: "falling", chase: "chase", home: "home", animals: "animal",
  people: "crowd", school: "school", city: "city", nature: "nature", fantasy: "fantasy", night: "night-time",
};

const num = (n: number) => NUMBER[n] ?? String(n);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Notes about `focus`, counted from dreams up to and including its day. Strongest first.
export function notesFor(all: NoteDream[], focusId: string): Note[] {
  const focus = all.find((d) => d.id === focusId);
  if (!focus) return [];
  const log = all.filter((d) => d.day <= focus.day);
  const onDay = (day: number) => log.filter((d) => d.day === day);
  const notes: Note[] = [];

  for (const theme of focus.themes) {
    let run = 0;
    while (onDay(focus.day - run).some((d) => d.themes.includes(theme))) run++;
    if (run >= 3) notes.push({ kind: "streak", text: `${cap(THEME_WORD[theme] ?? theme)}, ${num(run)} nights running.` });
  }

  for (const thing of focus.things) {
    const times = log.filter((d) => d.day > focus.day - 30 && d.things.includes(thing)).length;
    if (times >= 3) notes.push({ kind: "again", text: `${cap(thing)} again. That's the ${ORDINAL[times] ?? `${times}th`} time this month.` });
  }

  for (const theme of focus.themes) {
    const before = log.filter((d) => d.id !== focus.id && d.day < focus.day && d.themes.includes(theme)).map((d) => d.day);
    const gap = before.length ? focus.day - Math.max(...before) : 0;
    if (gap >= 14) notes.push({ kind: "gap", text: `Your first ${THEME_WORD[theme] ?? theme} dream in ${num(Math.floor(gap / 7))} weeks.` });
  }

  if (focus.saga) {
    const length = log.filter((d) => d.saga === focus.saga).length;
    if (length >= 2) notes.push({ kind: "saga", text: `This one belongs with ${focus.saga}. That saga is ${num(length)} dreams long now.`, saga: focus.saga });
  }

  const scared = log.filter((d) => d.feeling === "scared" && d.id !== focus.id).map((d) => d.day);
  const lastScared = scared.length ? Math.max(...scared) : null;
  const recentCount = log.filter((d) => d.day > focus.day - 7).length;
  if (focus.feeling !== "scared" && lastScared != null && focus.day - lastScared >= 7 && recentCount >= 3) {
    notes.push({ kind: "quiet", text: `No nightmares for ${num(focus.day - lastScared)} nights.` });
  }

  const painted = log.length;
  if (MILESTONES[painted] && log[log.length - 1]?.id === focus.id) notes.push({ kind: "milestone", text: `${MILESTONES[painted]} dreams painted.` });

  const thisWeek = log.filter((d) => d.day > focus.day - 7).length;
  const lastWeek = log.filter((d) => d.day <= focus.day - 7 && d.day > focus.day - 14).length;
  if (lastWeek >= 1 && thisWeek > lastWeek) notes.push({ kind: "recall", text: `You remembered ${thisWeek} dreams this week, up from ${lastWeek}.` });

  return notes;
}

// The dreamer's painted log, oldest first, in the shape notesFor counts.
export function noteLog(userId: string): NoteDream[] {
  const rows = getDb()
    .prepare("SELECT id, day, created_at, feeling, suggested_feeling, saga, tags_json FROM dreams WHERE user_id = ? AND tags_json IS NOT NULL ORDER BY created_at")
    .all(userId) as { id: string; day: number; feeling: string | null; suggested_feeling: string | null; saga: string | null; tags_json: string }[];
  return rows.map((r) => {
    const t = JSON.parse(r.tags_json) as { themes?: string[]; places?: string[]; objects?: string[]; people?: string[] };
    return {
      id: r.id,
      day: r.day,
      feeling: r.feeling ?? r.suggested_feeling,
      saga: r.saga,
      themes: t.themes ?? [],
      things: [...(t.places ?? []), ...(t.objects ?? []), ...(t.people ?? [])],
    };
  });
}
