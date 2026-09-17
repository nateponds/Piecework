import { useEffect, useMemo, useRef, useState } from 'react'
import { adjustPiecesForViewport, computeLayout, generateGridOptions } from './puzzleModel.js'
import { getIndexedDbItem, loadGameStateSync, saveGameState } from './storage.js'
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


const createInitialPieces = (grid, winW, winH) => {
  const { pieceSize, boardX, boardY } = computeLayout(grid, winW, winH)
  const list = []
  for (let i = 0; i < grid.count; i++) {
    const col = i % grid.cols
    const row = Math.floor(i / grid.cols)
    const x = boardX + col * pieceSize
    const y = boardY + row * pieceSize
    list.push({
      id: i,
      x,
      y,
      origX: x,
      origY: y,
      groupId: 0,
      zIndex: 1,
    })
  }
  return list
}


const computeGroupOffsets = (pieces, sidebarOpen, sidebarWidth, winW, pieceSize, isMobile) => {
  const offsetMap = new Map()
  if (!sidebarOpen || isMobile) return offsetMap

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

// Read saved state once on initial evaluation
const initialSaved = typeof window !== 'undefined' ? loadGameStateSync() : null

function App() {
  const [theme, setTheme] = useState(() => initialSaved?.theme || (typeof window !== 'undefined' ? localStorage.getItem('piecework-theme') || 'dark' : 'dark'))
  const [image, setImage] = useState(() => initialSaved?.image || DEFAULT_IMAGE)
  const [fileName, setFileName] = useState(() => initialSaved?.fileName || 'Mountain study')
  const [imageMeta, setImageMeta] = useState(() => initialSaved?.imageMeta || { width: 900, height: 900 })
  const [gridOptions, setGridOptions] = useState(() => initialSaved?.gridOptions || DEFAULT_GRID_OPTIONS)
  const [gridIndex, setGridIndex] = useState(() => (typeof initialSaved?.gridIndex === 'number' ? initialSaved.gridIndex : DEFAULT_GRID_INDEX))
  const grid = gridOptions[gridIndex] || DEFAULT_GRID_OPTIONS[DEFAULT_GRID_INDEX]
  const [moves, setMoves] = useState(() => initialSaved?.moves ?? 0)
  const [timed, setTimed] = useState(() => Boolean(initialSaved?.timed))
  const [duration, setDuration] = useState(() => initialSaved?.duration ?? 180)
  const [remaining, setRemaining] = useState(() => initialSaved?.remaining ?? 180)
  const [status, setStatus] = useState(() => initialSaved?.status || 'ready')
  const [showPreview, setShowPreview] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [showGuide, setShowGuide] = useState(() => initialSaved?.showGuide ?? true)
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const isMobileInit = typeof window !== 'undefined' && window.innerWidth < 768
    if (isMobileInit) return false
    return initialSaved?.status !== 'playing'
  })
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1200,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  })

  const [pieces, setPieces] = useState(() => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1200
    const h = typeof window !== 'undefined' ? window.innerHeight : 800
    const activeGridOptions = initialSaved?.gridOptions || DEFAULT_GRID_OPTIONS
    const activeGridIndex = typeof initialSaved?.gridIndex === 'number' ? initialSaved.gridIndex : DEFAULT_GRID_INDEX
    const activeGrid = activeGridOptions[activeGridIndex] || DEFAULT_GRID_OPTIONS[DEFAULT_GRID_INDEX]

    if (initialSaved?.pieces && initialSaved.pieces.length === activeGrid.count) {
      return adjustPiecesForViewport(initialSaved.pieces, activeGrid, w, h)
    }
    return createInitialPieces(activeGrid, w, h)
  })

  const [maxZ, setMaxZ] = useState(() => initialSaved?.maxZ ?? 10)
  const [activeGroup, setActiveGroup] = useState(null)
  const [activeGroupOffset, setActiveGroupOffset] = useState(0)

  const inputRef = useRef(null)
  const dragRef = useRef(null)
  const timers = useRef([])
  const isPlaying = status === 'playing'

  // Restore custom uploaded image from IndexedDB if offloaded
  useEffect(() => {
    if (initialSaved?.hasCustomImageInDb) {
      getIndexedDbItem('custom_image').then((customImg) => {
        if (customImg) {
          setImage(customImg)
        }
      })
    }
  }, [])

  // Keep a reference to latest state for synchronous persistence on page reload/visibilitychange
  const stateRef = useRef({})
  useEffect(() => {
    stateRef.current = {
      status,
      moves,
      timed,
      duration,
      remaining,
      theme,
      showGuide,
      fileName,
      imageMeta,
      gridIndex,
      gridOptions,
      maxZ,
      pieces,
      windowSize,
      image,
    }
  })

  const saveCurrentState = (overrides = {}) => {
    saveGameState({
      ...stateRef.current,
      ...overrides,
    })
  }

  // Persist game state before page unload or when switching apps on mobile
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveGameState(stateRef.current)
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveGameState(stateRef.current)
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  // Persist theme selection
  useEffect(() => {
    localStorage.setItem('piecework-theme', theme)
    saveCurrentState({ theme })
  }, [theme])

  // Track window resizing and keep board pieces properly aligned while preserving original spots
  useEffect(() => {
    const onResize = () => {
      const nextW = window.innerWidth
      const nextH = window.innerHeight
      setWindowSize({ width: nextW, height: nextH })
      setPieces((prev) => adjustPiecesForViewport(prev, grid, nextW, nextH))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [grid])

  const isMobile = windowSize.width < 768
  const { pieceSize, boardW, boardH, boardX, boardY } = computeLayout(
    grid,
    windowSize.width,
    windowSize.height
  )

  const sidebarWidth = Math.min(340, windowSize.width * 0.9)
  // On mobile screens, the drawer acts as an overlay sheet rather than shifting the board offscreen
  const boardShiftX = (sidebarOpen && !isMobile) ? sidebarWidth / 2 : 0

  const groupOffsets = useMemo(
    () => computeGroupOffsets(pieces, sidebarOpen, sidebarWidth, windowSize.width, pieceSize, isMobile),
    [pieces, sidebarOpen, sidebarWidth, windowSize.width, pieceSize, isMobile]
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


  // Timer effect with periodic auto-save
  useEffect(() => {
    if (!timed || !isPlaying) return
    const interval = window.setInterval(() => {
      setRemaining((value) => {
        if (value <= 1) {
          window.clearInterval(interval)
          setStatus('lost')
          saveCurrentState({ status: 'lost', remaining: 0 })
          return 0
        }
        const nextRemaining = value - 1
        if (nextRemaining % 5 === 0) {
          saveCurrentState({ remaining: nextRemaining })
        }
        return nextRemaining
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
    const marginX = 16
    const marginY = 56
    const maxScatterX = Math.max(marginX, windowSize.width - pieceSize - marginX)
    const maxScatterY = Math.max(marginY, windowSize.height - pieceSize - 24)

    for (let i = 0; i < grid.count; i++) {
      const randX = marginX + Math.random() * (maxScatterX - marginX)
      const randY = marginY + Math.random() * (maxScatterY - marginY)
      scattered.push({
        id: i,
        x: randX,
        y: randY,
        origX: randX,
        origY: randY,
        groupId: i + 1, // each starts as its own group
        zIndex: i + 2,
      })
    }

    const nextMaxZ = grid.count + 5
    setPieces(scattered)
    setMaxZ(nextMaxZ)
    setStatus('playing')

    saveCurrentState({
      pieces: scattered,
      moves: 0,
      remaining: duration,
      status: 'playing',
      maxZ: nextMaxZ,
    })
  }

  const resetPuzzle = (nextGrid = grid) => {
    timers.current.forEach(window.clearTimeout)
    const initial = createInitialPieces(nextGrid, windowSize.width, windowSize.height)
    setPieces(initial)
    setMoves(0)
    setRemaining(duration)
    setStatus('ready')

    saveCurrentState({
      pieces: initial,
      moves: 0,
      remaining: duration,
      status: 'ready',
    })
  }

  const setPuzzleSize = (nextIndex) => {
    setGridIndex(nextIndex)
    const nextGrid = gridOptions[nextIndex]
    timers.current.forEach(window.clearTimeout)
    const initial = createInitialPieces(nextGrid, windowSize.width, windowSize.height)
    setPieces(initial)
    setMoves(0)
    setRemaining(duration)
    setStatus('ready')

    saveCurrentState({
      gridIndex: nextIndex,
      pieces: initial,
      moves: 0,
      remaining: duration,
      status: 'ready',
    })
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
        const nextGrid = nextOptions[nextIndex]
        const nextMeta = { width: probe.naturalWidth, height: probe.naturalHeight }
        const nextFileName = file.name.replace(/\.[^.]+$/, '')
        const resetList = createInitialPieces(nextGrid, windowSize.width, windowSize.height)

        setImage(source)
        setFileName(nextFileName)
        setImageMeta(nextMeta)
        setGridOptions(nextOptions)
        setGridIndex(nextIndex)
        setPieces(resetList)
        setMoves(0)
        setRemaining(duration)
        setStatus('ready')

        saveCurrentState({
          image: source,
          fileName: nextFileName,
          imageMeta: nextMeta,
          gridOptions: nextOptions,
          gridIndex: nextIndex,
          pieces: resetList,
          status: 'ready',
          moves: 0,
          remaining: duration,
        })
      }
      probe.src = source
    }
    reader.readAsDataURL(file)
  }

  const toggleGuide = () => {
    setShowGuide((prev) => {
      const next = !prev
      saveCurrentState({ showGuide: next })
      return next
    })
  }

  // Pointer drag interactions
  const onPointerDown = (pieceId, event) => {
    if (!isPlaying && status !== 'ready') return
    if (event.button !== undefined && event.button !== 0) return
    event.preventDefault()
    const target = event.currentTarget
    try {
      target.setPointerCapture(event.pointerId)
    } catch {}

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
      target,
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
    if (!dragRef.current || (event && dragRef.current.pointerId !== event.pointerId)) return
    const { target, pointerId, groupId, moved, groupOffset = 0 } = dragRef.current
    try {
      target?.releasePointerCapture(pointerId)
    } catch {}
    dragRef.current = null
    setActiveGroup(null)
    setActiveGroupOffset(0)

    let nextMoves = moves
    if (moved) {
      nextMoves = moves + 1
      setMoves(nextMoves)
    }

    if (!isPlaying) {
      let updatedPieces = pieces
      if (moved) {
        updatedPieces = pieces.map((p) =>
          p.groupId === groupId ? { ...p, origX: p.x, origY: p.y } : p
        )
        setPieces(updatedPieces)
      }
      saveCurrentState({ pieces: updatedPieces, moves: nextMoves })
      return
    }

    // Perform snapping checks
    setPieces((currentPieces) => {
      const groupPieces = currentPieces.filter((p) => p.groupId === groupId)
      const snapThreshold = Math.max(26, pieceSize * 0.35)
      let snapDelta = null
      let snapTargetGroup = null

      const currentBoardShiftX = (sidebarOpen && !isMobile) ? sidebarWidth / 2 : 0

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

      let nextPieces = currentPieces
      let nextStatus = status

      // Apply snap if found
      if (snapDelta) {
        // Haptic feedback on mobile snap
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try { navigator.vibrate(25) } catch {}
        }

        const finalGroupId = snapTargetGroup !== null ? snapTargetGroup : groupId
        nextPieces = currentPieces.map((p) => {
          if (p.groupId === groupId) {
            const nextX = p.x + snapDelta.dx
            const nextY = p.y + snapDelta.dy
            return {
              ...p,
              x: nextX,
              y: nextY,
              origX: nextX,
              origY: nextY,
              groupId: finalGroupId,
            }
          }
          return p
        })

        // Check victory: all pieces belong to the same group or are correctly snapped
        const firstGroup = nextPieces[0]?.groupId
        const allConnected = nextPieces.every((p) => p.groupId === firstGroup)
        if (allConnected) {
          nextStatus = 'won'
          setStatus('won')
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            try { navigator.vibrate([40, 50, 70]) } catch {}
          }
        }
      } else if (moved) {
        // If not snapped but moved, update original spot to newly dropped position
        nextPieces = currentPieces.map((p) => {
          if (p.groupId === groupId) {
            return {
              ...p,
              origX: p.x,
              origY: p.y,
            }
          }
          return p
        })
      }

      saveCurrentState({
        pieces: nextPieces,
        moves: nextMoves,
        status: nextStatus,
        maxZ,
      })

      return nextPieces
    })
  }

  const pointerHandlersRef = useRef({ onPointerMove, onPointerUp })
  useEffect(() => {
    pointerHandlersRef.current = { onPointerMove, onPointerUp }
  })

  // Window-level event listener fallback for drag reliability on mobile & touch browsers
  useEffect(() => {
    if (activeGroup === null) return

    const handleWindowPointerMove = (e) => {
      if (!dragRef.current || dragRef.current.pointerId !== e.pointerId) return
      if (e.cancelable) e.preventDefault()
      pointerHandlersRef.current.onPointerMove(e)
    }

    const handleWindowPointerUp = (e) => {
      if (!dragRef.current || dragRef.current.pointerId !== e.pointerId) return
      pointerHandlersRef.current.onPointerUp(e)
    }

    window.addEventListener('pointermove', handleWindowPointerMove, { passive: false })
    window.addEventListener('pointerup', handleWindowPointerUp)
    window.addEventListener('pointercancel', handleWindowPointerUp)

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove)
      window.removeEventListener('pointerup', handleWindowPointerUp)
      window.removeEventListener('pointercancel', handleWindowPointerUp)
    }
  }, [activeGroup])

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
          <button
            className="hud-settings-toggle-btn"
            type="button"
            onClick={() => setSidebarOpen((prev) => !prev)}
            aria-label={sidebarOpen ? 'Close settings drawer' : 'Open settings drawer'}
            title={sidebarOpen ? 'Close settings' : 'Open settings'}
          >
            <span className="brand-mark">P</span>
            <span className="brand-name">Piecework</span>
            <span className="hud-gear-icon" aria-hidden="true">⚙️</span>
          </button>
        </div>

        {isPlaying && (
          <div className="hud-center">
            <span className="hud-stat">
              <span className="stat-label">Moves</span> <strong>{moves}</strong>
            </span>
            {timed && (
              <span className={`hud-stat ${remaining <= 10 ? 'urgent' : ''}`}>
                <span className="stat-label">Time</span> <strong>{formatTime(remaining)}</strong>
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
            <span className="btn-icon">{theme === 'dark' ? '☀️' : '🌙'}</span>
            <span className="btn-text">{theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>
          <button
            className={`hud-guide-btn ${showGuide ? 'active' : ''}`}
            type="button"
            onClick={toggleGuide}
            title="Toggle assembly board guide outline"
          >
            <span className="btn-icon">📐</span>
            <span className="btn-text">{showGuide ? 'Guide: On' : 'Guide: Off'}</span>
          </button>
          <button className="hud-preview-btn" type="button" onClick={() => setShowPreview(true)}>
            <span className="btn-icon">👁️</span>
            <span className="btn-text">Peek reference</span>
          </button>
          <button
            className="hud-about-btn"
            type="button"
            onClick={() => setShowAbout(true)}
            title="About the creators"
          >
            <span className="btn-icon">ℹ️</span>
            <span className="btn-text">About us</span>
          </button>
        </div>
      </header>

      {/* Mobile Backdrop for Settings Drawer */}
      {sidebarOpen && (
        <div
          className="drawer-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

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
                saveCurrentState({ timed: false })
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
                saveCurrentState({ timed: true })
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
                  onChange={(event) => {
                    const nextVal = Math.max(10, Number(event.target.value) || 10)
                    setDuration(nextVal)
                    saveCurrentState({ duration: nextVal })
                  }}
                />{' '}
                seconds
              </span>
            </label>
          )}
        </fieldset>

        <div className="drawer-actions-row">
          <button className="primary" type="button" onClick={startGame} disabled={status === 'shuffling'}>
            {isPlaying || status === 'won' || status === 'lost' ? 'Jumble again' : 'Jumble puzzle'} <span>→</span>
          </button>
          {isPlaying && (
            <button className="secondary-action-btn" type="button" onClick={() => resetPuzzle()}>
              Reset to solved
            </button>
          )}
        </div>
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
