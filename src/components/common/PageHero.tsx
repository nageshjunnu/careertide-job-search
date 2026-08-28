export function PageHero({ title, crumb }: { title: string; crumb: string }) {
  return <section className="page-hero"><h1>{title}</h1><p>{crumb}</p></section>
}
