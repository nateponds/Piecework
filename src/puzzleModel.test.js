import test from 'node:test'
import assert from 'node:assert/strict'
import { addBucket, deleteBucket, generateGridOptions, isSolved, movePiece, renameBucket } from './puzzleModel.js'

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
