type Variant = "amber" | "red" | "green" | "gray";

const STYLES: Record<Variant, string> = {
  amber: "bg-amber-50 border-amber-200 text-amber-900",
  red:   "bg-red-50 border-red-200 text-red-900",
  green: "bg-green-50 border-green-200 text-green-900",
  gray:  "bg-gray-50 border-gray-200 text-gray-700",
};

export default function CalloutBlock({
  children,
  variant = "amber",
}: {
  children: React.ReactNode;
  variant?: Variant;
}) {
  return (
    <div className={`rounded-xl border px-5 py-4 text-sm leading-relaxed ${STYLES[variant]}`}>
      {children}
    </div>
  );
}
