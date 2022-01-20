import { useEffect, useState } from 'react'
import { useWindowSize } from 'react-use'
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch'
import { useFirebase } from './adapters/firebase'
import CleanupTools from './components/CleanupTools'
import ZoomTools from './components/ZoomTools'
import { useEditor } from './context/EditorContext'
import EditorToolSelector, { EditorTool } from './EditorToolSelector'

const TOOLBAR_SIZE = 180

interface EditorUIProps {
  showOriginal: boolean
  showSeparator: boolean
}

export default function EditorUI({
  showOriginal,
  showSeparator,
}: EditorUIProps) {
  const [brushSize, setBrushSize] = useState(40)

  const [{ x, y }, setCoords] = useState({ x: -1, y: -1 })
  const [showBrush, setShowBrush] = useState(false)
  const [isInpaintingLoading, setIsInpaintingLoading] = useState(false)
  const [tool, setTool] = useState<EditorTool>('clean')
  const firebase = useFirebase()
  const [scale, setScale] = useState<number>()
  const [minScale, setMinScale] = useState<number>()
  const [zoom, setZoom] = useState(1)
  const windowSize = useWindowSize()

  const editor = useEditor()
  const {
    image,
    undo,
    file,
    edits,
    addLine,
    context,
    isImageLoaded,
    render,
    draw,
    setContext,
    maskCanvas,
    useHD,
  } = editor
  const currentEdit = edits[edits.length - 1]

  // Reset when the file changes
  // useEffect(() => {
  //   setScale(1)
  //   setIsInpaintingLoading(false)
  // }, [image])

  // Draw once the image image is loaded
  useEffect(() => {
    if (!image) {
      return
    }
    if (isImageLoaded) {
      const rW = windowSize.width / image.naturalWidth
      const rH = (windowSize.height - TOOLBAR_SIZE) / image.naturalHeight
      if (rW < 1 || rH < 1) {
        const s = Math.min(rW, rH)
        setMinScale(s)
        setScale(s)
      } else {
        setMinScale(1)
        setScale(1)
      }
      if (context?.canvas) {
        context.canvas.width = image.naturalWidth
        context.canvas.height = image.naturalHeight
      }
      draw()
    }
  }, [context?.canvas, draw, image, isImageLoaded, windowSize, minScale])

  // Handle mouse interactions
  useEffect(() => {
    if (!firebase || !image || !context || tool !== 'clean' || !scale) {
      return
    }
    const canvas = context?.canvas
    if (!canvas) {
      return
    }

    const onMouseDown = (ev: MouseEvent) => {
      if (!image.src) {
        return
      }
      const currLine = currentEdit.lines[currentEdit.lines.length - 1]
      currLine.size = brushSize
      canvas.addEventListener('mousemove', onMouseDrag)
      window.addEventListener('mouseup', onPointerUp)
      onPaint(ev.offsetX, ev.offsetY)
    }
    const onMouseMove = (ev: MouseEvent) => {
      setCoords({ x: ev.pageX, y: ev.pageY })
    }
    const onPaint = (px: number, py: number) => {
      const currLine = currentEdit.lines[currentEdit.lines.length - 1]
      currLine.pts.push({ x: px, y: py })
      draw()
    }
    const onMouseDrag = (ev: MouseEvent) => {
      const px = ev.offsetX
      const py = ev.offsetY
      onPaint(px, py)
    }

    const onPointerUp = async () => {
      if (!image?.src || !file) {
        return
      }
      canvas.removeEventListener('mousemove', onMouseDrag)
      window.removeEventListener('mouseup', onPointerUp)
      if (!useHD) {
        setIsInpaintingLoading(true)
        await render()
        setIsInpaintingLoading(false)
      } else {
        addLine()
      }
    }
    window.addEventListener('mousemove', onMouseMove)

    const onTouchMove = (ev: TouchEvent) => {
      ev.preventDefault()
      ev.stopPropagation()
      const currLine = currentEdit.lines[currentEdit.lines.length - 1]
      const coords = canvas.getBoundingClientRect()
      currLine.pts.push({
        x: (ev.touches[0].clientX - coords.x) / scale,
        y: (ev.touches[0].clientY - coords.y) / scale,
      })
      draw()
    }
    const onPointerStart = (ev: TouchEvent) => {
      if (!image.src) {
        return
      }
      const currLine = currentEdit.lines[currentEdit.lines.length - 1]
      currLine.size = brushSize
      canvas.addEventListener('mousemove', onMouseDrag)
      window.addEventListener('mouseup', onPointerUp)
      const coords = canvas.getBoundingClientRect()
      const px = (ev.touches[0].clientX - coords.x) / scale
      const py = (ev.touches[0].clientY - coords.y) / scale
      onPaint(px, py)
    }
    canvas.addEventListener('touchstart', onPointerStart)
    canvas.addEventListener('touchmove', onTouchMove)
    canvas.addEventListener('touchend', onPointerUp)
    canvas.onmouseenter = () => setShowBrush(true)
    canvas.onmouseleave = () => setShowBrush(false)
    canvas.onmousedown = onMouseDown

    return () => {
      canvas.removeEventListener('mousemove', onMouseDrag)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onPointerUp)
      canvas.removeEventListener('touchstart', onPointerStart)
      canvas.removeEventListener('touchmove', onTouchMove)
      canvas.removeEventListener('touchend', onPointerUp)
      canvas.onmouseenter = null
      canvas.onmouseleave = null
      canvas.onmousedown = null
    }
  }, [
    brushSize,
    context,
    file,
    draw,
    addLine,
    maskCanvas,
    image,
    currentEdit,
    firebase,
    scale,
    render,
    useHD,
    tool,
  ])

  // Handle Cmd+Z
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (edits.length < 2 && !currentEdit.lines.length) {
        return
      }
      const isCmdZ = (event.metaKey || event.ctrlKey) && event.key === 'z'
      if (isCmdZ) {
        event.preventDefault()
        undo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('keydown', handler)
    }
  }, [edits, currentEdit, undo])

  if (!image || !scale) {
    return <></>
  }

  function getCursor() {
    if (showBrush) {
      return 'none'
    }
    if (tool === 'zoom') {
      return 'grab'
    }
    return undefined
  }

  return (
    <>
      <TransformWrapper
        disabled={tool !== 'zoom'}
        // centerZoomedOut
        // alignmentAnimation={{ disabled: true }}
        centerOnInit
        // initialScale={scale}
        minScale={minScale}
        onZoom={ref => {
          console.log(ref.state.scale)
          setScale(ref.state.scale)
        }}
      >
        <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }}>
          <>
            <canvas
              className="rounded-sm"
              style={{ cursor: getCursor() }}
              ref={r => {
                if (r && !context) {
                  const ctx = r.getContext('2d')
                  if (ctx) {
                    setContext(ctx)
                  }
                }
              }}
            />
            <div
              className={[
                'absolute top-0 right-0 pointer-events-none',
                'overflow-hidden',
                'border-primary',
                showSeparator ? 'border-l-4' : '',
              ].join(' ')}
              style={{
                width: showOriginal
                  ? `${Math.round(image.naturalWidth)}px`
                  : '0px',
                height: image.naturalHeight,
                transitionProperty: 'width, height',
                transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
                transitionDuration: '300ms',
              }}
            >
              <img
                className="absolute right-0"
                src={image.src}
                alt="original"
                width={`${image.naturalWidth}px`}
                height={`${image.naturalHeight}px`}
                style={{
                  width: `${image.naturalWidth}px`,
                  height: `${image.naturalHeight}px`,
                  maxWidth: 'none',
                }}
              />
            </div>
          </>
        </TransformComponent>
      </TransformWrapper>

      {showBrush && tool === 'clean' && (
        <div
          className="hidden sm:block absolute rounded-full border border-primary bg-primary bg-opacity-80 pointer-events-none"
          style={{
            width: `${brushSize * scale}px`,
            height: `${brushSize * scale}px`,
            left: `${x}px`,
            top: `${y}px`,
            transform: 'translate(-50%, -50%)',
          }}
        />
      )}

      <div
        className="fixed w-full flex justify-center items-center bottom-0 bg-red"
        style={{
          // Center the action bar in the white area available.
          height: `${(window.innerHeight - image.naturalHeight * scale) / 2}px`,
        }}
      >
        <EditorToolSelector tool={tool} onChange={setTool} />
        {tool === 'clean' && (
          <CleanupTools
            editor={editor}
            brushSize={brushSize}
            setBrushSize={setBrushSize}
            isLoading={isInpaintingLoading}
            onCleanupClick={async () => {
              setIsInpaintingLoading(true)
              await render()
              setIsInpaintingLoading(false)
            }}
          />
        )}
        {tool === 'zoom' && (
          <ZoomTools
            zoom={scale}
            setZoom={setScale}
            onResetClick={async () => {
              // Pass
            }}
          />
        )}
      </div>
    </>
  )
}