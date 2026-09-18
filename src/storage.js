const STORAGE_KEY = 'piecework_puzzle_state_v1'
const DB_NAME = 'piecework_db'
const STORE_NAME = 'puzzle_store'
const DB_VERSION = 1

function openDb() {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null)
  }
  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME)
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

export async function getIndexedDbItem(key) {
  const db = await openDb()
  if (!db) return null
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.get(key)
      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

export async function setIndexedDbItem(key, val) {
  const db = await openDb()
  if (!db) return false
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const request = store.put(val, key)
      request.onsuccess = () => resolve(true)
      request.onerror = () => resolve(false)
    } catch {
      resolve(false)
    }
  })
}

export async function removeIndexedDbItem(key) {
  const db = await openDb()
  if (!db) return
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(key)
  } catch {
    // Ignore errors on cleanup
  }
}

/**
 * Synchronously reads the saved game state from localStorage.
 * Ensures zero-flash, immediate resume when refreshing the page.
 */
export function loadGameStateSync() {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.pieces)) {
      return null
    }
    return parsed
  } catch (err) {
    console.warn('[Piecework] Failed to parse saved game state from localStorage:', err)
    return null
  }
}

/**
 * Saves current puzzle state with automatic fallback for large custom images.
 */
export function saveGameState(state) {
  if (typeof window === 'undefined') return

  const payload = {
    version: 1,
    savedAt: Date.now(),
    status: state.status,
    moves: state.moves,
    timed: state.timed,
    duration: state.duration,
    remaining: state.remaining,
    theme: state.theme,
    showGuide: state.showGuide,
    fileName: state.fileName,
    imageMeta: state.imageMeta,
    gridIndex: state.gridIndex,
    gridOptions: state.gridOptions,
    maxZ: state.maxZ,
    pieces: state.pieces.map((p) => ({
      id: p.id,
      x: Math.round(p.x * 10) / 10,
      y: Math.round(p.y * 10) / 10,
      origX: Math.round((p.origX ?? p.x) * 10) / 10,
      origY: Math.round((p.origY ?? p.y) * 10) / 10,
      groupId: p.groupId,
      isOnBoard: Boolean(p.isOnBoard),
      zIndex: p.zIndex,
    })),
    windowSize: state.windowSize,
    image: state.image,
    seed: state.seed,
    hasCustomImageInDb: false,
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch (err) {
    // If quota exceeded (e.g. large base64 image), store image in IndexedDB
    if (state.image) {
      setIndexedDbItem('custom_image', state.image).then((success) => {
        if (success) {
          try {
            payload.image = null
            payload.hasCustomImageInDb = true
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
          } catch (nestedErr) {
            console.warn('[Piecework] Could not persist state even with offloaded image:', nestedErr)
          }
        }
      })
    } else {
      console.warn('[Piecework] localStorage quota exceeded:', err)
    }
  }
}

/**
 * Clears saved game state from both localStorage and IndexedDB.
 */
export function clearGameState() {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {}
  removeIndexedDbItem('custom_image')
}
