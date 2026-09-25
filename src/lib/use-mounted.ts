import { useSyncExternalStore } from "react"

const subscribe = () => () => {}

/** True after hydration; false during SSR. Avoids setState-in-effect patterns. */
export function useMounted() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  )
}
