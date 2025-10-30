export function isTodayUTC(ms: number): boolean {
  if (!ms) return false;
  const d = new Date(ms);
  const now = new Date();
  const ymd = (x: Date) => `${x.getUTCFullYear()}-${x.getUTCMonth()}-${x.getUTCDate()}`;
  return ymd(d) === ymd(now);
}


