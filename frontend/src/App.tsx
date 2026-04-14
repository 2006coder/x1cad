import { InspectorPanel } from './components/InspectorPanel'
import { LeftSidebar } from './components/LeftSidebar'
import { SceneViewport } from './components/SceneViewport'
import { StatusBar } from './components/StatusBar'
import { TopBar } from './components/TopBar'
import { WelcomeOverlay } from './components/WelcomeOverlay'
import { useCadHotkeys } from './hooks/useCadHotkeys'
import { useSystemStatus } from './hooks/useSystemStatus'
import { useCadStore, useSelectedObject } from './store/useCadStore'

function App() {
  useCadHotkeys()

  const selectedObject = useSelectedObject()
  const showOnboarding = useCadStore((state) => state.showOnboarding)
  const {
    systemStatus,
    modelStatus,
    loading,
    error,
    refresh,
    downloadModels,
    backendOnline,
  } = useSystemStatus()

  return (
    <div className="app-shell">
      <div className="background-orb background-orb--left" />
      <div className="background-orb background-orb--right" />
      <div className="background-grid" />

      <TopBar backendOnline={backendOnline} systemStatus={systemStatus} />

      <div className="workspace-grid">
        <LeftSidebar />
        <SceneViewport />
        <InspectorPanel
          backendOnline={backendOnline}
          downloadModels={downloadModels}
          error={error}
          loading={loading}
          modelStatus={modelStatus}
          refreshStatus={refresh}
          selectedObject={selectedObject}
          systemStatus={systemStatus}
        />
      </div>

      <StatusBar backendOnline={backendOnline} systemStatus={systemStatus} />

      {showOnboarding ? <WelcomeOverlay systemStatus={systemStatus} /> : null}
    </div>
  )
}

export default App
