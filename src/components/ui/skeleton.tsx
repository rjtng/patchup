// Placeholder cards shown while a screen's data loads.
export function CardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-3 px-6 pt-6">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-card bg-white shadow-sm" />
      ))}
    </div>
  );
}
