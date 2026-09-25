"use client"

import { Monitor, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { useMounted } from "@/lib/use-mounted"
import { cn } from "@/lib/utils"

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const

/** Three-way segmented control, like the macOS Appearance setting. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()
  // The stored theme is only known on the client; render a neutral state during SSR.
  const mounted = useMounted()

  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className={cn("inline-flex items-center rounded-lg bg-black/5 p-0.5 dark:bg-white/10", className)}
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = mounted && theme === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              "flex h-6 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              active && "bg-card text-foreground shadow-sm dark:bg-white/15"
            )}
          >
            <Icon className="size-3.5" strokeWidth={2} />
          </button>
        )
      })}
    </div>
  )
}
