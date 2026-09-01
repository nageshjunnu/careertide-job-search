import { useEffect, useState } from 'react'
import CareerTideApplication from './app/CareerTideApplication'
import { useScrollReveal } from './hooks/useScrollReveal'

function App() {
  useScrollReveal()
  const [brand, setBrand] = useState('SkillBridge')
  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:4000' : '')
    fetch(`${apiUrl}/api/site-settings`).then((response) => response.ok ? response.json() : null).then((data) => { const value = data?.settings?.find?.((item: { key: string; value: string }) => item.key === 'brand_name')?.value ?? data?.settings?.brand_name; if (value) setBrand(value) }).catch(() => {})
  }, [])
  useEffect(() => {
    document.title = `${brand} – Job Search & Career Assistant`
    const replace = () => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      const nodes: Text[] = []; let node: Node | null
      while ((node = walker.nextNode())) nodes.push(node as Text)
      nodes.forEach((text) => { if (text.data.includes('CareerTide')) text.data = text.data.replaceAll('CareerTide', brand); if (text.data.includes('careerTide')) text.data = text.data.replaceAll('careerTide', brand) })
      document.querySelectorAll<HTMLInputElement>('input[placeholder],textarea[placeholder]').forEach((input) => { input.placeholder = input.placeholder.replaceAll('CareerTide', brand) })
    }
    replace()
    const observer = new MutationObserver(replace); observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
  }, [brand])
  return <CareerTideApplication />
}

export default App
