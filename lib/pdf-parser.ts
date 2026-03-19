import { createCanvas } from 'canvas'

/**
 * PDF → base64 PNG 이미지 배열로 변환
 * pdfjs-dist + canvas 사용 (로컬/서버 환경)
 *
 * Vercel 배포 시 canvas native binaries 필요.
 * 빌드 오류 발생 시 NEXT_PUBLIC_USE_PDF_FALLBACK=1 설정으로
 * OpenAI Files API 경로(preparePdfForOpenAI)를 사용할 것.
 */
export async function pdfToImages(buffer: Buffer): Promise<string[]> {
  // pdfjs-dist legacy 빌드: Node.js 환경 지원
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')

  // Node.js 환경에서 worker 비활성화
  pdfjsLib.GlobalWorkerOptions.workerSrc = ''

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  })

  const pdf = await loadingTask.promise
  const images: string[] = []

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const viewport = page.getViewport({ scale: 2.0 })

    const canvas = createCanvas(viewport.width, viewport.height)
    const context = canvas.getContext('2d')

    await page.render({
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport,
      canvas: canvas as unknown as HTMLCanvasElement,
    }).promise

    // base64 PNG (data: 접두사 제외)
    const dataUrl = canvas.toDataURL('image/png')
    images.push(dataUrl.split(',')[1])
  }

  return images
}

/**
 * PDF를 OpenAI Vision API에 전달할 수 있는 형태로 준비
 * 각 페이지를 { type: 'image_url', image_url: { url: 'data:image/png;base64,...' } } 형태로 반환
 */
export async function preparePdfForVision(buffer: Buffer) {
  const images = await pdfToImages(buffer)
  return images.map((b64) => ({
    type: 'image_url' as const,
    image_url: {
      url: `data:image/png;base64,${b64}`,
      detail: 'high' as const,
    },
  }))
}
