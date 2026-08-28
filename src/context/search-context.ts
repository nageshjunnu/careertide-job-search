import { createContext } from 'react'

export type SearchContextValue = {
  query: string
  setQuery: (value: string) => void
  location: string
  setLocation: (value: string) => void
  experience: string
  setExperience: (value: string) => void
}

export const SearchContext = createContext<SearchContextValue | null>(null)
