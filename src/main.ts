import '@fontsource/manrope/latin-400.css'
import '@fontsource/manrope/latin-500.css'
import '@fontsource/manrope/latin-600.css'
import '@fontsource/manrope/latin-700.css'
import '@fontsource/manrope/latin-800.css'
import '@fontsource/dm-mono/latin-400.css'
import '@fontsource/dm-mono/latin-500.css'
import './styles.css'

type Phase = 'idle' | 'inspecting' | 'ready' | 'processing' | 'success' | 'error'

type WorkerResponse =
  | { type: 'inspected'; requestId: number; inputPages: number; outputPages: number }
  | { type: 'progress'; requestId: number; completedPages: number; totalPages: number }
  | {
      type: 'converted'
      requestId: number
      bytes: ArrayBuffer
      inputPages: number
      outputPages: number
    }
  | { type: 'error'; requestId: number; code: string; message: string }

const app = document.querySelector<HTMLDivElement>('#app')!
const worker = new Worker(new URL('./pdf-worker.ts', import.meta.url), { type: 'module' })

let phase: Phase = 'idle'
let selectedFile: File | null = null
let inputPages = 0
let outputPages = 0
let completedPages = 0
let errorMessage = ''
let outputUrl: string | null = null
let requestId = 0

function escapeHtml(value: string): string {
  const element = document.createElement('span')
  element.textContent = value
  return element.innerHTML
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

function getDownloadName(file: File): string {
  const baseName = file.name.replace(/\.pdf$/i, '') || 'document'
  return `${baseName}-half-letter.pdf`
}

function releaseOutputUrl(): void {
  if (outputUrl) URL.revokeObjectURL(outputUrl)
  outputUrl = null
}

function getActiveStep(): number {
  if (phase === 'processing') return 2
  if (phase === 'success') return 3
  return 1
}

function renderSteps(): string {
  const activeStep = getActiveStep()
  const labels = ['Add PDF', 'Cut & rotate', 'Download']

  return labels
    .map((label, index) => {
      const step = index + 1
      const classes = ['step']
      if (step === activeStep) classes.push('is-current')
      if (step < activeStep) classes.push('is-complete')
      return `<span class="${classes.join(' ')}"><b>${step < activeStep ? '✓' : step}</b>${label}</span>`
    })
    .join('')
}

function renderFileSummary(status: string): string {
  if (!selectedFile) return ''

  return `
    <div class="file-card">
      <span class="pdf-file-icon" aria-hidden="true">PDF</span>
      <span class="file-card-copy">
        <strong>${escapeHtml(selectedFile.name)}</strong>
        <span>${formatBytes(selectedFile.size)}</span>
      </span>
      <span class="file-status">${status}</span>
    </div>
  `
}

function renderPanelContent(): string {
  const fileInput = `
    <input class="sr-only" id="file-input" type="file" accept="application/pdf,.pdf" />
  `

  if (phase === 'idle') {
    return `${fileInput}
      <button class="drop-zone" type="button" data-action="choose-file" aria-describedby="file-help">
        <span class="upload-icon" aria-hidden="true">
          <svg viewBox="0 0 48 48">
            <path d="M14 5h14l8 8v27a3 3 0 0 1-3 3H14a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3Z" />
            <path d="M28 5v9h8M24 33V20m-6 6 6-6 6 6" />
          </svg>
        </span>
        <span class="drop-title">Drop your PDF here</span>
        <span class="drop-copy">or choose a file from your device</span>
        <span class="choose-button">Choose PDF</span>
      </button>
      <p class="file-help" id="file-help">
        Pages are accepted when each rotated half fits on Letter at full size.
      </p>
    `
  }

  if (phase === 'inspecting') {
    return `${fileInput}
      <div class="state-panel" aria-live="polite">
        ${renderFileSummary('Checking')}
        <span class="spinner" aria-hidden="true"></span>
        <h3>Checking page sizes…</h3>
        <p>Making sure every page can be cut at full physical size.</p>
      </div>
    `
  }

  if (phase === 'ready') {
    return `${fileInput}
      <div class="state-panel state-panel-ready" aria-live="polite">
        ${renderFileSummary('Ready')}
        <div class="page-count">
          <span><strong>${inputPages}</strong> source ${inputPages === 1 ? 'page' : 'pages'}</span>
          <span class="count-arrow" aria-hidden="true">→</span>
          <span><strong>${outputPages}</strong> Letter ${outputPages === 1 ? 'page' : 'pages'}</span>
        </div>
        <h3>Ready to split and center</h3>
        <p>Each page is cut halfway along its long side. Top or left comes first; every half is rotated clockwise and kept at exactly 1:1 scale.</p>
        <div class="action-row">
          <button class="secondary-action" type="button" data-action="reset">Start Over</button>
          <button class="primary-action" type="button" data-action="convert">Prepare PDF</button>
        </div>
      </div>
    `
  }

  if (phase === 'processing') {
    const percentage = outputPages === 0 ? 0 : Math.round((completedPages / outputPages) * 100)
    return `
      <div class="state-panel" aria-live="polite">
        ${renderFileSummary('Processing')}
        <div class="progress-orbit" aria-hidden="true"><span>${percentage}%</span></div>
        <h3>Cutting and centering…</h3>
        <p>Prepared ${completedPages} of ${outputPages} Letter pages.</p>
        <div class="progress-track" role="progressbar" aria-label="PDF conversion progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percentage}">
          <span style="width: ${percentage}%"></span>
        </div>
      </div>
    `
  }

  if (phase === 'success' && selectedFile && outputUrl) {
    return `
      <div class="state-panel state-panel-success" aria-live="polite">
        ${renderFileSummary('Complete')}
        <span class="success-mark" aria-hidden="true">✓</span>
        <h3>Your US Letter-size PDF is ready</h3>
        <div class="action-row">
          <button class="secondary-action" type="button" data-action="reset">Start Over</button>
          <a class="primary-action" href="${outputUrl}" download="${escapeHtml(getDownloadName(selectedFile))}">Download PDF</a>
        </div>
      </div>
    `
  }

  return `${fileInput}
    <div class="state-panel state-panel-error" role="alert">
      ${selectedFile ? renderFileSummary('Needs attention') : ''}
      <span class="error-mark" aria-hidden="true">!</span>
      <h3>This PDF could not be prepared</h3>
      <p>${escapeHtml(errorMessage)}</p>
      <button class="primary-action" type="button" data-action="reset">Start Over</button>
    </div>
  `
}

function render(): void {
  app.innerHTML = `
    <header class="site-header">
      <a class="brand" href="./" aria-label="PDF Half-Cutter home">
        <span class="brand-mark" aria-hidden="true"><span></span></span>
        <span>PDF Half-Cutter</span>
      </a>
    </header>

    <main>
      <section class="intro" aria-labelledby="page-title">
        <h1 id="page-title">Split. Rotate. Center.</h1>
        <p class="lede">
          Cut each PDF page once along its longest side, then rotate and center both halves
          on US Letter without changing their physical size.
        </p>
      </section>

      <section class="workbench" aria-label="PDF converter">
        <div class="upload-panel">
          <div class="step-row" aria-label="Three-step process">${renderSteps()}</div>
          ${renderPanelContent()}
        </div>

        <aside class="process-card" aria-labelledby="process-title">
          <div class="process-heading">
            <p class="eyebrow">What comes out</p>
            <h2 id="process-title">Two centered Letter pages</h2>
          </div>

          <div class="paper-flow" aria-hidden="true">
            <div class="a4-paper">
              <span class="paper-label">SOURCE</span>
              <div class="half half-top">FIRST</div>
              <div class="cut-line"><span>cut</span></div>
              <div class="half half-bottom">SECOND</div>
            </div>
            <svg class="flow-arrow" viewBox="0 0 64 32">
              <path d="M4 16h50m-9-9 9 9-9 9" />
            </svg>
            <div class="letter-stack">
              <div class="letter-paper letter-back"><span class="rotated-half">SECOND</span></div>
              <div class="letter-paper">
                <span class="paper-label">LETTER</span>
                <span class="rotated-half">FIRST</span>
              </div>
            </div>
          </div>

          <dl class="measurements">
            <div><dt>Scale</dt><dd>Exactly 1:1</dd></div>
            <div><dt>Cut</dt><dd>Halfway on long side</dd></div>
            <div><dt>Letter orientation</dt><dd>Automatic</dd></div>
          </dl>
        </aside>
      </section>
    </main>

    <footer>
      <a href="https://github.com/EpicPi/pdf-cutter">View source</a>
    </footer>
  `
}

function reset(): void {
  requestId += 1
  releaseOutputUrl()
  phase = 'idle'
  selectedFile = null
  inputPages = 0
  outputPages = 0
  completedPages = 0
  errorMessage = ''
  render()
}

function showError(message: string): void {
  releaseOutputUrl()
  errorMessage = message
  phase = 'error'
  render()
}

async function inspectSelectedFile(file: File): Promise<void> {
  requestId += 1
  const thisRequest = requestId
  releaseOutputUrl()
  selectedFile = file
  phase = 'inspecting'
  errorMessage = ''
  render()

  if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
    showError('Please choose a PDF file.')
    return
  }

  try {
    const bytes = await file.arrayBuffer()
    if (thisRequest !== requestId) return
    worker.postMessage({ type: 'inspect', requestId: thisRequest, bytes }, [bytes])
  } catch {
    if (thisRequest === requestId) showError('This file could not be read from your device.')
  }
}

async function convertSelectedFile(): Promise<void> {
  if (!selectedFile) return

  requestId += 1
  const thisRequest = requestId
  phase = 'processing'
  completedPages = 0
  render()

  try {
    const bytes = await selectedFile.arrayBuffer()
    if (thisRequest !== requestId) return
    worker.postMessage({ type: 'convert', requestId: thisRequest, bytes }, [bytes])
  } catch {
    if (thisRequest === requestId) showError('This file could not be read from your device.')
  }
}

worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
  const message = event.data
  if (message.requestId !== requestId) return

  if (message.type === 'inspected') {
    inputPages = message.inputPages
    outputPages = message.outputPages
    phase = 'ready'
    render()
    return
  }

  if (message.type === 'progress') {
    completedPages = message.completedPages
    outputPages = message.totalPages
    render()
    return
  }

  if (message.type === 'converted') {
    releaseOutputUrl()
    inputPages = message.inputPages
    outputPages = message.outputPages
    completedPages = message.outputPages
    outputUrl = URL.createObjectURL(new Blob([message.bytes], { type: 'application/pdf' }))
    phase = 'success'
    render()
    return
  }

  showError(message.message)
})

worker.addEventListener('error', () => {
  showError('The browser could not start the PDF processor. Please reload and try again.')
})

app.addEventListener('click', (event) => {
  const actionElement = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')
  if (!actionElement) return

  const action = actionElement.dataset.action
  if (action === 'choose-file') {
    document.querySelector<HTMLInputElement>('#file-input')?.click()
  } else if (action === 'convert') {
    void convertSelectedFile()
  } else if (action === 'reset') {
    reset()
  }
})

app.addEventListener('change', (event) => {
  const input = event.target as HTMLInputElement
  if (input.id !== 'file-input') return
  const file = input.files?.[0]
  if (file) void inspectSelectedFile(file)
})

app.addEventListener('dragover', (event) => {
  const dropZone = (event.target as HTMLElement).closest<HTMLElement>('.drop-zone')
  if (!dropZone) return
  event.preventDefault()
  dropZone.classList.add('is-dragging')
})

app.addEventListener('dragleave', (event) => {
  const dropZone = (event.target as HTMLElement).closest<HTMLElement>('.drop-zone')
  dropZone?.classList.remove('is-dragging')
})

app.addEventListener('drop', (event) => {
  const dropZone = (event.target as HTMLElement).closest<HTMLElement>('.drop-zone')
  if (!dropZone) return
  event.preventDefault()
  dropZone.classList.remove('is-dragging')
  const file = event.dataTransfer?.files[0]
  if (file) void inspectSelectedFile(file)
})

window.addEventListener('beforeunload', releaseOutputUrl)

render()
