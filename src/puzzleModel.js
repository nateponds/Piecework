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
