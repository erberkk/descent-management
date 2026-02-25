import { useEffect } from 'react'
import { useSimulation } from './hooks/useSimulation'
import { useFCU } from './hooks/useFCU'
import { NavigationDisplay } from './components/NavigationDisplay'
import { PrimaryFlightDisplay } from './components/PrimaryFlightDisplay'
import { FCU } from './components/FCU'

export default function App() {
  const { state, connected } = useSimulation()
  const { fcu, reconcile, patch } = useFCU()

  // Keep FCU display in sync with backend state
  useEffect(() => {
    if (state) reconcile(state)
  }, [state, reconcile])

  return (
    <div className="cockpit-body">

      {/* FCU panel sits above the display unit */}
      <div className="fcu-wrapper">
        <FCU fcu={fcu} patch={patch} />
      </div>

      {/* Display unit (ND + PFD) */}
      <div className="cockpit-frame">
        <div className="screw-row top">
          <div className="screw" /><div className="screw" />
        </div>

        <div className="displays-row">
          <div className="display-bezel">
            <div className="display-screen">
              <NavigationDisplay state={state} />
            </div>
            <div className="bezel-corner tl" />
            <div className="bezel-corner tr" />
            <div className="bezel-corner bl" />
            <div className="bezel-corner br" />
          </div>

          <div className="display-bezel">
            <div className="display-screen">
              <PrimaryFlightDisplay state={state} />
            </div>
            <div className="bezel-corner tl" />
            <div className="bezel-corner tr" />
            <div className="bezel-corner bl" />
            <div className="bezel-corner br" />
          </div>
        </div>

        <div className="screw-row bottom">
          <div className="screw" /><div className="screw" />
        </div>
      </div>

      <div className={`conn-status ${connected ? 'connected' : 'disconnected'}`}>
        {connected ? '● LIVE' : '○ CONNECTING…'}
      </div>
    </div>
  )
}
