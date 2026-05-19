import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, Line
} from "recharts";
import { format } from "date-fns";

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--destructive))",
];

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
};

const axisProps = { className: "text-xs fill-muted-foreground" };

function formatDate(value: string) {
  return format(new Date(value), "MMM dd");
}

interface ChartCardProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

function ChartCard({ title, subtitle, children }: ChartCardProps) {
  return (
    <Card className="shadow-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent>
        <div className="h-[320px] w-full">{children}</div>
      </CardContent>
    </Card>
  );
}

// WO Trend (Raised vs Closed - Area Chart)
export function WOTrendChart({ data }: { data: { date: string; raised: number; closed: number }[] }) {
  return (
    <ChartCard title="Work Order Trend" subtitle="Raised vs Closed (Last 7 Days)">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="date" tickFormatter={formatDate} {...axisProps} />
          <YAxis {...axisProps} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={formatDate} />
          <Legend />
          <Area type="monotone" dataKey="raised" name="Raised" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive))" fillOpacity={0.15} strokeWidth={2} />
          <Area type="monotone" dataKey="closed" name="Closed" stroke="hsl(var(--chart-2))" fill="hsl(var(--chart-2))" fillOpacity={0.15} strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// MTTR Trend (Area chart)
export function MTTRTrendChart({ data }: { data: { date: string; value: number }[] }) {
  return (
    <ChartCard title="MTTR Trend" subtitle="Mean Time To Repair (minutes, Last 7 Days)">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="date" tickFormatter={formatDate} {...axisProps} />
          <YAxis {...axisProps} />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={formatDate} />
          <Area type="monotone" dataKey="value" name="MTTR" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// WO by Category (Bar Chart)
export function WOByCategoryChart({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ChartCard title="Work Orders by Category" subtitle="Distribution across categories">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="name" {...axisProps} />
          <YAxis {...axisProps} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="value" name="Count" radius={[6, 6, 0, 0]}>
            {data.map((_, idx) => (
              <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// WO by Status (Pie Chart)
export function WOByStatusChart({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ChartCard title="Work Orders by Status" subtitle="Current status breakdown">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={95}
            paddingAngle={3}
            dataKey="value"
            nameKey="name"
            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
            labelLine={false}
          >
            {data.map((_, idx) => (
              <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// WO by Priority (Horizontal Bar)
export function WOByPriorityChart({ data }: { data: { name: string; value: number }[] }) {
  const priorityColors: Record<string, string> = {
    CRITICAL: "hsl(var(--destructive))",
    HIGH: "hsl(var(--chart-5))",
    MEDIUM: "hsl(var(--chart-4))",
    LOW: "hsl(var(--chart-2))",
  };
  return (
    <ChartCard title="Work Orders by Priority" subtitle="Priority distribution">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis type="number" {...axisProps} allowDecimals={false} />
          <YAxis type="category" dataKey="name" {...axisProps} width={80} />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="value" name="Count" radius={[0, 6, 6, 0]}>
            {data.map((entry) => (
              <Cell key={entry.name} fill={priorityColors[entry.name] || COLORS[0]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// MTBF Trend (Area chart)
export function MTBFTrendChart({ data }: { data: { date: string; value: number }[] }) {
  return (
    <ChartCard title="MTBF Trend" subtitle="Mean Time Between Failures (minutes, Last 7 Days)">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="date" tickFormatter={formatDate} {...axisProps} />
          <YAxis {...axisProps} />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={formatDate} />
          <Area type="monotone" dataKey="value" name="MTBF (min)" stroke="hsl(var(--chart-2))" fill="hsl(var(--chart-2))" fillOpacity={0.15} strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// Pareto Chart (80/20 Rule)
export function ParetoChart({ data, title, subtitle }: { data: { name: string; value: number }[], title: string, subtitle: string }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  let cumulative = 0;
  const paretoData = [...data].sort((a, b) => b.value - a.value).map(item => {
    cumulative += item.value;
    return {
      ...item,
      percentage: Math.round((cumulative / total) * 100)
    };
  });

  return (
    <ChartCard title={title} subtitle={subtitle}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={paretoData}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="name" {...axisProps} />
          <YAxis yAxisId="left" {...axisProps} label={{ value: 'Count', angle: -90, position: 'insideLeft' }} />
          <YAxis yAxisId="right" orientation="right" {...axisProps} domain={[0, 100]} label={{ value: '%', angle: 90, position: 'insideRight' }} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend />
          <Bar yAxisId="left" dataKey="value" name="Value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
          <Line yAxisId="right" type="monotone" dataKey="percentage" name="Cumulative %" stroke="hsl(var(--chart-2))" strokeWidth={3} dot={{ r: 4 }} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}


