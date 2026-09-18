import test from 'node:test'
import assert from 'node:assert/strict'
import {
  addBucket,
  adjustPiecesForViewport,
  computeLayout,
  deleteBucket,
  generateGridOptions,
  generateRandomSeed,
  getPieceEdges,
  getPiecePath,
  hashSeam,
  isSolved,
  movePiece,
  renameBucket,
} from './puzzleModel.js'

test('square images offer square grids from about 50 to 1000 pieces', () => {
  const options = generateGridOptions(1000, 1000)
  assert.deepEqual(options[0], { rows: 8, cols: 8, count: 64 })
  assert.deepEqual(options.at(-1), { rows: 31, cols: 31, count: 961 })
  assert.ok(options.every((option) => option.rows === option.cols))
})

test('wide images offer rectangular grids that follow the image ratio', () => {
  const options = generateGridOptions(1920, 1080)
  assert.ok(options.length > 10)
  assert.ok(options.every((option) => option.count >= 50 && option.count <= 1000))
  assert.ok(options.every((option) => Math.abs(option.cols / option.rows - 16 / 9) < 0.13))
})

test('extreme image ratios still receive a valid capped grid', () => {
  const [option] = generateGridOptions(100000, 10)
  assert.deepEqual(option, { rows: 1, cols: 1000, count: 1000 })
})

test('addBucket creates a named bucket without mutating state', () => {
  const state = { tray: [0, 1], board: [null, null], buckets: [] }
  const next = addBucket(state, 'Corner pieces')

  assert.equal(next.buckets.length, 1)
  assert.equal(next.buckets[0].name, 'Corner pieces')
  assert.deepEqual(state.buckets, [])
})

test('addBucket caps the organizer at three buckets', () => {
  let state = { tray: [], board: [], buckets: [] }
  state = addBucket(state, 'Corners')
  state = addBucket(state, 'Edges')
  state = addBucket(state, 'Colors')
  state = addBucket(state, 'Extra')
  assert.equal(state.buckets.length, 3)
})

test('renameBucket changes only the selected bucket name', () => {
  const state = { tray: [], board: [], buckets: [{ id: 'a', name: 'Edges', pieces: [] }, { id: 'b', name: 'Sky', pieces: [] }] }
  const next = renameBucket(state, 'a', 'Corner pieces')
  assert.deepEqual(next.buckets.map((bucket) => bucket.name), ['Corner pieces', 'Sky'])
})

test('deleteBucket returns its pieces to the loose tray', () => {
  const state = { tray: [0], board: [null], buckets: [{ id: 'a', name: 'Edges', pieces: [1, 2] }] }
  const next = deleteBucket(state, 'a')
  assert.deepEqual(next.tray, [0, 1, 2])
  assert.deepEqual(next.buckets, [])
})

test('movePiece moves a loose piece into a board slot', () => {
  const state = { tray: [0, 1], board: [null, null], buckets: [] }
  const next = movePiece(state, 1, { type: 'board', index: 0 })
  assert.deepEqual(next.tray, [0])
  assert.deepEqual(next.board, [1, null])
})

test('movePiece swaps two pieces already on the board', () => {
  const state = { tray: [], board: [1, 0], buckets: [] }
  const next = movePiece(state, 1, { type: 'board', index: 1 })
  assert.deepEqual(next.board, [0, 1])
  assert.equal(isSolved(next.board), true)
})

test('movePiece can sort a piece into a named bucket', () => {
  const state = { tray: [0, 1], board: [null, null], buckets: [{ id: 'edge', name: 'Edges', pieces: [] }] }
  const next = movePiece(state, 0, { type: 'bucket', id: 'edge' })
  assert.deepEqual(next.tray, [1])
  assert.deepEqual(next.buckets[0].pieces, [0])
})

test('adjustPiecesForViewport shifts pieces when terminal opens and restores original spots when terminal closes', () => {
  const grid = { rows: 8, cols: 8, count: 64 }
  const initialPieces = [
    { id: 0, x: 200, y: 650, origX: 200, origY: 650, groupId: 1, zIndex: 2 },
    { id: 1, x: 400, y: 150, origX: 400, origY: 150, groupId: 2, zIndex: 3 },
  ]

  // Normal window: 1200 x 800
  const normal = adjustPiecesForViewport(initialPieces, grid, 1200, 800)
  assert.equal(normal[0].y, 650)
  assert.equal(normal[1].y, 150)

  // Terminal opens: height drops to 400
  const terminalOpen = adjustPiecesForViewport(normal, grid, 1200, 400)
  // Piece at y=650 should be shifted up to remain visible
  assert.ok(terminalOpen[0].y < 400)
  // But its origY must remain 650!
  assert.equal(terminalOpen[0].origY, 650)

  // Terminal closes: height returns to 800
  const terminalClosed = adjustPiecesForViewport(terminalOpen, grid, 1200, 800)
  // Piece must return to its exact original spot!
  assert.equal(terminalClosed[0].x, 200)
  assert.equal(terminalClosed[0].y, 650)
  assert.equal(terminalClosed[1].x, 400)
  assert.equal(terminalClosed[1].y, 150)
})

test('adjustPiecesForViewport preserves cluster distances during and after viewport resizing', () => {
  const grid = { rows: 8, cols: 8, count: 64 }
  // Cluster of two pieces separated by 50px vertically
  const cluster = [
    { id: 0, x: 300, y: 580, origX: 300, origY: 580, groupId: 5, zIndex: 2 },
    { id: 1, x: 300, y: 630, origX: 300, origY: 630, groupId: 5, zIndex: 2 },
  ]

  // Terminal opens: height drops to 380
  const shifted = adjustPiecesForViewport(cluster, grid, 1200, 380)
  // Both pieces must shift by the exact same amount, preserving their 50px delta
  const deltaShifted = shifted[1].y - shifted[0].y
  assert.equal(deltaShifted, 50)

  // Terminal closes: height expands back to 800
  const restored = adjustPiecesForViewport(shifted, grid, 1200, 800)
  assert.equal(restored[0].y, 580)
  assert.equal(restored[1].y, 630)
  assert.equal(restored[1].y - restored[0].y, 50)
})

test('corner pieces have exactly 2 flat outer edges and 2 non-flat inner tabs/holes', () => {
  const rows = 8
  const cols = 8
  const seed = 42

  // Top-left corner (0, 0)
  const tl = getPieceEdges(0, rows, cols, seed)
  assert.equal(tl.top, 0)
  assert.equal(tl.left, 0)
  assert.ok(tl.right === 1 || tl.right === -1)
  assert.ok(tl.bottom === 1 || tl.bottom === -1)

  // Top-right corner (0, cols - 1)
  const tr = getPieceEdges(cols - 1, rows, cols, seed)
  assert.equal(tr.top, 0)
  assert.equal(tr.right, 0)
  assert.ok(tr.left === 1 || tr.left === -1)
  assert.ok(tr.bottom === 1 || tr.bottom === -1)

  // Bottom-left corner (rows - 1, 0)
  const bl = getPieceEdges((rows - 1) * cols, rows, cols, seed)
  assert.equal(bl.bottom, 0)
  assert.equal(bl.left, 0)
  assert.ok(bl.top === 1 || bl.top === -1)
  assert.ok(bl.right === 1 || bl.right === -1)

  // Bottom-right corner (rows - 1, cols - 1)
  const br = getPieceEdges(rows * cols - 1, rows, cols, seed)
  assert.equal(br.bottom, 0)
  assert.equal(br.right, 0)
  assert.ok(br.top === 1 || br.top === -1)
  assert.ok(br.left === 1 || br.left === -1)
})

test('edge pieces have exactly 1 flat outer edge and 3 non-flat inner tabs/holes', () => {
  const rows = 8
  const cols = 8
  const seed = 123

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isCorner = (r === 0 || r === rows - 1) && (c === 0 || c === cols - 1)
      const isEdge = !isCorner && (r === 0 || r === rows - 1 || c === 0 || c === cols - 1)
      if (!isEdge) continue

      const piece = r * cols + c
      const edges = getPieceEdges(piece, rows, cols, seed)
      const flats = Object.values(edges).filter((v) => v === 0).length
      const nonFlats = Object.values(edges).filter((v) => v === 1 || v === -1).length

      assert.equal(flats, 1, `Edge piece at (${r}, ${c}) should have 1 flat edge`)
      assert.equal(nonFlats, 3, `Edge piece at (${r}, ${c}) should have 3 tabs/holes`)

      if (r === 0) assert.equal(edges.top, 0)
      if (r === rows - 1) assert.equal(edges.bottom, 0)
      if (c === 0) assert.equal(edges.left, 0)
      if (c === cols - 1) assert.equal(edges.right, 0)
    }
  }
})

test('interior pieces have 0 flat edges and all 4 edges are tabs or holes', () => {
  const rows = 6
  const cols = 6
  const seed = 777

  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      const piece = r * cols + c
      const edges = getPieceEdges(piece, rows, cols, seed)
      const flats = Object.values(edges).filter((v) => v === 0).length
      assert.equal(flats, 0, `Interior piece at (${r}, ${c}) must have 0 flat edges`)
      assert.ok(edges.top === 1 || edges.top === -1)
      assert.ok(edges.right === 1 || edges.right === -1)
      assert.ok(edges.bottom === 1 || edges.bottom === -1)
      assert.ok(edges.left === 1 || edges.left === -1)
    }
  }
})

test('adjacent puzzle pieces fit together with matching tabs and holes', () => {
  const rows = 7
  const cols = 9
  const seed = 54321

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const current = getPieceEdges(r * cols + c, rows, cols, seed)

      // Check horizontal neighbor (right)
      if (c < cols - 1) {
        const neighborRight = getPieceEdges(r * cols + (c + 1), rows, cols, seed)
        assert.equal(
          current.right,
          -neighborRight.left,
          `Seam mismatch horizontally between (${r},${c}) right and (${r},${c + 1}) left`
        )
      }

      // Check vertical neighbor (bottom)
      if (r < rows - 1) {
        const neighborBottom = getPieceEdges((r + 1) * cols + c, rows, cols, seed)
        assert.equal(
          current.bottom,
          -neighborBottom.top,
          `Seam mismatch vertically between (${r},${c}) bottom and (${r + 1},${c}) top`
        )
      }
    }
  }
})

test('piece configurations are randomized and varied across the puzzle', () => {
  const rows = 10
  const cols = 10
  const seed = 99999
  const signatures = new Set()

  for (let p = 0; p < rows * cols; p++) {
    const edges = getPieceEdges(p, rows, cols, seed)
    signatures.add(`${edges.top},${edges.right},${edges.bottom},${edges.left}`)
  }

  // Instead of every piece having the exact same signature, there must be a rich variety
  assert.ok(
    signatures.size >= 10,
    `Expected diverse piece edge combinations, got only ${signatures.size} distinct types`
  )
})

test('different seeds produce different cuts while identical seeds are deterministic', () => {
  const rows = 8
  const cols = 8
  const seedA = 100
  const seedB = 200

  // Determinism check
  for (let p = 0; p < rows * cols; p++) {
    assert.deepEqual(getPieceEdges(p, rows, cols, seedA), getPieceEdges(p, rows, cols, seedA))
  }

  // Difference check
  let differences = 0
  for (let p = 0; p < rows * cols; p++) {
    const edgesA = getPieceEdges(p, rows, cols, seedA)
    const edgesB = getPieceEdges(p, rows, cols, seedB)
    if (
      edgesA.top !== edgesB.top ||
      edgesA.right !== edgesB.right ||
      edgesA.bottom !== edgesB.bottom ||
      edgesA.left !== edgesB.left
    ) {
      differences++
    }
  }

  assert.ok(differences > 20, `Different seeds should yield different piece cuts (got ${differences} diffs)`)
})

test('getPiecePath generates valid SVG path data', () => {
  const path = getPiecePath({ top: 0, right: 1, bottom: -1, left: 0 })
  assert.ok(typeof path === 'string')
  assert.ok(path.startsWith('M 0 0'))
  assert.ok(path.endsWith('Z'))
  assert.ok(path.includes('C ')) // Contains bezier curves for tabs/holes
})

test('generateRandomSeed returns a valid non-negative 31-bit integer', () => {
  const seed = generateRandomSeed()
  assert.ok(Number.isInteger(seed))
  assert.ok(seed >= 0 && seed < 2147483648)
})

test('hashSeam generates uniform +1 and -1 values and supports both coordinate signatures', () => {
  let plus = 0
  let minus = 0
  for (let r = 0; r < 20; r++) {
    for (let c = 0; c < 20; c++) {
      const vH = hashSeam('h', r, c, 12345)
      const vV = hashSeam('v', r, c, 12345)
      assert.ok(vH === 1 || vH === -1)
      assert.ok(vV === 1 || vV === -1)
      if (vH === 1) plus++; else minus++
      if (vV === 1) plus++; else minus++
    }
  }

  // Distribution should be roughly balanced (~50/50)
  assert.ok(plus > 300 && minus > 300)

  // Verify 4-coordinate signature matches
  const seamA = hashSeam('v', 3, 4, 999)
  const seamB = hashSeam(3, 4, 3, 5, 999)
  assert.equal(seamA, seamB)
})

test('adjustPiecesForViewport locks board pieces to the board slots even with custom groupIds', () => {
  const grid = { rows: 8, cols: 8, count: 64 }
  const layout = computeLayout(grid, 1200, 800)
  const piece0TargetX = layout.boardX
  const piece0TargetY = layout.boardY
  const boardPieces = [
    { id: 0, x: piece0TargetX, y: piece0TargetY, origX: piece0TargetX, origY: piece0TargetY, groupId: 42, isOnBoard: true, zIndex: 1 },
  ]

  // Viewport changes to 900 x 600
  const updatedLayout = computeLayout(grid, 900, 600)
  const adjusted = adjustPiecesForViewport(boardPieces, grid, 900, 600)
  assert.equal(adjusted[0].x, updatedLayout.boardX)
  assert.equal(adjusted[0].y, updatedLayout.boardY)
})

test('adjustPiecesForViewport does not lock table pieces when isOnBoard is false', () => {
  const grid = { rows: 8, cols: 8, count: 64 }
  const tablePieces = [
    { id: 0, x: 200, y: 300, origX: 200, origY: 300, groupId: 12, isOnBoard: false, zIndex: 1 },
  ]

  const adjusted = adjustPiecesForViewport(tablePieces, grid, 1200, 800)
  assert.equal(adjusted[0].x, 200)
  assert.equal(adjusted[0].y, 300)
})

test('computeLayout produces integer pieceSize and board coordinates across fractional viewports', () => {
  const grid = { rows: 8, cols: 8, count: 64 }
  const viewports = [
    { w: 1200, h: 800 },
    { w: 1090.9, h: 727.2 },
    { w: 960, h: 640 },
    { w: 833.3, h: 555.5 },
    { w: 750, h: 500 },
  ]

  for (const vp of viewports) {
    const layout = computeLayout(grid, vp.w, vp.h)
    assert.ok(Number.isInteger(layout.pieceSize), `pieceSize should be integer for ${vp.w}x${vp.h}`)
    assert.ok(Number.isInteger(layout.boardW), `boardW should be integer for ${vp.w}x${vp.h}`)
    assert.ok(Number.isInteger(layout.boardH), `boardH should be integer for ${vp.w}x${vp.h}`)
    assert.ok(Number.isInteger(layout.boardX), `boardX should be integer for ${vp.w}x${vp.h}`)
    assert.ok(Number.isInteger(layout.boardY), `boardY should be integer for ${vp.w}x${vp.h}`)
  }
})

