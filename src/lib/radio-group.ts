import type { KeyboardEvent } from "react"

// Keyboard behavior for a custom radio group (role="radiogroup" around role="radio" buttons), per the ARIA practices:
// the group is one tab stop (the checked option, or the first when none is), and the arrow keys move to the previous
// or next option and select it, wrapping at the ends; Home and End jump to the first and last.

const STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }

/**
 * onKeyDown for the role="radiogroup" element. `select: false` moves focus only (Enter or Space then picks), for a
 * group whose choice triggers a reload and closes its popover (the peer-group presets).
 */
export function onRadioGroupKeyDown(e: KeyboardEvent<HTMLElement>, { select = true }: { select?: boolean } = {}) {
  const step = STEP[e.key]
  if (step == null && e.key !== "Home" && e.key !== "End") return
  const radios = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')].filter(
    (el) => el.getAttribute("aria-disabled") !== "true" && !(el as HTMLButtonElement).disabled && el.tagName === "BUTTON"
  )
  if (!radios.length) return
  const current = radios.indexOf(document.activeElement as HTMLElement)
  const next =
    e.key === "Home" ? 0 : e.key === "End" ? radios.length - 1 : (Math.max(current, 0) + step + radios.length) % radios.length
  e.preventDefault()
  radios[next].focus()
  if (select) radios[next].click()
}

/** tabIndex for option `index`: only the checked one (or the first, when none is) is in the tab order. */
export const rovingTabIndex = (checked: boolean, index: number, anyChecked: boolean) => (checked || (!anyChecked && index === 0) ? 0 : -1)
