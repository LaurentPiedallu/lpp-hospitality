type Variant = "green" | "amber" | "red" | "neutral";

const LABEL_STYLES: Record<Variant, string> = {
  green:   "text-green-600",
  amber:   "text-amber-600",
  red:     "text-red-600",
  neutral: "text-gray-500",
};

export default function KpiCard({
  label,
  value,
  sub,
  variant = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  variant?: Variant;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-xl sm:text-2xl font-semibold ${LABEL_STYLES[variant]}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}
