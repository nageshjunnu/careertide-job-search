import { useMemo, useState, type ReactNode } from 'react'
import { APP_CONFIG } from '../config/app.config'
import { SearchContext } from './search-context'

export function SearchProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState<string>(APP_CONFIG.defaultSearch.query)
  const [location, setLocation] = useState<string>(APP_CONFIG.defaultSearch.location)
  const [experience, setExperience] = useState<string>(APP_CONFIG.defaultSearch.experience)
  const value = useMemo(() => ({ query, setQuery, location, setLocation, experience, setExperience }), [query, location, experience])
  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>
}
