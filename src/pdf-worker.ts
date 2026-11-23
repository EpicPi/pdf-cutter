/// <reference lib="webworker" />

import { PdfCutterError, convertPdf, inspectPdf } from './pdf/convert'

type WorkerRequest =
  | { type: 'inspect'; requestId: number; bytes: ArrayBuffer }
  | { type: 'convert'; requestId: number; bytes: ArrayBuffer }

interface ErrorResponse {
  type: 'error'
  requestId: number
  code: string
  message: string
}

const worker = self as unknown as DedicatedWorkerGlobalScope

function serializeError(error: unknown, requestId: number): ErrorResponse {
  if (error instanceof PdfCutterError) {
    return {
      type: 'error',
      requestId,
      code: error.code,
      message: error.message,
    }
  }

  return {
    type: 'error',
    requestId,
    code: 'unexpected',
    message: 'Something went wrong while preparing this PDF. Please try another file.',
  }
}

worker.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data

  try {
    if (request.type === 'inspect') {
      const result = await inspectPdf(request.bytes)
      worker.postMessage({ type: 'inspected', requestId: request.requestId, ...result })
      return
    }

    const result = await convertPdf(request.bytes, (completedPages, totalPages) => {
      worker.postMessage({
        type: 'progress',
        requestId: request.requestId,
        completedPages,
        totalPages,
      })
    })

    const transferableBytes = result.bytes.buffer.slice(
      result.bytes.byteOffset,
      result.bytes.byteOffset + result.bytes.byteLength,
    )

    worker.postMessage(
      {
        type: 'converted',
        requestId: request.requestId,
        bytes: transferableBytes,
        inputPages: result.inputPages,
        outputPages: result.outputPages,
      },
      [transferableBytes],
    )
  } catch (error) {
    worker.postMessage(serializeError(error, request.requestId))
  }
})

export {}
