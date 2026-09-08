import { useEffect, useRef, useState } from 'react'
import { addBucket, deleteBucket, generateGridOptions, isSolved, movePiece, renameBucket } from './puzzleModel.js'
import './App.css'

const DEFAULT_IMAGE = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 900"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#f5c975"/><stop offset="1" stop-color="#f4eee3"/></linearGradient></defs><rect width="900" height="900" fill="url(#sky)"/><circle cx="700" cy="190" r="86" fill="#fff4bf"/><path d="M0 590 210 345 390 525 555 270 900 610V900H0Z" fill="#49655d"/><path d="m390 525 165-255 100 148-49-18-51 52-55-36-64 167Z" fill="#f8f3e8"/><path d="M0 680c165-72 278-57 421 8 151 69 284 21 479-44v256H0Z" fill="#cf5d45"/><path d="M0 748c197-62 331-34 468 22 133 54 264 38 432-20v150H0Z" fill="#eaa85e"/><circle cx="175" cy="190" r="48" fill="#2f4b45" opacity=".85"/><path d="M175 230v210" stroke="#2f4b45" stroke-width="24"/></svg>`)}`

const makeSolved = (count) => Array.from({ length: count }, (_, i) => i)
const closestGridIndex = (options, target = 100) => options.reduce((best, option, index) => Math.abs(option.count - target) < Math.abs(options[best].count - target) ? index : best, 0)
const DEFAULT_GRID_OPTIONS = generateGridOptions(900, 900)
const DEFAULT_GRID_INDEX = closestGridIndex(DEFAULT_GRID_OPTIONS)
const shuffle = (items) => {
  const next = [...items]
  do {
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[next[i], next[j]] = [next[j], next[i]]
    }
  } while (next.every((value, index) => value === index))
  return next
}
const formatTime = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
const cleanBuckets = (buckets) => buckets.map((bucket) => ({ ...bucket, pieces: [] }))

const horizontalEdge = (row, col) => ((row * 13 + col * 7) % 2 === 0 ? 1 : -1)
const verticalEdge = (row, col) => ((row * 5 + col * 11) % 2 === 0 ? 1 : -1)
const getPieceEdges = (piece, rows, cols) => {
  const row = Math.floor(piece / cols)
  const col = piece % cols
  return {
    top: row === 0 ? 0 : -horizontalEdge(row - 1, col),
    right: col === cols - 1 ? 0 : verticalEdge(row, col),
    bottom: row === rows - 1 ? 0 : horizontalEdge(row, col),
    left: col === 0 ? 0 : -verticalEdge(row, col - 1),
  }
}
const getPiecePath = ({ top, right, bottom, left }) => {
  const t = -18 * top
  const r = 100 + 18 * right
  const b = 100 + 18 * bottom
  const l = -18 * left
  return [
    'M 0 0',
    top ? `L 34 0 C 40 0, 35 ${t}, 50 ${t} C 65 ${t}, 60 0, 66 0 L 100 0` : 'L 100 0',
    right ? `L 100 34 C 100 40, ${r} 35, ${r} 50 C ${r} 65, 100 60, 100 66 L 100 100` : 'L 100 100',
    bottom ? `L 66 100 C 60 100, 65 ${b}, 50 ${b} C 35 ${b}, 40 100, 34 100 L 0 100` : 'L 0 100',
    left ? `L 0 66 C 0 60, ${l} 65, ${l} 50 C ${l} 35, 0 40, 0 34 L 0 0` : 'L 0 0',
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
    <svg className="jigsaw-svg" viewBox="0 0 100 100" aria-hidden="true">
      <defs><clipPath id={clipId} clipPathUnits="userSpaceOnUse"><path d={path} /></clipPath></defs>
      <g clipPath={`url(#${clipId})`}>
        <image href={image} x={-col * 100} y={-row * 100} width={cols * 100} height={rows * 100} preserveAspectRatio="xMidYMid slice" />
        <path className="piece-shade" d={path} />
      </g>
      <path className="piece-outline" d={path} />
    </svg>
  )
}

function PieceButton({ piece, grid, image, instanceKey, selected, className = '', onClick, onDragStart, style }) {
  return (
    <button
      type="button"
      draggable={Boolean(onDragStart)}
      aria-label={`Puzzle piece ${piece + 1}`}
      aria-pressed={selected}
      className={`piece ${selected ? 'selected' : ''} ${className}`}
      onClick={onClick}
      onDragStart={onDragStart}
      style={style}
    >
      <JigsawPiece piece={piece} grid={grid} image={image} instanceKey={instanceKey} />
    </button>
  )
}

function App() {
  const [image, setImage] = useState(DEFAULT_IMAGE)
  const [fileName, setFileName] = useState('Mountain study')
  const [imageMeta, setImageMeta] = useState({ width: 900, height: 900 })
  const [gridOptions, setGridOptions] = useState(DEFAULT_GRID_OPTIONS)
  const [gridIndex, setGridIndex] = useState(DEFAULT_GRID_INDEX)
  const grid = gridOptions[gridIndex]
  const [puzzle, setPuzzle] = useState({ board: makeSolved(DEFAULT_GRID_OPTIONS[DEFAULT_GRID_INDEX].count), tray: [], buckets: [] })
  const [selected, setSelected] = useState(null)
  const [moves, setMoves] = useState(0)
  const [timed, setTimed] = useState(false)
  const [duration, setDuration] = useState(180)
  const [remaining, setRemaining] = useState(180)
  const [status, setStatus] = useState('ready')
  const [shufflePhase, setShufflePhase] = useState(null)
  const [showPreview, setShowPreview] = useState(false)
  const [newBucketName, setNewBucketName] = useState('')
  const [editingBucket, setEditingBucket] = useState(null)
  const [bucketDraft, setBucketDraft] = useState('')
  const inputRef = useRef(null)
  const dragPiece = useRef(null)
  const timers = useRef([])
  const isPlaying = status === 'playing'

  useEffect(() => () => timers.current.forEach(window.clearTimeout), [])

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

  const beginDrag = (piece, event) => {
    if (!isPlaying) return
    dragPiece.current = piece
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(piece))
  }

  const placePiece = (piece, destination) => {
    if (!isPlaying || piece === null || piece === undefined) return
    const next = movePiece(puzzle, piece, destination)
    setPuzzle(next)
    setSelected(null)
    setMoves((value) => value + 1)
    if (isSolved(next.board)) setStatus('won')
  }

  const receiveDrop = (destination) => (event) => {
    event.preventDefault()
    const raw = event.dataTransfer.getData('text/plain')
    const transferred = raw === '' ? Number.NaN : Number(raw)
    const piece = Number.isInteger(transferred) ? transferred : dragPiece.current
    placePiece(piece, destination)
  }

  const startGame = () => {
    timers.current.forEach(window.clearTimeout)
    setSelected(null)
    setMoves(0)
    setRemaining(duration)
    setStatus('shuffling')
    setShufflePhase('gathering')

    timers.current = [
      window.setTimeout(() => {
        setShufflePhase('to-tray')
        setPuzzle((current) => ({ board: Array(grid.count).fill(null), tray: shuffle(makeSolved(grid.count)), buckets: cleanBuckets(current.buckets) }))
        setStatus('playing')
      }, 720),
      window.setTimeout(() => setShufflePhase(null), 1250),
    ]
  }

  const resetPuzzle = (nextGrid = grid) => {
    timers.current.forEach(window.clearTimeout)
    setPuzzle((current) => ({ board: makeSolved(nextGrid.count), tray: [], buckets: cleanBuckets(current.buckets) }))
    setSelected(null)
    setMoves(0)
    setRemaining(duration)
    setShufflePhase(null)
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

  const createBucket = () => {
    if (puzzle.buckets.length >= 3) return
    setPuzzle((current) => addBucket(current, newBucketName))
    setNewBucketName('')
  }

  const saveBucketName = (id) => {
    setPuzzle((current) => renameBucket(current, id, bucketDraft))
    setEditingBucket(null)
  }

  const removeBucket = (id) => {
    if (!window.confirm('Delete this bucket? Its pieces will return to the loose pile.')) return
    setPuzzle((current) => deleteBucket(current, id))
  }

  const selectPiece = (piece) => {
    if (!isPlaying) return
    setSelected((current) => current === piece ? null : piece)
  }

  const clickBoardSlot = (piece, index) => {
    if (!isPlaying) return
    if (selected !== null) placePiece(selected, { type: 'board', index })
    else if (piece !== null) setSelected(piece)
  }

  const message = status === 'won' ? 'Puzzle complete!' : status === 'lost' ? 'Time is up' : status === 'shuffling' ? 'Gathering the pieces…' : isPlaying ? 'Drag pieces to the board or sort them first' : 'Choose your settings, then jumble'

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Piecework home"><span className="brand-mark">P</span> Piecework</a>
        <p>Turn any image into a tactile challenge.</p>
      </header>

      <section className="workspace" id="top">
        <aside className="controls" aria-label="Puzzle settings">
          <div className="eyebrow">Puzzle setup</div>
          <h1>Make the pieces yours.</h1>
          <p className="intro">Upload a PNG, JPEG, or WebP. Your image stays in this browser.</p>
          <button className="upload" type="button" onClick={() => inputRef.current?.click()}>
            <span className="upload-icon">↥</span><span><strong>Choose an image</strong><small>PNG, JPEG or WEBP</small></span>
          </button>
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={loadImage} hidden />
          <div className="filename"><span className="dot" />{fileName}</div>

          <fieldset className="size-fieldset">
            <div className="size-heading"><span className="fieldset-label">Puzzle size</span><strong>{grid.count} pieces</strong></div>
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
            <div className="slider-meta"><span>{grid.rows} rows × {grid.cols} columns</span><span>{gridOptions[0].count}–{gridOptions.at(-1).count}</span></div>
            <p className="ratio-note">Based on {imageMeta.width} × {imageMeta.height}px image ratio</p>
            {grid.count >= 500 && <p className="size-warning">Large puzzles may take longer to arrange.</p>}
          </fieldset>

          <fieldset>
            <legend>Challenge mode</legend>
            <div className="mode-row">
              <button type="button" className={!timed ? 'active' : ''} onClick={() => { setTimed(false); resetPuzzle() }}>No timer</button>
              <button type="button" className={timed ? 'active' : ''} onClick={() => { setTimed(true); resetPuzzle() }}>Timed</button>
            </div>
            {timed && <label className="time-control">Time limit <span><input type="number" min="10" max="3600" value={duration} onChange={(event) => setDuration(Math.max(10, Number(event.target.value) || 10))} /> seconds</span></label>}
          </fieldset>

          <button className="primary" type="button" onClick={startGame} disabled={status === 'shuffling'}>{isPlaying || status === 'won' || status === 'lost' ? 'Jumble again' : 'Jumble puzzle'} <span>→</span></button>
          <p className="hint">Drag pieces onto the board. Click a piece, then an empty slot, for touch devices.</p>
        </aside>

        <section className="game-area" aria-live="polite">
          <div className="game-meta">
            <div><span className={`status-dot ${status}`} /> <strong>{message}</strong></div>
            <div className="stats"><span>Moves <strong>{moves}</strong></span>{timed && <span className={remaining <= 10 ? 'urgent' : ''}>Time <strong>{formatTime(remaining)}</strong></span>}</div>
          </div>

          <div className="puzzle-stage">
            <div className="board-wrap">
              <div className={`board ${status}`} style={{ gridTemplateColumns: `repeat(${grid.cols}, 1fr)`, aspectRatio: `${grid.cols} / ${grid.rows}` }}>
                {puzzle.board.map((piece, index) => (
                  <div
                    className={`board-slot ${piece === null ? 'empty' : ''}`}
                    key={`slot-${index}`}
                    onClick={() => clickBoardSlot(piece, index)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={receiveDrop({ type: 'board', index })}
                  >
                    {piece !== null && <PieceButton piece={piece} grid={grid} image={image} instanceKey={`board-${index}`} selected={selected === piece} onClick={(event) => { event.stopPropagation(); selectPiece(piece) }} onDragStart={(event) => beginDrag(piece, event)} />}
                  </div>
                ))}

                {shufflePhase && <div className={`shuffle-overlay ${shufflePhase}`} style={{ gridTemplateColumns: `repeat(${grid.cols}, 1fr)` }}>
                  {makeSolved(grid.count).map((piece, index) => {
                    const row = Math.floor(index / grid.cols)
                    const col = index % grid.cols
                    const centerX = (grid.cols - 1) / 2
                    const centerY = (grid.rows - 1) / 2
                    return <PieceButton key={`shuffle-${piece}`} piece={piece} grid={grid} image={image} instanceKey={`shuffle-${piece}`} className="shuffle-piece" style={{ '--tx': centerX - col, '--ty': centerY - row, '--rot': `${((piece * 37) % 31) - 15}deg`, '--delay': `${(piece % 7) * 12}ms` }} />
                  })}
                </div>}

                {(status === 'won' || status === 'lost') && <div className="result-card"><span>{status === 'won' ? 'Solved' : 'Try again'}</span><strong>{status === 'won' ? `${moves} moves${timed ? ` · ${formatTime(remaining)} left` : ''}` : 'The picture is waiting.'}</strong><button type="button" onClick={startGame}>Jumble again</button></div>}
              </div>
              <button className="preview-button" type="button" onClick={() => setShowPreview(true)}>Peek at the reference</button>
            </div>

            <aside className="organizer" aria-label="Piece organizer">
              <div className="organizer-heading"><div><span className="eyebrow">Piece tray</span><strong>Sort before solving</strong></div><span>{puzzle.tray.length} loose</span></div>
              <div className={`piece-tray ${shufflePhase === 'to-tray' ? 'incoming' : ''} ${selected !== null ? 'target-ready' : ''}`} onClick={() => selected !== null && placePiece(selected, { type: 'tray' })} onDragOver={(event) => event.preventDefault()} onDrop={receiveDrop({ type: 'tray' })}>
                {puzzle.tray.length === 0 && isPlaying && <p>Drop loose pieces here</p>}
                {puzzle.tray.map((piece, index) => <PieceButton key={`tray-${piece}`} piece={piece} grid={grid} image={image} instanceKey={`tray-${piece}`} className="tray-piece" selected={selected === piece} onClick={(event) => { event.stopPropagation(); selectPiece(piece) }} onDragStart={(event) => beginDrag(piece, event)} style={{ '--pile-r': `${((piece * 29) % 17) - 8}deg`, '--arrival': `${(index % 40) * 12}ms` }} />)}
              </div>

              <div className="bucket-title"><span>Sorting buckets</span><small>{puzzle.buckets.length}/3</small></div>
              <div className="bucket-list">
                {puzzle.buckets.map((bucket) => (
                  <section className={`bucket ${selected !== null ? 'target-ready' : ''}`} key={bucket.id} onClick={() => selected !== null && placePiece(selected, { type: 'bucket', id: bucket.id })} onDragOver={(event) => event.preventDefault()} onDrop={receiveDrop({ type: 'bucket', id: bucket.id })}>
                    <header>
                      {editingBucket === bucket.id ? <form onSubmit={(event) => { event.preventDefault(); saveBucketName(bucket.id) }}><input autoFocus value={bucketDraft} onChange={(event) => setBucketDraft(event.target.value)} aria-label="Bucket name" /><button type="submit" title="Save name">✓</button></form> : <button className="bucket-name" type="button" onClick={(event) => { event.stopPropagation(); setEditingBucket(bucket.id); setBucketDraft(bucket.name) }} title="Rename bucket">{bucket.name}</button>}
                      <span>{bucket.pieces.length}</span>
                      <button className="delete-bucket" type="button" title="Delete bucket" aria-label={`Delete ${bucket.name}`} onClick={(event) => { event.stopPropagation(); removeBucket(bucket.id) }}>×</button>
                    </header>
                    <div className="bucket-pieces">
                      {bucket.pieces.length === 0 && <p>Drop pieces here</p>}
                      {bucket.pieces.map((piece) => <PieceButton key={`${bucket.id}-${piece}`} piece={piece} grid={grid} image={image} instanceKey={`${bucket.id}-${piece}`} className="bucket-piece" selected={selected === piece} onClick={(event) => { event.stopPropagation(); selectPiece(piece) }} onDragStart={(event) => beginDrag(piece, event)} />)}
                    </div>
                  </section>
                ))}
              </div>

              {puzzle.buckets.length < 3 && <form className="add-bucket" onSubmit={(event) => { event.preventDefault(); createBucket() }}><input value={newBucketName} onChange={(event) => setNewBucketName(event.target.value)} placeholder={puzzle.buckets.length === 0 ? 'e.g. Corner pieces' : 'New bucket name'} aria-label="New bucket name" /><button type="submit">Add</button></form>}
              <p className="organizer-tip">Name buckets for any strategy—corners, edges, colors, or patterns.</p>
            </aside>
          </div>
        </section>
      </section>

      {showPreview && <div className="preview-modal" role="dialog" aria-modal="true" aria-label="Original image preview" onClick={() => setShowPreview(false)}><img src={image} alt="Original puzzle reference" /><p>Click to return</p></div>}
    </main>
  )
}

export default App
