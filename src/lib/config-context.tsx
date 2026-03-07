'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'

type Config = Record<string, string>

const ConfigContext = createContext<Config>({})

export function useConfig() {
  return useContext(ConfigContext)
}

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<Config>({})
  const supabase = createClient()

  useEffect(() => {
    // Initial fetch
    async function fetchConfig() {
      const { data } = await supabase.from('config').select('key, value')
      if (data) {
        const map: Config = {}
        data.forEach((r: { key: string; value: string }) => { map[r.key] = r.value })
        setConfig(map)
      }
    }
    fetchConfig()

    // Live updates
    const channel = supabase
      .channel('config-global-watch')
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'config'
      }, (payload: { new: { key: string; value: string } }) => {
        setConfig(prev => ({ ...prev, [payload.new.key]: payload.new.value }))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  return (
    <ConfigContext.Provider value={config}>
      {children}
    </ConfigContext.Provider>
  )
}