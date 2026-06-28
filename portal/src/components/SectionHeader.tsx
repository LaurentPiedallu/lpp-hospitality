export default function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-4">
      {title}
    </h2>
  );
}
