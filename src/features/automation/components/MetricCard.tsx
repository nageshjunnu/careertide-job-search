export function MetricCard({ icon, label, value, trend }: { icon: string; label: string; value: number; trend: string }) {
  return <article className="automation-metric"><span>{icon}</span><div><small>{label}</small><strong>{value}</strong><em>{trend}</em></div></article>
}
