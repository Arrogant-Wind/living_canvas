import { Tldraw } from 'tldraw'
import { WfNodeShapeUtil } from './canvas/WfNodeShape'
import { Toolbar } from './ui/Toolbar'

const shapeUtils = [WfNodeShapeUtil]

export function App() {
  return (
    <div className="lc-app">
      <div className="lc-canvas">
        <Tldraw
          shapeUtils={shapeUtils}
          components={{ InFrontOfTheCanvas: Toolbar }}
          onMount={(editor) => {
            ;(window as any).editor = editor
          }}
        />
      </div>
    </div>
  )
}
