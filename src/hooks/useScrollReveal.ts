import { useEffect } from 'react'

const REVEAL_SELECTOR = [
  'main section',
  'main article',
  '.search-console',
  '.section-title',
  '.cta-panel',
  '.filter-box',
  '.automation-metric',
  '.workflow-node',
  '.automation-table tbody tr',
].join(',')

/** Applies one shared, accessible reveal behavior to current and future UI pieces. */
export function useScrollReveal() {
  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion) {
      document.documentElement.classList.add('reduced-motion')
      return
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        entry.target.classList.add('is-revealed')
        observer.unobserve(entry.target)
      })
    }, { rootMargin: '0px 0px -7% 0px', threshold: 0.08 })

    const observed = new WeakSet<Element>()
    const observeNewElements = () => {
      document.querySelectorAll(REVEAL_SELECTOR).forEach((element, index) => {
        if (observed.has(element) || element.classList.contains('is-revealed')) return
        observed.add(element)
        element.classList.add('scroll-reveal')
        ;(element as HTMLElement).style.setProperty('--reveal-delay', `${Math.min(index % 6, 5) * 55}ms`)
        observer.observe(element)
      })
    }

    observeNewElements()
    const mutations = new MutationObserver(observeNewElements)
    mutations.observe(document.getElementById('root') ?? document.body, { childList: true, subtree: true })

    return () => {
      mutations.disconnect()
      observer.disconnect()
    }
  }, [])
}
