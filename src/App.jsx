import { useEffect, useMemo, useRef, useState } from 'react'
import { generateGridOptions } from './puzzleModel.js'
import './App.css'

const DEFAULT_IMAGE = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 900"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#f5c975"/><stop offset="1" stop-color="#f4eee3"/></linearGradient></defs><rect width="900" height="900" fill="url(#sky)"/><circle cx="700" cy="190" r="86" fill="#fff4bf"/><path d="M0 590 210 345 390 525 555 270 900 610V900H0Z" fill="#49655d"/><path d="m390 525 165-255 100 148-49-18-51 52-55-36-64 167Z" fill="#f8f3e8"/><path d="M0 680c165-72 278-57 421 8 151 69 284 21 479-44v256H0Z" fill="#cf5d45"/><path d="M0 748c197-62 331-34 468 22 133 54 264 38 432-20v150H0Z" fill="#eaa85e"/><circle cx="175" cy="190" r="48" fill="#2f4b45" opacity=".85"/><path d="M175 230v210" stroke="#2f4b45" stroke-width="24"/></svg>`)}`

const closestGridIndex = (options, target = 100) => options.reduce((best, option, index) => Math.abs(option.count - target) < Math.abs(options[best].count - target) ? index : best, 0)
const DEFAULT_GRID_OPTIONS = generateGridOptions(900, 900)
const DEFAULT_GRID_INDEX = closestGridIndex(DEFAULT_GRID_OPTIONS)
const formatTime = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

const getSeam = (r1, c1, r2, c2) => {
  return ((r1 + 1) * 31 + (c1 + 1) * 17 + (r2 + 1) * 59 + (c2 + 1) * 83) % 2 === 0 ? 1 : -1
}

const getPieceEdges = (piece, rows, cols) => {
  const row = Math.floor(piece / cols)
  const col = piece % cols
  return {
    top: row === 0 ? 0 : -getSeam(row - 1, col, row, col),
    right: col === cols - 1 ? 0 : getSeam(row, col, row, col + 1),
    bottom: row === rows - 1 ? 0 : getSeam(row, col, row + 1, col),
    left: col === 0 ? 0 : -getSeam(row, col - 1, row, col),
  }
}

const generateEdgeSegment = (x1, y1, x2, y2, s) => {
  if (s === 0) return `L ${x2} ${y2}`

  const dx = x2 - x1
  const dy = y2 - y1
  const ux = dx / 100
  const uy = dy / 100
  const nx = -uy
  const ny = ux

  const pt = (u, v) => {
    const x = (x1 + u * ux + v * nx * s).toFixed(2)
    const y = (y1 + u * uy + v * ny * s).toFixed(2)
    return `${x} ${y}`
  }

  return [
    `L ${pt(35, 0)}`,
    `C ${pt(37, 0)}, ${pt(38.5, 3)}, ${pt(39.5, 5.5)}`,
    `C ${pt(41, 9)}, ${pt(33.5, 13)}, ${pt(34.5, 17.5)}`,
    `C ${pt(35.5, 22)}, ${pt(43, 23.5)}, ${pt(50, 23.5)}`,
    `C ${pt(57, 23.5)}, ${pt(64.5, 22)}, ${pt(65.5, 17.5)}`,
    `C ${pt(66.5, 13)}, ${pt(59, 9)}, ${pt(60.5, 5.5)}`,
    `C ${pt(61.5, 3)}, ${pt(63, 0)}, ${pt(65, 0)}`,
    `L ${pt(100, 0)}`,
  ].join(' ')
}

const getPiecePath = ({ top, right, bottom, left }) => {
  return [
    'M 0 0',
    generateEdgeSegment(0, 0, 100, 0, top),
    generateEdgeSegment(100, 0, 100, 100, right),
    generateEdgeSegment(100, 100, 0, 100, bottom),
    generateEdgeSegment(0, 100, 0, 0, left),
    'Z',
  ].join(' ')
}

function JigsawPiece({ piece, grid, image, instanceKey }) {
  const { rows, cols } = grid
  const row = Math.floor(piece / cols)
  const col = piece % cols
  const path = getPiecePath(getPieceEdges(piece, rows, cols))
  const clipId = `clip-${instanceKey}-${rows}-${cols}-${piece}`.replace(/[^a-zA-Z0-9-_]/g, '-')
  return (
    <svg className="jigsaw-svg" viewBox="-25 -25 150 150" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
          <path d={path} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <image
          href={image}
          x={-col * 100}
          y={-row * 100}
          width={cols * 100}
          height={rows * 100}
          preserveAspectRatio="none"
        />
        <path className="piece-shade" d={path} />
        <path className="piece-inner-bevel" d={path} />
      </g>
      <path className="piece-outline" d={path} />
    </svg>
  )
}

const computeLayout = (grid, winW, winH) => {
  const availW = Math.max(200, winW * 0.82)
  const availH = Math.max(200, winH * 0.78)
  const pieceSize = Math.max(28, Math.min(availW / grid.cols, availH / grid.rows, 160))
  const boardW = grid.cols * pieceSize
  const boardH = grid.rows * pieceSize
  const boardX = (winW - boardW) / 2
  const boardY = (winH - boardH) / 2 + 10
  return { pieceSize, boardW, boardH, boardX, boardY }
}

const createInitialPieces = (grid, winW, winH) => {
  const { pieceSize, boardX, boardY } = computeLayout(grid, winW, winH)
  const list = []
  for (let i = 0; i < grid.count; i++) {
    const col = i % grid.cols
    const row = Math.floor(i / grid.cols)
    list.push({
      id: i,
      x: boardX + col * pieceSize,
      y: boardY + row * pieceSize,
      groupId: 0,
      zIndex: 1,
    })
  }
  return list
}

const computeGroupOffsets = (pieces, sidebarOpen, sidebarWidth, winW, pieceSize) => {
  const offsetMap = new Map()
  if (!sidebarOpen) return offsetMap

  const clearance = sidebarWidth + 20
  const maxW = Math.max(clearance + 80, winW - pieceSize - 20)

  // Group pieces by groupId
  const groupMap = new Map()
  for (const p of pieces) {
    if (!groupMap.has(p.groupId)) {
      groupMap.set(p.groupId, [])
    }
    groupMap.get(p.groupId).push(p)
  }

  for (const [groupId, groupPieces] of groupMap.entries()) {
    // Solved board group (groupId === 0) moves in sync with the board guide outline
    if (groupId === 0) {
      offsetMap.set(groupId, sidebarWidth / 2)
      continue
    }

    let minX = Infinity
    for (const p of groupPieces) {
      if (p.x < minX) minX = p.x
    }

    const t = Math.max(0, Math.min(1, minX / maxW))
    const offset = clearance * (1 - t)
    const finalOffset = Math.max(offset, minX < clearance ? clearance - minX : 0)

    offsetMap.set(groupId, Math.round(finalOffset))
  }

  return offsetMap
}

function App() {
  const [theme, setTheme] = useState(() => (typeof window !== 'undefined' ? localStorage.getItem('piecework-theme') || 'dark' : 'dark'))
  const [image, setImage] = useState(DEFAULT_IMAGE)
  const [fileName, setFileName] = useState('Mountain study')
  const [imageMeta, setImageMeta] = useState({ width: 900, height: 900 })
  const [gridOptions, setGridOptions] = useState(DEFAULT_GRID_OPTIONS)
  const [gridIndex, setGridIndex] = useState(DEFAULT_GRID_INDEX)
  const grid = gridOptions[gridIndex]
  const [moves, setMoves] = useState(0)
  const [timed, setTimed] = useState(false)
  const [duration, setDuration] = useState(180)
  const [remaining, setRemaining] = useState(180)
  const [status, setStatus] = useState('ready')
  const [showPreview, setShowPreview] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [showGuide, setShowGuide] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1200,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  })

  const [pieces, setPieces] = useState(() => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1200
    const h = typeof window !== 'undefined' ? window.innerHeight : 800
    return createInitialPieces(DEFAULT_GRID_OPTIONS[DEFAULT_GRID_INDEX], w, h)
  })
  const [maxZ, setMaxZ] = useState(10)
  const [activeGroup, setActiveGroup] = useState(null)
  const [activeGroupOffset, setActiveGroupOffset] = useState(0)

  const inputRef = useRef(null)
  const dragRef = useRef(null)
  const timers = useRef([])
  const isPlaying = status === 'playing'

  // Persist theme selection
  useEffect(() => {
    localStorage.setItem('piecework-theme', theme)
  }, [theme])

  // Track window resizing
  useEffect(() => {
    const onResize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const { pieceSize, boardW, boardH, boardX, boardY } = computeLayout(
    grid,
    windowSize.width,
    windowSize.height
  )

  const sidebarWidth = Math.min(340, windowSize.width * 0.9)
  const boardShiftX = sidebarOpen ? sidebarWidth / 2 : 0

  const groupOffsets = useMemo(
    () => computeGroupOffsets(pieces, sidebarOpen, sidebarWidth, windowSize.width, pieceSize),
    [pieces, sidebarOpen, sidebarWidth, windowSize.width, pieceSize]
  )

  const getPieceRenderPos = (p) => {
    const isDragging = activeGroup !== null && p.groupId === activeGroup
    const offset = isDragging ? activeGroupOffset : (groupOffsets.get(p.groupId) || 0)
    return {
      x: p.x + offset,
      y: p.y,
    }
  }

  const getTargetPos = (id) => {
    const col = id % grid.cols
    const row = Math.floor(id / grid.cols)
    return {
      x: boardX + col * pieceSize,
      y: boardY + row * pieceSize,
    }
  }

  // Reset pieces to solved positions
  const resetPieces = (nextGrid = grid, winW = windowSize.width, winH = windowSize.height) => {
    setPieces(createInitialPieces(nextGrid, winW, winH))
  }

  // Timer effect
  useEffect(() => {
    if (!timed || !isPlaying) return
    const interval = window.setInterval(() => {
      setRemaining((value) => {
        if (value <= 1) {
          window.clearInterval(interval)
          setStatus('lost')
          return 0
        }
        return value - 1
      })
    }, 1000)
    return () => window.clearInterval(interval)
  }, [timed, isPlaying])

  const startGame = () => {
    timers.current.forEach(window.clearTimeout)
    setSidebarOpen(false)
    setMoves(0)
    setRemaining(duration)

    // Scatter pieces naturally across the screen
    const scattered = []
    const marginX = 20
    const marginY = 60
    const maxScatterX = Math.max(marginX, windowSize.width - pieceSize - marginX)
    const maxScatterY = Math.max(marginY, windowSize.height - pieceSize - 30)

    for (let i = 0; i < grid.count; i++) {
      const randX = marginX + Math.random() * (maxScatterX - marginX)
      const randY = marginY + Math.random() * (maxScatterY - marginY)
      scattered.push({
        id: i,
        x: randX,
        y: randY,
        groupId: i + 1, // each starts as its own group
        zIndex: i + 2,
      })
    }

    setPieces(scattered)
    setMaxZ(grid.count + 5)
    setStatus('playing')
  }

  const resetPuzzle = (nextGrid = grid) => {
    timers.current.forEach(window.clearTimeout)
    resetPieces(nextGrid)
    setMoves(0)
    setRemaining(duration)
    setStatus('ready')
  }

  const setPuzzleSize = (nextIndex) => {
    setGridIndex(nextIndex)
    resetPuzzle(gridOptions[nextIndex])
  }

  const loadImage = (event) => {
    const file = event.target.files?.[0]
    if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return
    const reader = new FileReader()
    reader.onload = () => {
      const source = reader.result
      const probe = new window.Image()
      probe.onload = () => {
        const nextOptions = generateGridOptions(probe.naturalWidth, probe.naturalHeight)
        const nextIndex = closestGridIndex(nextOptions)
        setImage(source)
        setFileName(file.name.replace(/\.[^.]+$/, ''))
        setImageMeta({ width: probe.naturalWidth, height: probe.naturalHeight })
        setGridOptions(nextOptions)
        setGridIndex(nextIndex)
        resetPuzzle(nextOptions[nextIndex])
      }
      probe.src = source
    }
    reader.readAsDataURL(file)
  }

  // Pointer drag interactions
  const onPointerDown = (pieceId, event) => {
    if (!isPlaying && status !== 'ready') return
    event.preventDefault()
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)

    const piece = pieces.find((p) => p.id === pieceId)
    if (!piece) return

    const group = pieces.filter((p) => p.groupId === piece.groupId)
    const newZ = maxZ + 1
    setMaxZ(newZ)

    // Bring whole group to front
    setPieces((prev) =>
      prev.map((p) => (p.groupId === piece.groupId ? { ...p, zIndex: newZ } : p))
    )

    const initialPositions = new Map(group.map((p) => [p.id, { x: p.x, y: p.y }]))
    const currentOffset = groupOffsets.get(piece.groupId) || 0

    setActiveGroup(piece.groupId)
    setActiveGroupOffset(currentOffset)

    dragRef.current = {
      pointerId: event.pointerId,
      pieceId,
      groupId: piece.groupId,
      startX: event.clientX,
      startY: event.clientY,
      initialPositions,
      groupOffset: currentOffset,
      moved: false,
    }
  }

  const onPointerMove = (event) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return
    const { startX, startY, groupId, initialPositions } = dragRef.current
    const dx = event.clientX - startX
    const dy = event.clientY - startY

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      dragRef.current.moved = true
    }

    setPieces((prev) =>
      prev.map((p) => {
        if (p.groupId === groupId) {
          const init = initialPositions.get(p.id)
          if (init) {
            return {
              ...p,
              x: init.x + dx,
              y: init.y + dy,
            }
          }
        }
        return p
      })
    )
  }

  const onPointerUp = (event) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return
    const { groupId, moved, groupOffset = 0 } = dragRef.current
    dragRef.current = null
    setActiveGroup(null)
    setActiveGroupOffset(0)

    if (moved) {
      setMoves((m) => m + 1)
    }

    if (!isPlaying) return

    // Perform snapping checks
    setPieces((currentPieces) => {
      const groupPieces = currentPieces.filter((p) => p.groupId === groupId)
      const snapThreshold = Math.max(22, pieceSize * 0.32)
      let snapDelta = null
      let snapTargetGroup = null

      const currentBoardShiftX = sidebarOpen ? sidebarWidth / 2 : 0

      // 1. Check snap to target board position
      for (const p of groupPieces) {
        const target = getTargetPos(p.id)
        const pVisualX = p.x + groupOffset
        const targetVisualX = target.x + currentBoardShiftX
        const dist = Math.hypot(pVisualX - targetVisualX, p.y - target.y)
        if (dist < snapThreshold) {
          snapDelta = { dx: target.x - p.x, dy: target.y - p.y }
          snapTargetGroup = 0 // Snap to the master board group
          break
        }
      }

      // 2. If not snapped to board, check snap to any neighbor piece on the table
      if (!snapDelta) {
        for (const p of groupPieces) {
          const pCol = p.id % grid.cols
          const pRow = Math.floor(p.id / grid.cols)

          // Check all 4 orthogonal neighbors
          const neighbors = [
            { id: p.id - 1, valid: pCol > 0, expDx: -pieceSize, expDy: 0 },
            { id: p.id + 1, valid: pCol < grid.cols - 1, expDx: pieceSize, expDy: 0 },
            { id: p.id - grid.cols, valid: pRow > 0, expDx: 0, expDy: -pieceSize },
            { id: p.id + grid.cols, valid: pRow < grid.rows - 1, expDx: 0, expDy: pieceSize },
          ]

          for (const nInfo of neighbors) {
            if (!nInfo.valid) continue
            const neighbor = currentPieces.find((item) => item.id === nInfo.id)
            if (neighbor && neighbor.groupId !== groupId) {
              const neighborOffset = groupOffsets.get(neighbor.groupId) || 0
              const pVisualX = p.x + groupOffset
              const neighborVisualX = neighbor.x + neighborOffset
              const expectedVisualX = neighborVisualX - nInfo.expDx
              const expectedVisualY = neighbor.y - nInfo.expDy
              const dist = Math.hypot(pVisualX - expectedVisualX, p.y - expectedVisualY)
              if (dist < snapThreshold) {
                snapDelta = {
                  dx: neighbor.x - nInfo.expDx - p.x,
                  dy: expectedVisualY - p.y,
                }
                snapTargetGroup = neighbor.groupId
                break
              }
            }
          }
          if (snapDelta) break
        }
      }

      // Apply snap if found
      if (snapDelta) {
        const finalGroupId = snapTargetGroup !== null ? snapTargetGroup : groupId
        const nextPieces = currentPieces.map((p) => {
          if (p.groupId === groupId) {
            return {
              ...p,
              x: p.x + snapDelta.dx,
              y: p.y + snapDelta.dy,
              groupId: finalGroupId,
            }
          }
          return p
        })

        // Check victory: all pieces belong to the same group or are correctly snapped
        const firstGroup = nextPieces[0]?.groupId
        const allConnected = nextPieces.every((p) => p.groupId === firstGroup)
        if (allConnected) {
          setStatus('won')
        }

        return nextPieces
      }

      return currentPieces
    })
  }

  return (
    <main
      className={`natural-jigsaw-canvas theme-${theme}`}
      data-theme={theme}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* Floating HUD Bar */}
      <header className="floating-hud">
        <div className="hud-left">
          <span className="brand-mark">P</span>
          <span className="brand-name">Piecework</span>
        </div>

        {isPlaying && (
          <div className="hud-center">
            <span className="hud-stat">
              Moves <strong>{moves}</strong>
            </span>
            {timed && (
              <span className={`hud-stat ${remaining <= 10 ? 'urgent' : ''}`}>
                Time <strong>{formatTime(remaining)}</strong>
              </span>
            )}
          </div>
        )}

        <div className="hud-right">
          <button
            className="hud-theme-btn"
            type="button"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
          </button>
          <button
            className={`hud-guide-btn ${showGuide ? 'active' : ''}`}
            type="button"
            onClick={() => setShowGuide((prev) => !prev)}
            title="Toggle assembly board guide outline"
          >
            {showGuide ? 'Guide: On' : 'Guide: Off'}
          </button>
          <button className="hud-preview-btn" type="button" onClick={() => setShowPreview(true)}>
            Peek reference
          </button>
          <button
            className="hud-about-btn"
            type="button"
            onClick={() => setShowAbout(true)}
            title="About the creators"
          >
            About us
          </button>
        </div>
      </header>

      {/* Center Left Arrow Toggle */}
      <button
        type="button"
        className={`sidebar-arrow-toggle ${sidebarOpen ? 'open' : 'closed'}`}
        onClick={() => setSidebarOpen((prev) => !prev)}
        aria-label={sidebarOpen ? 'Close settings drawer' : 'Open settings drawer'}
        title={sidebarOpen ? 'Hide settings' : 'Puzzle settings'}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {sidebarOpen ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
        </svg>
      </button>

      {/* Flyout Settings Drawer */}
      <aside className={`controls-drawer ${sidebarOpen ? 'open' : 'closed'}`} aria-label="Puzzle settings">
        <div className="controls-header">
          <div className="eyebrow">Puzzle setup</div>
          <button
            type="button"
            className="close-sidebar-btn"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
            title="Close sidebar"
          >
            ✕
          </button>
        </div>
        <h1>Make the pieces yours.</h1>
        <p className="intro">Upload a PNG, JPEG, or WebP. Your image stays in this browser.</p>
        <button className="upload" type="button" onClick={() => inputRef.current?.click()}>
          <span className="upload-icon">↥</span>
          <span>
            <strong>Choose an image</strong>
            <small>PNG, JPEG or WEBP</small>
          </span>
        </button>
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={loadImage} hidden />
        <div className="filename">
          <span className="dot" />
          {fileName}
        </div>

        <fieldset className="size-fieldset">
          <div className="size-heading">
            <span className="fieldset-label">Puzzle size</span>
            <strong>{grid.count} pieces</strong>
          </div>
          <input
            className="piece-slider"
            type="range"
            min="0"
            max={gridOptions.length - 1}
            step="1"
            value={gridIndex}
            style={{ '--slider-progress': `${(gridIndex / Math.max(1, gridOptions.length - 1)) * 100}%` }}
            onChange={(event) => setPuzzleSize(Number(event.target.value))}
            aria-label="Number of puzzle pieces"
            aria-valuetext={`${grid.count} pieces in ${grid.rows} rows by ${grid.cols} columns`}
          />
          <div className="slider-meta">
            <span>
              {grid.rows} rows × {grid.cols} columns
            </span>
            <span>
              {gridOptions[0].count}–{gridOptions.at(-1).count}
            </span>
          </div>
          <p className="ratio-note">Based on {imageMeta.width} × {imageMeta.height}px image ratio</p>
          {grid.count >= 500 && <p className="size-warning">Large puzzles may take longer to arrange.</p>}
        </fieldset>

        <fieldset>
          <legend>Challenge mode</legend>
          <div className="mode-row">
            <button
              type="button"
              className={!timed ? 'active' : ''}
              onClick={() => {
                setTimed(false)
                resetPuzzle()
              }}
            >
              No timer
            </button>
            <button
              type="button"
              className={timed ? 'active' : ''}
              onClick={() => {
                setTimed(true)
                resetPuzzle()
              }}
            >
              Timed
            </button>
          </div>
          {timed && (
            <label className="time-control">
              Time limit{' '}
              <span>
                <input
                  type="number"
                  min="10"
                  max="3600"
                  value={duration}
                  onChange={(event) => setDuration(Math.max(10, Number(event.target.value) || 10))}
                />{' '}
                seconds
              </span>
            </label>
          )}
        </fieldset>

        <button className="primary" type="button" onClick={startGame} disabled={status === 'shuffling'}>
          {isPlaying || status === 'won' || status === 'lost' ? 'Jumble again' : 'Jumble puzzle'} <span>→</span>
        </button>
        <p className="hint">Drag pieces freely across the table. Matching pieces snap together naturally.</p>
        <div className="drawer-about-section">
          <button type="button" className="drawer-about-btn" onClick={() => setShowAbout(true)}>
            <span>About the creators</span>
            <span className="creator-names-chip">Nate &amp; Swashua ↗</span>
          </button>
        </div>
      </aside>

      {/* Assembly Board Guide Outline */}
      {showGuide && (
        <div
          className="board-guide-outline"
          style={{
            left: `${boardX}px`,
            top: `${boardY}px`,
            width: `${boardW}px`,
            height: `${boardH}px`,
            transform: `translateX(${boardShiftX}px)`,
          }}
        >
          <div className="guide-inner-grid" />
        </div>
      )}

      {/* Freeform Pieces Canvas */}
      <div className="pieces-table-surface">
        {pieces.map((p) => {
          const isGroupActive = activeGroup !== null && p.groupId === activeGroup
          const pos = getPieceRenderPos(p)
          return (
            <div
              key={`piece-${p.id}`}
              className={`freeform-piece-wrapper ${isGroupActive ? 'dragging' : ''}`}
              style={{
                transform: `translate(${pos.x}px, ${pos.y}px)`,
                width: `${pieceSize}px`,
                height: `${pieceSize}px`,
                zIndex: p.zIndex,
              }}
              onPointerDown={(event) => onPointerDown(p.id, event)}
            >
              <JigsawPiece piece={p.id} grid={grid} image={image} instanceKey={`p-${p.id}`} />
            </div>
          )
        })}
      </div>

      {/* Solved Victory Overlay */}
      {(status === 'won' || status === 'lost') && (
        <div className="result-card">
          <span>{status === 'won' ? 'Solved!' : 'Time is up'}</span>
          <strong>
            {status === 'won'
              ? `${moves} moves${timed ? ` · ${formatTime(remaining)} left` : ''}`
              : 'The picture is waiting.'}
          </strong>
          <button type="button" onClick={startGame}>
            Jumble again
          </button>
        </div>
      )}

      {/* Reference Image Preview */}
      {showPreview && (
        <div
          className="preview-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Original image preview"
          onClick={() => setShowPreview(false)}
        >
          <img src={image} alt="Original puzzle reference" />
          <p>Click to return</p>
        </div>
      )}

      {/* About Us Modal */}
      {showAbout && (
        <div
          className="about-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="About the creators"
          onClick={() => setShowAbout(false)}
        >
          <div className="about-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="about-header">
              <span className="about-badge">About Us</span>
              <button
                type="button"
                className="about-close-btn"
                onClick={() => setShowAbout(false)}
                aria-label="Close about modal"
                title="Close"
              >
                ✕
              </button>
            </div>

            <h2>Built with passion by two friends.</h2>
            <p className="about-intro">
              We created this project to bring the physical, tactile magic of classic jigsaw puzzles
              to the browser with mathematical interlocking tab shapes, natural cluster snapping,
              and a freeform table you can make entirely your own.
            </p>

            <div className="creators-grid">
              <a
                href="https://github.com/nateponds"
                target="_blank"
                rel="noopener noreferrer"
                className="creator-card"
                title="Visit Nate Ponds on GitHub"
              >
                <img
                  src="https://github.com/nateponds.png"
                  alt="Nate Ponds"
                  className="creator-avatar"
                />
                <div className="creator-info">
                  <div className="creator-name">Nate Ponds</div>
                  <div className="creator-handle">@nateponds</div>
                  <div className="creator-role">Co-Creator &amp; Developer</div>
                </div>
                <span className="creator-gh-btn">GitHub ↗</span>
              </a>

              <a
                href="https://github.com/Swashua"
                target="_blank"
                rel="noopener noreferrer"
                className="creator-card"
                title="Visit Swashua on GitHub"
              >
                <img
                  src="https://github.com/Swashua.png"
                  alt="Swashua"
                  className="creator-avatar"
                />
                <div className="creator-info">
                  <div className="creator-name">Swashua</div>
                  <div className="creator-handle">@Swashua</div>
                  <div className="creator-role">Co-Creator &amp; Developer</div>
                </div>
                <span className="creator-gh-btn">GitHub ↗</span>
              </a>
            </div>

            <div className="about-footer">
              <button type="button" className="about-done-btn" onClick={() => setShowAbout(false)}>
                Back to Puzzle
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

export default App
