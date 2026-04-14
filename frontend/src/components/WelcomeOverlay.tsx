import { useState } from 'react'
import { ArrowRight, Cpu, Sparkles, WandSparkles } from 'lucide-react'

import { useCadStore } from '../store/useCadStore'
import type { SystemStatus } from '../types/system'

interface WelcomeOverlayProps {
  systemStatus: SystemStatus
}

const steps = [
  {
    eyebrow: 'Welcome',
    title: 'Professional CAD in your browser, tuned for local-first workflows',
    body: 'x1cad starts with manual CAD: direct primitives, fast transforms, precise inspector edits, and a scene that stays lightweight when AI is off.',
  },
  {
    eyebrow: 'Manual editing',
    title: 'Use the viewport like a real workspace, not a static preview',
    body: 'Pick a tool with Q, G, R, or S, drag the transform gizmo, then fine-tune values in the inspector. Lock and hide objects from the scene tree when assemblies get busy.',
  },
  {
    eyebrow: 'AI when ready',
    title: 'AI is integrated as a local assistant, not a dependency',
    body: 'When your hardware supports it, generated concepts can drop straight back into the scene and continue through the exact same CAD workflow as manual parts.',
  },
]

export function WelcomeOverlay({ systemStatus }: WelcomeOverlayProps) {
  const [step, setStep] = useState(0)
  const dismissOnboarding = useCadStore((state) => state.dismissOnboarding)
  const loadDemoScene = useCadStore((state) => state.loadDemoScene)

  const activeStep = steps[step]

  return (
    <div className="welcome-overlay">
      <div className="welcome-panel panel">
        <div className="welcome-hero">
          <div className="welcome-badge">
            <WandSparkles size={16} />
            <span>x1cad onboarding</span>
          </div>
          <div className="welcome-system-pill">
            <Cpu size={14} />
            <span>
              {systemStatus.platform} • AI {systemStatus.ai_capability.mode}
            </span>
          </div>
        </div>

        <div className="welcome-content">
          <span className="guide-eyebrow">{activeStep.eyebrow}</span>
          <h2>{activeStep.title}</h2>
          <p>{activeStep.body}</p>

          <div className="welcome-shortcuts">
            <div className="shortcut-chip">G move</div>
            <div className="shortcut-chip">R rotate</div>
            <div className="shortcut-chip">S scale</div>
            <div className="shortcut-chip">F focus</div>
          </div>
        </div>

        <div className="welcome-progress">
          {steps.map((item, index) => (
            <button
              key={item.title}
              aria-label={`Go to onboarding step ${index + 1}`}
              className={`welcome-dot ${index === step ? 'is-active' : ''}`}
              onClick={() => setStep(index)}
              type="button"
            />
          ))}
        </div>

        <div className="welcome-actions">
          <button
            className="secondary-button"
            onClick={() => {
              loadDemoScene()
              dismissOnboarding()
            }}
            type="button"
          >
            <Sparkles size={16} />
            <span>Open demo scene</span>
          </button>

          {step < steps.length - 1 ? (
            <button className="primary-button" onClick={() => setStep((current) => current + 1)} type="button">
              <span>Next</span>
              <ArrowRight size={16} />
            </button>
          ) : (
            <button className="primary-button" onClick={() => dismissOnboarding()} type="button">
              <span>Start modeling</span>
              <ArrowRight size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
