"use client";
import { useId, useMemo, useState } from "react";

/**
 * Elevation along the route. One series, one hue (accent), recessive grid,
 * labelled ends and highest point, hover/touch crosshair with a readout.
 * Unknown elevations are gaps, never zeros.
 */
export function ElevationChart({ data, worstPct }: { data: { d: number; z: number | null }[]; worstPct: number | null }) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const W = 340,
    H = 120,
    L = 34,
    R = 8,
    T = 10,
    B = 22;
  const pts = data.filter((p) => p.z !== null) as { d: number; z: number }[];
  const geo = useMemo(() => {
    if (pts.length < 2) return null;
    const dMax = pts[pts.length - 1]!.d || 1;
    let zMin = Math.min(...pts.map((p) => p.z)),
      zMax = Math.max(...pts.map((p) => p.z));
    const pad = Math.max(2, (zMax - zMin) * 0.15);
    zMin = Math.floor((zMin - pad) / 5) * 5;
    zMax = Math.ceil((zMax + pad) / 5) * 5;
    const x = (d: number) => L + ((W - L - R) * d) / dMax;
    const y = (z: number) => T + ((H - T - B) * (zMax - z)) / (zMax - zMin);
    // Break the line where elevation is unknown.
    const runs: { d: number; z: number }[][] = [[]];
    for (const p of data) {
      if (p.z === null) {
        if (runs[runs.length - 1]!.length) runs.push([]);
      } else runs[runs.length - 1]!.push(p as { d: number; z: number });
    }
    const paths = runs.filter((r) => r.length > 1);
    const lineD = paths.map((r) => r.map((p, i) => `${i ? "L" : "M"}${x(p.d).toFixed(1)},${y(p.z).toFixed(1)}`).join("")).join("");
    const areaD = paths
      .map((r) => `M${x(r[0]!.d).toFixed(1)},${H - B}` + r.map((p) => `L${x(p.d).toFixed(1)},${y(p.z).toFixed(1)}`).join("") + `L${x(r[r.length - 1]!.d).toFixed(1)},${H - B}Z`)
      .join("");
    const ticks = [zMin, (zMin + zMax) / 2, zMax];
    const top = pts.reduce((a, b) => (b.z > a.z ? b : a));
    return { x, y, dMax, lineD, areaD, ticks, top };
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!geo) return <p className="text-muted">Elevation not known for this route.</p>;
  const first = pts[0]!,
    last = pts[pts.length - 1]!;
  const climb = Math.round(last.z - first.z);
  const h = hover === null ? null : pts.reduce((a, b) => (Math.abs(b.d - hover) < Math.abs(a.d - hover) ? b : a));

  const onMove = (clientX: number, target: SVGSVGElement) => {
    const r = target.getBoundingClientRect();
    const sx = ((clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(geo.dMax, ((sx - L) / (W - L - R)) * geo.dMax)));
  };

  return (
    <figure className="m-0">
      <figcaption id={`${id}-cap`} className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-sm text-muted">
        <span>Elevation</span>
        <span className="tabular font-mono">
          {climb >= 0 ? `${climb} m up overall` : `${-climb} m down overall`}
          {worstPct !== null ? ` / steepest ${Math.abs(worstPct)}%` : ""}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full touch-none"
        role="img"
        aria-labelledby={`${id}-cap`}
        aria-describedby={`${id}-desc`}
        onPointerMove={(e) => onMove(e.clientX, e.currentTarget)}
        onPointerDown={(e) => onMove(e.clientX, e.currentTarget)}
        onPointerLeave={() => setHover(null)}
      >
        <desc id={`${id}-desc`}>
          Starts at {Math.round(first.z)} m, highest {Math.round(geo.top.z)} m at {Math.round(geo.top.d)} m along, ends at {Math.round(last.z)} m.
        </desc>
        {geo.ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={geo.y(t)} y2={geo.y(t)} stroke="var(--line)" strokeWidth={1} />
            <text x={L - 6} y={geo.y(t) + 4} textAnchor="end" fontSize={10} fill="var(--muted)" className="tabular">
              {Math.round(t)}
            </text>
          </g>
        ))}
        <path d={geo.areaD} fill="var(--accent)" fillOpacity={0.14} />
        <path d={geo.lineD} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" />
        <circle cx={geo.x(geo.top.d)} cy={geo.y(geo.top.z)} r={3.5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
        <text x={L} y={H - 6} fontSize={10} fill="var(--muted)">
          0 m
        </text>
        <text x={W - R} y={H - 6} fontSize={10} fill="var(--muted)" textAnchor="end" className="tabular">
          {geo.dMax >= 1000 ? `${(geo.dMax / 1000).toFixed(1)} km` : `${Math.round(geo.dMax)} m`}
        </text>
        {h ? (
          <g pointerEvents="none">
            <line x1={geo.x(h.d)} x2={geo.x(h.d)} y1={T} y2={H - B} stroke="var(--ink)" strokeWidth={1} strokeDasharray="2 3" />
            <circle cx={geo.x(h.d)} cy={geo.y(h.z)} r={4.5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
          </g>
        ) : null}
      </svg>
      <p className="tabular m-0 min-h-6 font-mono text-sm text-muted" aria-live="polite">
        {h ? `${Math.round(h.d)} m along / ${Math.round(h.z)} m above sea level` : " "}
      </p>
    </figure>
  );
}
