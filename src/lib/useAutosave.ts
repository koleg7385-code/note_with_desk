import { useCallback, useEffect, useRef, useState } from 'react'

export type SaveStatus = 'saved' | 'saving'

/**
 * Локальная копия полей с отложенной записью в базу.
 *
 * Ожидает, что компонент смонтирован с key={id}: тогда при переключении объекта
 * состояние создаётся заново, а при размонтировании остаток дописывается в базу.
 * Поэтому в базу не попадает ни одного нажатия клавиши в момент набора.
 */
export function useAutosave<T extends Record<string, unknown>>(
  seed: T,
  save: (patch: T) => void,
  delay = 600,
) {
  const [values, setValues] = useState<T>(seed)
  const [status, setStatus] = useState<SaveStatus>('saved')

  const alive = useRef(true)
  const latest = useRef<T>(seed)
  const dirty = useRef(false)
  const timer = useRef<number | undefined>(undefined)
  const saveRef = useRef(save)
  saveRef.current = save

  const flush = useCallback(() => {
    window.clearTimeout(timer.current)
    if (!dirty.current) return
    dirty.current = false
    saveRef.current(latest.current)
    if (alive.current) setStatus('saved')
  }, [])

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  // Дописываем несохранённое при уходе со страницы или смене объекта.
  useEffect(() => () => flush(), [flush])

  // Последний шанс сохранить: вкладку сворачивают или закрывают.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flush)
    }
  }, [flush])

  const set = useCallback(
    (patch: Partial<T>) => {
      const next = { ...latest.current, ...patch }
      latest.current = next
      setValues(next)
      dirty.current = true
      setStatus('saving')
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(flush, delay)
    },
    [delay, flush],
  )

  return { values, set, status }
}
