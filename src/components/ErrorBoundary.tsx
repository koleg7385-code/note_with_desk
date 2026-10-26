import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Одна упавшая панель не должна гасить всё приложение: пользователь увидит
 * сообщение и сможет вернуться, а не пустой экран без объяснений.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[note-with-desk]', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const button =
      'rounded-md border border-line px-3 py-1.5 text-[13px] text-muted transition-colors hover:bg-hover hover:text-ink-strong'

    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-[14px] text-ink">Этот экран не открылся</p>
        <p className="max-w-[560px] text-[12px] leading-relaxed text-faint">{error.message}</p>
        <div className="flex gap-2">
          <button className={button} onClick={() => this.setState({ error: null })}>
            Попробовать снова
          </button>
          <button className={button} onClick={() => location.reload()}>
            Перезагрузить
          </button>
        </div>
      </div>
    )
  }
}