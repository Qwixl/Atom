export interface DemoCalendarEvent {
  uid: string;
  summary: string;
  start: string;
  end: string;
}

export interface DemoSlotOption {
  id: string;
  label: string;
  description: string;
  start: string;
  end: string;
  recommended?: boolean;
}

function resolveSlotTime(
  weekday: number,
  hour: number,
  minute: number,
  durationMinutes: number,
): DemoSlotOption {
  const start = new Date();
  const dayDelta = (weekday - start.getDay() + 7) % 7 || 7;
  start.setDate(start.getDate() + dayDelta);
  start.setHours(hour, minute, 0, 0);
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  const label = start.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return {
    id: `slot-${start.toISOString()}`,
    label,
    start: start.toISOString(),
    end: end.toISOString(),
    description: "",
  };
}

function eventsOverlap(
  event: Pick<DemoCalendarEvent, "start" | "end">,
  slot: Pick<DemoSlotOption, "start" | "end">,
): boolean {
  const es = new Date(event.start).getTime();
  const ee = new Date(event.end).getTime();
  const ss = new Date(slot.start).getTime();
  const se = new Date(slot.end).getTime();
  if (Number.isNaN(es) || Number.isNaN(ee) || Number.isNaN(ss) || Number.isNaN(se)) return false;
  return es < se && ss < ee;
}

export function buildDefaultDemoSlots(): DemoSlotOption[] {
  return [
    { weekday: 2, hour: 10, minute: 0 },
    { weekday: 3, hour: 14, minute: 0 },
    { weekday: 4, hour: 9, minute: 0 },
  ].map((preset) => resolveSlotTime(preset.weekday, preset.hour, preset.minute, 30));
}

export function buildSchedulingSlotsFromCalendar(events: DemoCalendarEvent[]): DemoSlotOption[] {
  const slots = buildDefaultDemoSlots();
  let recommendedId: string | null = null;
  const annotated = slots.map((slot) => {
    const conflict = events.find((event) => eventsOverlap(event, slot));
    const free = !conflict;
    if (free && !recommendedId) recommendedId = slot.id;
    return {
      ...slot,
      description: conflict
        ? `Busy — overlaps “${conflict.summary}”`
        : "Free on your calendar",
      recommended: false,
    };
  });
  if (recommendedId) {
    return annotated.map((slot) => ({
      ...slot,
      recommended: slot.id === recommendedId,
    }));
  }
  return annotated.map((slot, index) => ({
    ...slot,
    recommended: index === 0,
  }));
}

export function formatEventRange(start: string, end: string): string {
  try {
    const s = new Date(start);
    const e = new Date(end);
    const opts: Intl.DateTimeFormatOptions = {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    };
    return `${s.toLocaleString(undefined, opts)} – ${e.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
  } catch {
    return `${start} – ${end}`;
  }
}
