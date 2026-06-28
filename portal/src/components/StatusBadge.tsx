// Status badge — color communicates meaning, never used decoratively

type Variant = "green" | "amber" | "red" | "gray" | "blue";

const VARIANTS: Record<Variant, string> = {
  green: "bg-green-50 text-green-700 ring-1 ring-green-200",
  amber: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  red:   "bg-red-50 text-red-700 ring-1 ring-red-200",
  gray:  "bg-gray-100 text-gray-600 ring-1 ring-gray-200",
  blue:  "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
};

export default function StatusBadge({
  label,
  variant,
}: {
  label: string;
  variant: Variant;
}) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${VARIANTS[variant]}`}>
      {label}
    </span>
  );
}
