import { type ChartConfig } from "@/api/reportFormat";

function MiniBarChart({ color = "#2563EB" }: { color?: string }) {
  const bars = [
    { h: "40%" }, { h: "70%" }, { h: "55%" }, { h: "85%" }, { h: "30%" },
    { h: "65%" }, { h: "45%" }, { h: "90%" }, { h: "50%" }, { h: "75%" },
  ];
  return (
    <svg viewBox="0 0 120 60" className="w-full h-full">
      {bars.map((bar, i) => (
        <rect
          key={i}
          x={i * 12 + 2}
          y={60 - Number(bar.h.replace("%", "")) * 0.6}
          width={8}
          height={Number(bar.h.replace("%", "")) * 0.6}
          rx={1.5}
          fill={color}
          opacity={0.85}
        />
      ))}
    </svg>
  );
}

function MiniLineChart({ color = "#2563EB" }: { color?: string }) {
  const points = [
    { x: 0, y: 70 }, { x: 15, y: 45 }, { x: 30, y: 60 },
    { x: 45, y: 30 }, { x: 60, y: 50 }, { x: 75, y: 25 },
    { x: 90, y: 40 }, { x: 105, y: 15 },
  ];
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
  const bottomY = 80;
  const areaD = d + ` L${points[points.length - 1].x} ${bottomY} L0 ${bottomY} Z`;
  return (
    <svg viewBox="0 0 120 80" className="w-full h-full">
      <path d={areaD} fill={color} opacity={0.1} />
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={2.5} fill={color} />
      ))}
    </svg>
  );
}

function MiniPieChart({ color = "#2563EB" }: { color?: string }) {
  const slices = [
    { pct: 0.35, color }, { pct: 0.25, color: "#8B5CF6" },
    { pct: 0.2, color: "#10B981" }, { pct: 0.15, color: "#F59E0B" },
    { pct: 0.05, color: "#EF4444" },
  ];
  let cumulative = -0.25;
  const paths = slices.map((slice, i) => {
    const startAngle = cumulative * 2 * Math.PI;
    cumulative += slice.pct;
    const endAngle = cumulative * 2 * Math.PI;
    const r = 28;
    const cx = 35; const cy = 35;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = slice.pct > 0.5 ? 1 : 0;
    return (
      <path
        key={`${slice.color}-${i}`}
        d={`M${cx} ${cy} L${x1} ${y1} A${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`}
        fill={slice.color}
        stroke="white"
        strokeWidth={1}
      />
    );
  });
  return <svg viewBox="0 0 70 70" className="w-full h-full"><circle cx={35} cy={35} r={28} fill="#f3f4f6" />{paths}</svg>;
}

export function MiniChartPreview({ chart }: { chart: ChartConfig }) {
  const color = chart.colorScheme?.[0] ?? "#2563EB";
  switch (chart.type) {
    case "line":
    case "area":
      return <MiniLineChart color={color} />;
    case "pie":
      return <MiniPieChart color={color} />;
    case "radar":
    default:
      return <MiniBarChart color={color} />;
  }
}
