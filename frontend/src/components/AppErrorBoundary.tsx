import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, HardDriveDownload, RefreshCw } from 'lucide-react'

interface AppErrorBoundaryProps {
  children: ReactNode
}

interface AppErrorBoundaryState {
  hasError: boolean
  message: string
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
    message: '',
  }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      message: error.message,
    }
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('x1cad frontend crashed', error, errorInfo)
  }

  resetWorkspace() {
    window.localStorage.removeItem('x1cad-workspace')
    window.location.reload()
  }

  override render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <div className="crash-shell">
        <div className="crash-card panel">
          <div className="welcome-badge">
            <AlertTriangle size={16} />
            <span>Workspace recovery</span>
          </div>
          <div className="crash-copy">
            <h2>x1cad hit a recoverable frontend error.</h2>
            <p>
              This usually means a saved workspace item or mesh asset could not be restored cleanly.
              You can reload the page, or reset only the local browser workspace and reopen the app.
            </p>
            {this.state.message ? (
              <div className="sidebar-note crash-note">{this.state.message}</div>
            ) : null}
          </div>
          <div className="button-row">
            <button className="secondary-button" onClick={() => window.location.reload()} type="button">
              <RefreshCw size={16} />
              <span>Reload page</span>
            </button>
            <button className="primary-button" onClick={() => this.resetWorkspace()} type="button">
              <HardDriveDownload size={16} />
              <span>Reset browser workspace</span>
            </button>
          </div>
        </div>
      </div>
    )
  }
}
