'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

export type TabItem = {
  value: string
  label: string
  content: React.ReactNode
}

export function Tabs({ defaultValue, items }: { defaultValue: string; items: TabItem[] }) {
  const [active, setActive] = useState(defaultValue)
  const current = items.find((i) => i.value === active) ?? items[0]

  return (
    <div className="mt-6">
      <div className="flex items-center gap-1 overflow-x-auto border-b">
        {items.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setActive(item.value)}
            className={cn(
              'shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              item.value === active
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="pt-4">{current?.content}</div>
    </div>
  )
}