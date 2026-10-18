// SAMPLE DATA ONLY. Synthetic sites, machines and events for the Mine Operations Eye.
// Replace with imported production / machine / fuel CSVs. Nothing here is real.
export type Conf = "confirmed" | "inferred" | "missing";
export type Delay = { id: string; kind: string; label: string; from: string; to: string; hours: number; rate: number; reported: boolean; at: [number, number]; evidence: string[] };
export type Evidence = { id: string; time: string; label: string; at: [number, number]; shows: "no-activity" | "loading" | "queue"; note: string };
export type Machine = { id: string; type: string; status: "active" | "idle" | "down"; idleHours: number; litres: number; tonnes: number; at: [number, number]; path: [number, number][] };
export type Site = { id: string; name: string; center: [number, number]; target: number; actual: number; shiftPct: number; shift: string; pits: { name: string; ring: [number, number][] }[]; road: [number, number][]; delays: Delay[]; evidence: Evidence[]; machines: Machine[] };

const ring = (c: [number, number], r: number): [number, number][] => [[c[0]-r,c[1]-r*.7],[c[0]+r,c[1]-r*.8],[c[0]+r*1.1,c[1]+r*.6],[c[0]-r*.6,c[1]+r*.9],[c[0]-r,c[1]-r*.7]];
const walk = (a: [number, number], b: [number, number]): [number, number][] => Array.from({ length: 13 }, (_, i) => [a[0]+(b[0]-a[0])*i/12, a[1]+(b[1]-a[1])*i/12] as [number, number]);

const c4: [number, number] = [22.9712, -27.2331];
const c2: [number, number] = [22.9985, -27.2012];
const c7: [number, number] = [22.9440, -27.2605];
const pit = (c: [number, number], dx: number, dy: number): [number, number] => [c[0]+dx, c[1]+dy];

const mk = (c: [number, number], id: string, type: string, status: Machine["status"], idle: number, l: number, t: number, off: [number, number]): Machine =>
  ({ id, type, status, idleHours: idle, litres: l, tonnes: t, at: pit(c, off[0], off[1]), path: walk(pit(c, off[0], off[1]), pit(c, -off[0]*.4, off[1]*-.6)) });

export const SAMPLE_SITES: Site[] = [
  { id: "s4", name: "Site 4 (Buffels West, SAMPLE)", center: c4, target: 18500, actual: 13320, shiftPct: 72, shift: "Night 18:00-06:00",
    pits: [{ name: "Pit A", ring: ring(pit(c4, -.004, .002), .0035) }, { name: "Pit B", ring: ring(pit(c4, .004, -.002), .0045) }],
    road: [pit(c4,-.004,.002), pit(c4,0,0), pit(c4,.004,-.002), pit(c4,.008,.003)],
    delays: [
      { id: "d1", kind: "blast", label: "Blast clearance, Pit B", from: "01:00", to: "03:00", hours: 2, rate: 620, reported: true, at: pit(c4,.004,-.002), evidence: ["e1", "e2"] },
      { id: "d2", kind: "idle", label: "Three haulers idle, Pit B ramp", from: "01:30", to: "03:30", hours: 2, rate: 160, reported: false, at: pit(c4,.0045,-.0005), evidence: ["e2"] } ],
    evidence: [
      { id: "e1", time: "01:20", label: "Supervisor clip, Pit B face", at: pit(c4,.004,-.0022), shows: "no-activity", note: "No loading visible at the face." },
      { id: "e2", time: "03:30", label: "Supervisor clip, ramp", at: pit(c4,.0045,-.0008), shows: "no-activity", note: "Hauler stationary near the ramp." } ],
    machines: [ mk(c4,"A40-17","A40 hauler","idle",3.1,310,420,[.0045,-.001]), mk(c4,"A40-12","A40 hauler","idle",2.2,260,610,[.003,-.002]), mk(c4,"A40-09","A40 hauler","active",.4,240,980,[-.003,.002]), mk(c4,"EX-03","Excavator","active",.8,410,1400,[.0042,-.0025]) ] },
  { id: "s2", name: "Site 2 (SAMPLE)", center: c2, target: 12000, actual: 11450, shiftPct: 72, shift: "Night 18:00-06:00",
    pits: [{ name: "Pit C", ring: ring(c2, .0038) }], road: [pit(c2,-.003,0), c2, pit(c2,.004,.002)],
    delays: [{ id: "d3", kind: "weather", label: "Dust suppression stop", from: "22:00", to: "22:45", hours: .75, rate: 450, reported: true, at: c2, evidence: [] }],
    evidence: [], machines: [ mk(c2,"A40-21","A40 hauler","active",.3,230,1100,[.002,.001]), mk(c2,"EX-05","Excavator","active",.5,380,1500,[0.0005,-.001]) ] },
  { id: "s7", name: "Site 7 (SAMPLE)", center: c7, target: 9000, actual: 5900, shiftPct: 72, shift: "Night 18:00-06:00",
    pits: [{ name: "Pit D", ring: ring(c7, .004) }], road: [pit(c7,-.003,.001), c7, pit(c7,.004,-.002)],
    delays: [{ id: "d4", kind: "breakdown", label: "Crusher breakdown (reported)", from: "00:00", to: "02:30", hours: 2.5, rate: 700, reported: true, at: pit(c7,.004,-.002), evidence: ["e3"] }],
    evidence: [{ id: "e3", time: "01:10", label: "Clip, crusher feed", at: pit(c7,.0038,-.0018), shows: "loading", note: "Hauler tipping into the crusher during the reported breakdown." }],
    machines: [ mk(c7,"A40-31","A40 hauler","down",5.5,60,200,[.003,-.001]), mk(c7,"EX-08","Excavator","idle",2.9,300,700,[0,0]) ] }
];
