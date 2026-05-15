import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
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
  delay?: number;
}

function ChartCard({ title, subtitle, children, delay = 0 }: ChartCardProps) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay }}>
      <Card className="shadow-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold">{title}</CardTitle>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </CardHeader>
        <CardContent>
          <div className="h-[320px] w-full">{children}</div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// WO Trend (Raised vs Closed - Area Chart)
export function WOTrendChart({ data }: { data: { date: string; raised: number; closed: number }[] }) {
  return (
    <ChartCard title="Work Order Trend" subtitle="Raised vs Closed (Last 7 Days)" delay={0.2}>
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
    <ChartCard title="MTTR Trend" subtitle="Mean Time To Repair (minutes, Last 7 Days)" delay={0.3}>
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
    <ChartCard title="Work Orders by Category" subtitle="Distribution across categories" delay={0.4}>
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
    <ChartCard title="Work Orders by Status" subtitle="Current status breakdown" delay={0.3}>
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
    <ChartCard title="Work Orders by Priority" subtitle="Priority distribution" delay={0.5}>
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
    <ChartCard title="MTBF Trend" subtitle="Mean Time Between Failures (minutes, Last 7 Days)" delay={0.35}>
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


