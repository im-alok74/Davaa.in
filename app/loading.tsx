export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <div className="skeleton h-9 w-48" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-28" />
        ))}
      </div>
      <div className="skeleton h-64 w-full" />
      <span className="sr-only">Loading</span>
    </div>
  )
}
