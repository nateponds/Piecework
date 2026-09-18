import test from 'node:test'
import assert from 'node:assert/strict'
import { clearGameState, loadGameStateSync, saveGameState } from './storage.js'

// Simple mock for localStorage in Node environment
class LocalStorageMock {
  constructor() {
    this.store = {}
  }
  getItem(key) {
    return this.store[key] || null
  }
  setItem(key, value) {
    this.store[key] = String(value)
  }
  removeItem(key) {
    delete this.store[key]
  }
  clear() {
    this.store = {}
  }
}

test('loadGameStateSync returns null when no state is saved', () => {
  globalThis.window = {}
  globalThis.localStorage = new LocalStorageMock()
  assert.equal(loadGameStateSync(), null)
})

test('saveGameState stores state and loadGameStateSync restores it', () => {
  globalThis.window = {}
  globalThis.localStorage = new LocalStorageMock()

  const dummyState = {
    status: 'playing',
    moves: 7,
    timed: true,
    duration: 180,
    remaining: 150,
    theme: 'dark',
    showGuide: true,
    fileName: 'test-pic',
    imageMeta: { width: 900, height: 900 },
    gridIndex: 1,
    gridOptions: [{ rows: 8, cols: 8, count: 64 }],
    maxZ: 20,
    pieces: [
      { id: 0, x: 100.23, y: 150.88, groupId: 0, zIndex: 1 },
      { id: 1, x: 200, y: 250, groupId: 2, zIndex: 5 },
    ],
    windowSize: { width: 400, height: 800 },
    image: 'data:image/svg+xml;utf8,<svg></svg>',
    seed: 98765,
  }

  saveGameState(dummyState)
  const loaded = loadGameStateSync()

  assert.ok(loaded !== null)
  assert.equal(loaded.status, 'playing')
  assert.equal(loaded.moves, 7)
  assert.equal(loaded.timed, true)
  assert.equal(loaded.remaining, 150)
  assert.equal(loaded.seed, 98765)
  assert.equal(loaded.pieces.length, 2)
  assert.equal(loaded.pieces[0].id, 0)
  assert.equal(loaded.pieces[0].x, 100.2)
  assert.equal(loaded.pieces[0].origX, 100.2)
  assert.equal(loaded.pieces[0].origY, 150.9)
  assert.equal(loaded.pieces[1].groupId, 2)
})

test('clearGameState wipes the saved state', () => {
  globalThis.window = {}
  globalThis.localStorage = new LocalStorageMock()

  saveGameState({
    status: 'playing',
    moves: 1,
    pieces: [{ id: 0, x: 10, y: 10, groupId: 1, zIndex: 1 }],
  })
  assert.ok(loadGameStateSync() !== null)

  clearGameState()
  assert.equal(loadGameStateSync(), null)
})
