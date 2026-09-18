import { useEffect, useMemo, useRef, useState } from 'react'
import {
  computeLayout,
  generateGridOptions,
  generateRandomSeed,
  getPieceEdges,
  getPiecePath,
} from './puzzleModel.js'
import { getIndexedDbItem, loadGameStateSync, saveGameState } from './storage.js'
import {
  IconArrowRight,
  IconCheck,
  IconClose,
  IconCopy,
  IconExternalLink,
  IconEye,
  IconGear,
  IconGrid,
  IconInfo,
  IconMail,
  IconMoon,
  IconReport,
  IconSun,
  IconUpload,
} from './Icons.jsx'
import './App.css'

const DEFAULT_IMAGE = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 900"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#f5c975"/><stop offset="1" stop-color="#f4eee3"/></linearGradient></defs><rect width="900" height="900" fill="url(#sky)"/><circle cx="700" cy="190" r="86" fill="#fff4bf"/><path d="M0 590 210 345 390 525 555 270 900 610V900H0Z" fill="#49655d"/><path d="m390 525 165-255 100 148-49-18-51 52-55-36-64 167Z" fill="#f8f3e8"/><path d="M0 680c165-72 278-57 421 8 151 69 284 21 479-44v256H0Z" fill="#cf5d45"/><path d="M0 748c197-62 331-34 468 22 133 54 264 38 432-20v150H0Z" fill="#eaa85e"/><circle cx="175" cy="190" r="48" fill="#2f4b45" opacity=".85"/><path d="M175 230v210" stroke="#2f4b45" stroke-width="24"/></svg>`)}`

const closestGridIndex = (options, target = 100) => options.reduce((best, option, index) => Math.abs(option.count - target) < Math.abs(options[best].count - target) ? index : best, 0)
const DEFAULT_GRID_OPTIONS = generateGridOptions(900, 900)
const DEFAULT_GRID_INDEX = closestGridIndex(DEFAULT_GRID_OPTIONS)
const formatTime = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

function JigsawPiece({ piece, grid, image, seed, instanceKey }) {
  const { rows, cols } = grid
  const row = Math.floor(piece / cols)
  const col = piece % cols
  const path = getPiecePath(getPieceEdges(piece, rows, cols, seed))
  const clipId = `clip-${instanceKey}-${rows}-${cols}-${seed}-${piece}`.replace(/[^a-zA-Z0-9-_]/g, '-')
  return (
    <svg className="jigsaw-svg" viewBox="-25 -25 150 150" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
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
      isOnBoard: true,
    })
  }
  return list
}


const computeGroupOffsets = (pieces, sidebarOpen, sidebarWidth, winW, pieceSize, isMobile, grid, boardX, boardY) => {
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
    // Check if group is positioned on the board
    const isGroupOnBoard = groupId === 0 || (
      groupPieces.length > 0 && groupPieces.every((p) => Boolean(p.isOnBoard))
    ) || (
      grid && boardX !== undefined && groupPieces.length > 0 && groupPieces.every((p) => {
        const col = p.id % grid.cols
        const row = Math.floor(p.id / grid.cols)
        const targetX = boardX + col * pieceSize
        const targetY = boardY + row * pieceSize
        return Math.hypot(p.x - targetX, p.y - targetY) < 2
      })
    )

    if (isGroupOnBoard) {
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
  const [showReport, setShowReport] = useState(false)
  const [copiedEmail, setCopiedEmail] = useState(false)

  const handleCopyEmail = () => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText('23200114@usc.edu.ph')
      setCopiedEmail(true)
      setTimeout(() => setCopiedEmail(false), 2000)
    }
  }
  const [showGuide, setShowGuide] = useState(() => initialSaved?.showGuide ?? true)
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const isMobileInit = typeof window !== 'undefined' && window.innerWidth < 768
    if (isMobileInit) return false
    return initialSaved?.status !== 'playing'
  })
  const [windowSize, setWindowSize] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1200,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  }))

  const [baseViewport, setBaseViewport] = useState(() => ({
    width: initialSaved?.windowSize?.width || (typeof window !== 'undefined' ? window.innerWidth : 1200),
    height: initialSaved?.windowSize?.height || (typeof window !== 'undefined' ? window.innerHeight : 800),
  }))

  const [pieces, setPieces] = useState(() => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1200
    const h = typeof window !== 'undefined' ? window.innerHeight : 800
    const activeGridOptions = initialSaved?.gridOptions || DEFAULT_GRID_OPTIONS
    const activeGridIndex = typeof initialSaved?.gridIndex === 'number' ? initialSaved.gridIndex : DEFAULT_GRID_INDEX
    const activeGrid = activeGridOptions[activeGridIndex] || DEFAULT_GRID_OPTIONS[DEFAULT_GRID_INDEX]

    if (initialSaved?.pieces && initialSaved.pieces.length === activeGrid.count) {
      const savedW = initialSaved?.windowSize?.width || w
      const savedH = initialSaved?.windowSize?.height || h
      const savedLayout = computeLayout(activeGrid, savedW, savedH)
      const currentBoardX = Math.round((w - savedLayout.boardW) / 2)
      const currentBoardY = Math.round((h - savedLayout.boardH) / 2 + 10)
      const deltaX = currentBoardX - savedLayout.boardX
      const deltaY = currentBoardY - savedLayout.boardY

      return initialSaved.pieces.map((p) => ({
        ...p,
        x: p.x + deltaX,
        y: p.y + deltaY,
        origX: (p.origX ?? p.x) + deltaX,
        origY: (p.origY ?? p.y) + deltaY,
      }))
    }
    return createInitialPieces(activeGrid, w, h)
  })

  const [seed, setSeed] = useState(() => (typeof initialSaved?.seed === 'number' ? initialSaved.seed : generateRandomSeed()))
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
      seed,
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

  const baseLayout = useMemo(
    () => computeLayout(grid, baseViewport.width, baseViewport.height),
    [grid, baseViewport.width, baseViewport.height]
  )

  const pieceSize = baseLayout.pieceSize
  const boardW = grid.cols * pieceSize
  const boardH = grid.rows * pieceSize
  const boardX = Math.round((windowSize.width - boardW) / 2)
  const boardY = Math.round((windowSize.height - boardH) / 2 + 10)

  const lastBoardRef = useRef({ boardX, boardY })
  const [isResizing, setIsResizing] = useState(false)
  const resizeTimeoutRef = useRef(null)

  useEffect(() => {
    lastBoardRef.current = { boardX, boardY }
  }, [boardX, boardY])

  // Track window resizing and keep board and all pieces centered together without jumbling or stacking
  useEffect(() => {
    const onResize = () => {
      const nextW = window.innerWidth
      const nextH = window.innerHeight
      const newBoardX = Math.round((nextW - boardW) / 2)
      const newBoardY = Math.round((nextH - boardH) / 2 + 10)
      const deltaX = newBoardX - lastBoardRef.current.boardX
      const deltaY = newBoardY - lastBoardRef.current.boardY

      lastBoardRef.current = { boardX: newBoardX, boardY: newBoardY }
      setIsResizing(true)
      if (resizeTimeoutRef.current) window.clearTimeout(resizeTimeoutRef.current)
      resizeTimeoutRef.current = window.setTimeout(() => setIsResizing(false), 150)

      setWindowSize({ width: nextW, height: nextH })

      if (deltaX !== 0 || deltaY !== 0) {
        setPieces((prev) =>
          prev.map((p) => ({
            ...p,
            x: p.x + deltaX,
            y: p.y + deltaY,
            origX: (p.origX ?? p.x) + deltaX,
            origY: (p.origY ?? p.y) + deltaY,
          }))
        )
      }
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      if (resizeTimeoutRef.current) window.clearTimeout(resizeTimeoutRef.current)
    }
  }, [boardW, boardH])

  const isMobile = windowSize.width < 768

  const sidebarWidth = Math.min(340, windowSize.width * 0.9)
  // On mobile screens, the drawer acts as an overlay sheet rather than shifting the board offscreen
  const boardShiftX = (sidebarOpen && !isMobile) ? sidebarWidth / 2 : 0

  const groupOffsets = useMemo(
    () => computeGroupOffsets(pieces, sidebarOpen, sidebarWidth, windowSize.width, pieceSize, isMobile, grid, boardX, boardY),
    [pieces, sidebarOpen, sidebarWidth, windowSize.width, pieceSize, isMobile, grid, boardX, boardY]
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
    const nextSeed = generateRandomSeed()
    setSeed(nextSeed)

    const curW = windowSize.width
    const curH = windowSize.height
    setBaseViewport({ width: curW, height: curH })
    const freshLayout = computeLayout(grid, curW, curH)
    const curPieceSize = freshLayout.pieceSize
    const curBoardW = grid.cols * curPieceSize
    const curBoardH = grid.rows * curPieceSize
    const curBoardX = Math.round((curW - curBoardW) / 2)
    const curBoardY = Math.round((curH - curBoardH) / 2 + 10)
    lastBoardRef.current = { boardX: curBoardX, boardY: curBoardY }

    // Scatter pieces naturally across the screen
    const scattered = []
    const marginX = 16
    const marginY = 56
    const maxScatterX = Math.max(marginX, curW - curPieceSize - marginX)
    const maxScatterY = Math.max(marginY, curH - curPieceSize - 24)

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
        isOnBoard: false,
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
      seed: nextSeed,
    })
  }

  const resetPuzzle = (nextGrid = grid) => {
    timers.current.forEach(window.clearTimeout)
    const curW = windowSize.width
    const curH = windowSize.height
    setBaseViewport({ width: curW, height: curH })
    const freshLayout = computeLayout(nextGrid, curW, curH)
    lastBoardRef.current = { boardX: freshLayout.boardX, boardY: freshLayout.boardY }
    const initial = createInitialPieces(nextGrid, curW, curH)
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
    const curW = windowSize.width
    const curH = windowSize.height
    setBaseViewport({ width: curW, height: curH })
    const freshLayout = computeLayout(nextGrid, curW, curH)
    lastBoardRef.current = { boardX: freshLayout.boardX, boardY: freshLayout.boardY }
    const initial = createInitialPieces(nextGrid, curW, curH)
    const nextSeed = generateRandomSeed()
    setSeed(nextSeed)
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
      seed: nextSeed,
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
        const curW = windowSize.width
        const curH = windowSize.height
        setBaseViewport({ width: curW, height: curH })
        const freshLayout = computeLayout(nextGrid, curW, curH)
        lastBoardRef.current = { boardX: freshLayout.boardX, boardY: freshLayout.boardY }
        const resetList = createInitialPieces(nextGrid, curW, curH)
        const nextSeed = generateRandomSeed()

        setImage(source)
        setFileName(nextFileName)
        setImageMeta(nextMeta)
        setGridOptions(nextOptions)
        setGridIndex(nextIndex)
        setSeed(nextSeed)
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
          seed: nextSeed,
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
          p.groupId === groupId ? { ...p, origX: p.x, origY: p.y, isOnBoard: false } : p
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
      let isBoardSnap = false
      let tableSnapTargetGroupId = null

      const currentBoardShiftX = (sidebarOpen && !isMobile) ? sidebarWidth / 2 : 0

      // 1. Check snap to target board position
      for (const p of groupPieces) {
        const target = getTargetPos(p.id)
        const pVisualX = p.x + groupOffset
        const targetVisualX = target.x + currentBoardShiftX
        const dist = Math.hypot(pVisualX - targetVisualX, p.y - target.y)
        if (dist < snapThreshold) {
          snapDelta = { dx: target.x - p.x, dy: target.y - p.y }
          isBoardSnap = true
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
              const nTarget = getTargetPos(neighbor.id)
              const nIsOnBoard = Boolean(neighbor.isOnBoard) || Math.hypot(neighbor.x - nTarget.x, neighbor.y - nTarget.y) < 2
              if (nIsOnBoard) continue

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
                tableSnapTargetGroupId = neighbor.groupId
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

        // Build a map of all pieces with the dragged group shifted to its snapped position
        const pieceMap = new Map()
        for (const p of currentPieces) {
          if (p.groupId === groupId) {
            const nextX = p.x + snapDelta.dx
            const nextY = p.y + snapDelta.dy
            pieceMap.set(p.id, {
              ...p,
              x: nextX,
              y: nextY,
              origX: nextX,
              origY: nextY,
            })
          } else {
            pieceMap.set(p.id, { ...p })
          }
        }

        const groupsToMerge = new Set([groupId])

        if (isBoardSnap) {
          // On the board: only merge with adjacent orthogonal neighbors that are ALSO currently
          // placed in their correct slots on the board!
          for (const p of groupPieces) {
            const shiftedP = pieceMap.get(p.id)
            const pCol = shiftedP.id % grid.cols
            const pRow = Math.floor(shiftedP.id / grid.cols)
            const neighborIds = [
              pCol > 0 ? shiftedP.id - 1 : null,
              pCol < grid.cols - 1 ? shiftedP.id + 1 : null,
              pRow > 0 ? shiftedP.id - grid.cols : null,
              pRow < grid.rows - 1 ? shiftedP.id + grid.cols : null,
            ].filter((id) => id !== null)

            for (const nId of neighborIds) {
              const neighbor = pieceMap.get(nId)
              if (neighbor && neighbor.groupId !== groupId) {
                const nTarget = getTargetPos(neighbor.id)
                if (Math.hypot(neighbor.x - nTarget.x, neighbor.y - nTarget.y) < 2) {
                  groupsToMerge.add(neighbor.groupId)
                }
              }
            }
          }
        } else {
          // On the table: merge with the snapped neighbor
          if (tableSnapTargetGroupId !== null) {
            groupsToMerge.add(tableSnapTargetGroupId)
          }

          // Check if any other neighbors on the table also touch any piece in our group
          for (const p of groupPieces) {
            const shiftedP = pieceMap.get(p.id)
            const pCol = shiftedP.id % grid.cols
            const pRow = Math.floor(shiftedP.id / grid.cols)
            const neighborSpecs = [
              { id: shiftedP.id - 1, valid: pCol > 0, expDx: -pieceSize, expDy: 0 },
              { id: shiftedP.id + 1, valid: pCol < grid.cols - 1, expDx: pieceSize, expDy: 0 },
              { id: shiftedP.id - grid.cols, valid: pRow > 0, expDx: 0, expDy: -pieceSize },
              { id: shiftedP.id + grid.cols, valid: pRow < grid.rows - 1, expDx: 0, expDy: pieceSize },
            ]

            for (const spec of neighborSpecs) {
              if (!spec.valid) continue
              const neighbor = pieceMap.get(spec.id)
              if (neighbor && !groupsToMerge.has(neighbor.groupId)) {
                const nTarget = getTargetPos(neighbor.id)
                const nIsOnBoard = Boolean(neighbor.isOnBoard) || Math.hypot(neighbor.x - nTarget.x, neighbor.y - nTarget.y) < 2
                if (nIsOnBoard) continue

                const expNX = shiftedP.x + spec.expDx
                const expNY = shiftedP.y + spec.expDy
                if (Math.hypot(neighbor.x - expNX, neighbor.y - expNY) < snapThreshold) {
                  const deltaAlignX = expNX - neighbor.x
                  const deltaAlignY = expNY - neighbor.y
                  const targetGId = neighbor.groupId
                  groupsToMerge.add(targetGId)
                  for (const other of pieceMap.values()) {
                    if (other.groupId === targetGId) {
                      other.x += deltaAlignX
                      other.y += deltaAlignY
                      other.origX = other.x
                      other.origY = other.y
                    }
                  }
                }
              }
            }
          }
        }

        // Pick a consistent merged group ID
        const mergedGroupId = Array.from(groupsToMerge).sort((a, b) => a - b)[0]

        nextPieces = Array.from(pieceMap.values()).map((p) => {
          if (groupsToMerge.has(p.groupId)) {
            return {
              ...p,
              groupId: mergedGroupId,
              isOnBoard: isBoardSnap,
            }
          }
          return p
        })

        // Check victory: all pieces are correctly placed on the board
        const allOnBoard = nextPieces.every((p) => {
          const t = getTargetPos(p.id)
          return Math.hypot(p.x - t.x, p.y - t.y) < 2
        })

        if (allOnBoard) {
          nextStatus = 'won'
          setStatus('won')
          nextPieces = nextPieces.map((p) => ({ ...p, groupId: 0, isOnBoard: true }))
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
              isOnBoard: false,
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
            <img src="/favicon.svg" alt="" className="brand-mark" aria-hidden="true" />
            <span className="brand-name">Piecework</span>
            <span className="hud-gear-icon" aria-hidden="true">
              <IconGear />
            </span>
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
            <span className="btn-icon">{theme === 'dark' ? <IconSun /> : <IconMoon />}</span>
            <span className="btn-text">{theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>
          <button
            className={`hud-guide-btn ${showGuide ? 'active' : ''}`}
            type="button"
            onClick={toggleGuide}
            title="Toggle assembly board guide outline"
          >
            <span className="btn-icon">
              <IconGrid />
            </span>
            <span className="btn-text">{showGuide ? 'Guide: On' : 'Guide: Off'}</span>
          </button>
          <button
            className="hud-preview-btn"
            type="button"
            onClick={() => setShowPreview(true)}
            title="Peek reference image"
          >
            <span className="btn-icon">
              <IconEye />
            </span>
            <span className="btn-text">Peek reference</span>
          </button>
          <button
            className="hud-about-btn"
            type="button"
            onClick={() => setShowAbout(true)}
            title="About the creators"
          >
            <span className="btn-icon">
              <IconInfo />
            </span>
            <span className="btn-text">About us</span>
          </button>
          <button
            className="hud-report-btn"
            type="button"
            onClick={() => setShowReport(true)}
            title="Report an issue or send feedback"
          >
            <span className="btn-icon">
              <IconReport />
            </span>
            <span className="btn-text">Report</span>
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
            <IconClose />
          </button>
        </div>
        <h1>Make the pieces yours.</h1>
        <p className="intro">Upload a PNG, JPEG, or WebP. Your image stays in this browser.</p>
        <button className="upload" type="button" onClick={() => inputRef.current?.click()}>
          <span className="upload-icon">
            <IconUpload />
          </span>
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
            {isPlaying || status === 'won' || status === 'lost' ? 'Jumble again' : 'Jumble puzzle'}{' '}
            <span className="btn-arrow-icon">
              <IconArrowRight />
            </span>
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
            <span className="creator-names-chip">
              Nate &amp; Swashua <IconExternalLink />
            </span>
          </button>
          <button type="button" className="drawer-about-btn drawer-report-btn" onClick={() => setShowReport(true)}>
            <span>Report an issue</span>
            <span className="creator-names-chip">
              Support <IconReport />
            </span>
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
          <div
            className="guide-inner-grid"
            style={{
              backgroundSize: `${pieceSize}px ${pieceSize}px`,
            }}
          />
        </div>
      )}

      {/* Freeform Pieces Canvas */}
      <div className={`pieces-table-surface ${isResizing ? 'resizing' : ''}`}>
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
              <JigsawPiece piece={p.id} grid={grid} image={image} seed={seed} instanceKey={`p-${p.id}`} />
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
                <IconClose />
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
                <span className="creator-gh-btn">
                  GitHub <IconExternalLink />
                </span>
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
                <span className="creator-gh-btn">
                  GitHub <IconExternalLink />
                </span>
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

      {/* Report Issue & Feedback Modal */}
      {showReport && (
        <div
          className="about-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Report an issue or send feedback"
          onClick={() => setShowReport(false)}
        >
          <div className="about-modal-card report-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="about-header">
              <span className="about-badge">Report &amp; Feedback</span>
              <button
                type="button"
                className="about-close-btn"
                onClick={() => setShowReport(false)}
                aria-label="Close report modal"
                title="Close"
              >
                <IconClose />
              </button>
            </div>

            <h2>Report an issue</h2>
            <p className="about-intro">
              Found a bug, visual glitch, or have an idea to make Piecework better?
              Please email it directly to our team:
            </p>

            <div className="report-email-card">
              <div className="report-email-content">
                <span className="report-email-label">Send your report to</span>
                <a
                  href="mailto:23200114@usc.edu.ph?subject=Piecework%20Puzzle%20Report"
                  className="report-email-address"
                  title="Click to compose email"
                >
                  23200114@usc.edu.ph
                </a>
              </div>
              <button
                type="button"
                className="report-copy-btn"
                onClick={handleCopyEmail}
                title="Copy email to clipboard"
                aria-label="Copy email address"
              >
                {copiedEmail ? (
                  <>
                    <IconCheck /> Copied!
                  </>
                ) : (
                  <>
                    <IconCopy /> Copy
                  </>
                )}
              </button>
            </div>

            <div className="report-modal-actions">
              <a
                href="mailto:23200114@usc.edu.ph?subject=Piecework%20Puzzle%20Report"
                className="primary-link-btn"
              >
                <IconMail /> Compose Email
              </a>
              <button
                type="button"
                className="about-done-btn"
                onClick={() => setShowReport(false)}
              >
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
