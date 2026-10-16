import { format, formatDistanceToNowStrict } from "date-fns";

export function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  return format(new Date(v.length === 10 ? v + "T00:00:00" : v), "d MMM yyyy");
}
export function fmtDateTime(v: string | null | undefined) {
  if (!v) return "—";
  return format(new Date(v), "d MMM yyyy, HH:mm");
}
export function fmtRelative(v: string | null | undefined) {
  if (!v) return "—";
  const d = new Date(v);
  const s = formatDistanceToNowStrict(d, { addSuffix: true });
  return s;
}
export function fmtZAR(v: number | string | null | undefined) {
  if (v === null || v === undefined || v === "") return "—";
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(Number(v));
}
export function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  return format(new Date(iso), "yyyy-MM-dd'T'HH:mm");
}
export function fromLocalInput(v: string) {
  return v ? new Date(v).toISOString() : null;
}
export function fmtBytes(n: number) {
  return n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`;
}
