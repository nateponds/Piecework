let bucketCounter = 0

export function generateRandomSeed() {
  return Math.floor(Math.random() * 2147483647)
}

/**
 * Fast 32-bit hash function (Murmur3 finalizer mix) that deterministically
 * produces either +1 (hole) or -1 (tab) for any interior seam.
 */
export function hashSeam(typeOrR1, rOrC1, cOrR2, seedOrC2 = 12345, seedMaybe = 12345) {
  let type, r, c, seed
  if (typeof typeOrR1 === 'string') {
    type = typeOrR1
    r = rOrC1
    c = cOrR2
    seed = seedOrC2
  } else {
    // Coordinate signature: (r1, c1, r2, c2, seed)
    const r1 = typeOrR1
    const c1 = rOrC1
    const r2 = cOrR2
    const c2 = seedOrC2
    seed = seedMaybe
    if (r1 === r2) {
      type = 'v'
      r = r1
      c = Math.min(c1, c2)
    } else {
      type = 'h'
      r = Math.min(r1, r2)
      c = c1
    }
  }

  let h = (seed ^ (type === 'h' ? 0x12345678 : 0x87654321) ^ (r * 73856093) ^ (c * 19349663)) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  h = (h ^ (h >>> 16)) >>> 0
  return (h & 1) === 0 ? 1 : -1
}

export const getSeam = hashSeam

/**
 * Calculates edge configurations for a puzzle piece.
 * Outer boundaries are strictly flat (0).
 * Interior seams are randomized tabs (-1) or holes (+1) that perfectly match adjacent pieces.
 * Corner pieces have 2 flat outer edges.
 * Edge pieces have 1 flat outer edge.
 * Interior pieces have 0 flat edges.
 */
export function getPieceEdges(piece, rows, cols, seed = 12345) {
  const row = Math.floor(piece / cols)
  const col = piece % cols

  return {
    top: row === 0 ? 0 : -hashSeam('h', row - 1, col, seed),
    right: col === cols - 1 ? 0 : hashSeam('v', row, col, seed),
    bottom: row === rows - 1 ? 0 : hashSeam('h', row, col, seed),
    left: col === 0 ? 0 : -hashSeam('v', row, col - 1, seed),
  }
}

export function generateEdgeSegment(x1, y1, x2, y2, s) {
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

export function getPiecePath({ top, right, bottom, left }) {
  return [
    'M 0 0',
    generateEdgeSegment(0, 0, 100, 0, top),
    generateEdgeSegment(100, 0, 100, 100, right),
    generateEdgeSegment(100, 100, 0, 100, bottom),
    generateEdgeSegment(0, 100, 0, 0, left),
    'Z',
  ].join(' ')
}

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

/**
 * Determines whether a freeform puzzle is solved.
 * A puzzle is considered solved if:
 * 1) All pieces exist and are in their designated board guide slots, OR
 * 2) All pieces are assembled into a single connected group with correct relative offsets
 *    anywhere on the canvas table (even if the guide is off or the puzzle is not placed inside the guide).
 */
export function isFreeformPuzzleSolved(pieces, grid, pieceSize, boardX = null, boardY = null) {
  if (!pieces || !grid || pieces.length !== grid.count || grid.count === 0) return false

  // Check 1: All pieces placed in the board guide slots
  if (typeof boardX === 'number' && typeof boardY === 'number') {
    const allOnBoard = pieces.every((p) => {
      const col = p.id % grid.cols
      const row = Math.floor(p.id / grid.cols)
      const targetX = boardX + col * pieceSize
      const targetY = boardY + row * pieceSize
      return Math.hypot(p.x - targetX, p.y - targetY) < 3
    })
    if (allOnBoard) return true
  }

  // Check 2: All pieces connected together in a single group anywhere on the table
  const firstGroupId = pieces[0].groupId
  const allSameGroup = pieces.every((p) => p.groupId === firstGroupId)
  if (!allSameGroup) return false

  const refPiece = pieces[0]
  const refCol = refPiece.id % grid.cols
  const refRow = Math.floor(refPiece.id / grid.cols)
  const originX = refPiece.x - refCol * pieceSize
  const originY = refPiece.y - refRow * pieceSize

  return pieces.every((p) => {
    const col = p.id % grid.cols
    const row = Math.floor(p.id / grid.cols)
    const expectedX = originX + col * pieceSize
    const expectedY = originY + row * pieceSize
    return Math.hypot(p.x - expectedX, p.y - expectedY) < 3
  })
}

export function computeLayout(grid, winW, winH) {
  const availW = Math.max(200, winW * 0.82)
  const availH = Math.max(200, winH * 0.78)
  const pieceSize = Math.round(Math.max(28, Math.min(availW / grid.cols, availH / grid.rows, 160)))
  const boardW = grid.cols * pieceSize
  const boardH = grid.rows * pieceSize
  const boardX = Math.round((winW - boardW) / 2)
  const boardY = Math.round((winH - boardH) / 2 + 10)
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
    const isGroupOnBoard = groupId === 0 || (
      groupPieces.length > 0 && groupPieces.every((p) => Boolean(p.isOnBoard))
    )

    if (isGroupOnBoard) {
      // Board group: always lock directly to current board slots
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

