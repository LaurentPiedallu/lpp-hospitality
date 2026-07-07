"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { formatPeriod } from "@/lib/format";

import type { TrendDataPoint } from "@/lib/format";
type DataPoint = TrendDataPoint;

interface TrendChartProps {
  data: DataPoint[];
  unit: "$" | "%" | "Rating" | string;
  benchmarkLow?: number | null;
  benchmarkHigh?: number | null;
  color?: string;
}

function formatValue(value: number, unit: string): string {
  if (unit === "$") return `$${value.toLocaleString()}`;
  if (unit === "%") return `${value.toFixed(1)}%`;
  if (unit === "Rating") return value.toFixed(1);
  return String(value);
}

export default function TrendChart({
  data,
  unit,
  benchmarkLow,
  benchmarkHigh,
  color = "#2563eb",
}: TrendChartProps) {
  if (data.length < 2) return null;

  const sorted = [...data].sort((a, b) => a.period.localeCompare(b.period));
  const values = sorted.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.2 || 1;

  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={sorted} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "#9ca3af" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[Math.max(0, min - pad), max + pad]}
          tick={{ fontSize: 11, fill: "#9ca3af" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => formatValue(v, unit)}
          width={unit === "$" ? 64 : 40}
        />
        <Tooltip
          formatter={(v) => [formatValue(Number(v), unit), "Value"]}
          labelStyle={{ color: "#374151", fontSize: 12 }}
          contentStyle={{ fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 8 }}
        />
        {benchmarkLow != null && (
          <ReferenceLine y={benchmarkLow} stroke="#fbbf24" strokeDasharray="4 4"
            label={{ value: "Low", fontSize: 10, fill: "#d97706", position: "right" }} />
        )}
        {benchmarkHigh != null && (
          <ReferenceLine y={benchmarkHigh} stroke="#34d399" strokeDasharray="4 4"
            label={{ value: "High", fontSize: 10, fill: "#059669", position: "right" }} />
        )}
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          dot={{ r: 3, fill: color }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

