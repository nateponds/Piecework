let bucketCounter = 0

export function generateGridOptions(width, height, minPieces = 50, maxPieces = 1000) {
  const aspect = Number.isFinite(width / height) && width > 0 && height > 0 ? width / height : 1
  const options = []
  const seen = new Set()

  for (let rows = 1; rows <= maxPieces; rows++) {
    const cols = Math.max(1, Math.round(rows * aspect))
    const count = rows * cols
    if (count > maxPieces) break
    if (count < minPieces) continue
    const key = `${rows}x${cols}`
    if (!seen.has(key)) {
      options.push({ rows, cols, count })
      seen.add(key)
    }
  }

  if (options.length === 0) {
    return aspect >= 1
      ? [{ rows: 1, cols: maxPieces, count: maxPieces }]
      : [{ rows: maxPieces, cols: 1, count: maxPieces }]
  }

  return options
}

export function addBucket(state, name) {
  if (state.buckets.length >= 3) return state
  const cleanName = name.trim() || `Bucket ${state.buckets.length + 1}`
  return {
    ...state,
    buckets: [...state.buckets, { id: `bucket-${++bucketCounter}`, name: cleanName, pieces: [] }],
  }
}

export function renameBucket(state, id, name) {
  const cleanName = name.trim()
  if (!cleanName) return state
  return {
    ...state,
    buckets: state.buckets.map((bucket) => bucket.id === id ? { ...bucket, name: cleanName } : bucket),
  }
}

export function deleteBucket(state, id) {
  const removed = state.buckets.find((bucket) => bucket.id === id)
  if (!removed) return state
  return {
    ...state,
    tray: [...state.tray, ...removed.pieces],
    buckets: state.buckets.filter((bucket) => bucket.id !== id),
  }
}

export function movePiece(state, piece, destination) {
  const sourceBoardIndex = state.board.indexOf(piece)
  const destinationPiece = destination.type === 'board' ? state.board[destination.index] : null
  const next = {
    ...state,
    tray: state.tray.filter((value) => value !== piece),
    board: state.board.map((value) => value === piece ? null : value),
    buckets: state.buckets.map((bucket) => ({ ...bucket, pieces: bucket.pieces.filter((value) => value !== piece) })),
  }

  if (destination.type === 'board') {
    next.board[destination.index] = piece
    if (destinationPiece !== null && destinationPiece !== piece) {
      if (sourceBoardIndex >= 0) next.board[sourceBoardIndex] = destinationPiece
      else next.tray = [...next.tray.filter((value) => value !== destinationPiece), destinationPiece]
    }
  } else if (destination.type === 'bucket') {
    next.buckets = next.buckets.map((bucket) => bucket.id === destination.id ? { ...bucket, pieces: [...bucket.pieces, piece] } : bucket)
  } else {
    next.tray = [...next.tray, piece]
  }

  return next
}

export function isSolved(board) {
  return board.length > 0 && board.every((piece, index) => piece === index)
}

export function computeLayout(grid, winW, winH) {
  const availW = Math.max(200, winW * 0.82)
  const availH = Math.max(200, winH * 0.78)
  const pieceSize = Math.max(28, Math.min(availW / grid.cols, availH / grid.rows, 160))
  const boardW = grid.cols * pieceSize
  const boardH = grid.rows * pieceSize
  const boardX = (winW - boardW) / 2
  const boardY = (winH - boardH) / 2 + 10
  return { pieceSize, boardW, boardH, boardX, boardY }
}

/**
 * Adjusts piece coordinates to fit within a reduced viewport (e.g. when opening a terminal),
 * while preserving each piece's unconstrained original spot (origX, origY) so they return
 * back to their exact spots once the viewport expands back.
 */
export function adjustPiecesForViewport(pieces, grid, winW, winH) {
  const layout = computeLayout(grid, winW, winH)
  const maxAllowedX = Math.max(12, winW - layout.pieceSize - 12)
  const maxAllowedY = Math.max(50, winH - layout.pieceSize - 18)

  const groupMap = new Map()
  for (const p of pieces) {
    if (!groupMap.has(p.groupId)) {
      groupMap.set(p.groupId, [])
    }
    groupMap.get(p.groupId).push(p)
  }

  const result = []

  for (const [groupId, groupPieces] of groupMap.entries()) {
    if (groupId === 0) {
      // Solved board group: always lock directly to current board slots
      for (const p of groupPieces) {
        const col = p.id % grid.cols
        const row = Math.floor(p.id / grid.cols)
        const targetX = layout.boardX + col * layout.pieceSize
        const targetY = layout.boardY + row * layout.pieceSize
        result.push({
          ...p,
          x: targetX,
          y: targetY,
          origX: targetX,
          origY: targetY,
        })
      }
      continue
    }

    // Free pieces and clusters
    let minOrigX = Infinity
    let maxOrigX = -Infinity
    let minOrigY = Infinity
    let maxOrigY = -Infinity

    for (const p of groupPieces) {
      const ox = typeof p.origX === 'number' ? p.origX : p.x
      const oy = typeof p.origY === 'number' ? p.origY : p.y
      if (ox < minOrigX) minOrigX = ox
      if (ox > maxOrigX) maxOrigX = ox
      if (oy < minOrigY) minOrigY = oy
      if (oy > maxOrigY) maxOrigY = oy
    }

    let shiftX = 0
    let shiftY = 0

    // If group exceeds right screen boundary, shift left
    if (maxOrigX > maxAllowedX) {
      shiftX = maxAllowedX - maxOrigX
    }
    if (minOrigX + shiftX < 12) {
      shiftX = 12 - minOrigX
    }

    // If group exceeds bottom boundary (e.g. terminal open), shift up together
    if (maxOrigY > maxAllowedY) {
      shiftY = maxAllowedY - maxOrigY
    }
    if (minOrigY + shiftY < 50) {
      shiftY = 50 - minOrigY
    }

    for (const p of groupPieces) {
      const ox = typeof p.origX === 'number' ? p.origX : p.x
      const oy = typeof p.origY === 'number' ? p.origY : p.y
      result.push({
        ...p,
        origX: ox,
        origY: oy,
        x: ox + shiftX,
        y: oy + shiftY,
      })
    }
  }

  result.sort((a, b) => a.id - b.id)
  return result
}

