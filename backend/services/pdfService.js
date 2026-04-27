const fs = require('fs');
const pdfParse = require('pdf-parse');

/**
 * Shared helper: extract text from a PDF buffer using a three-level fallback.
 * 1. Primary:  pdf-parse (CommonJS, works reliably on Render)
 * 2. Fallback: unpdf (with mergePages: true to get a single string)
 * 3. Fallback: pdfjs-dist (Mozilla PDF.js, legacy build for Node.js via dynamic import)
 *
 * @param {Buffer} buffer - The raw PDF file bytes
 * @returns {Promise<{ text: string, pageCount: number }>}
 */
const extractTextFromBuffer = async (buffer) => {
  // --- Attempt 1: pdf-parse ---
  try {
    const result = await pdfParse(buffer);
    const text = (result.text || '').replace(/\0/g, '').trim();
    const pageCount = result.numpages || 0;

    if (text.length > 0 && pageCount > 0) {
      console.log('[PDF] Extracted with pdf-parse');
      return { text, pageCount };
    }

    // pdf-parse returned empty text or zero pages — fall through
    console.warn('[PDF] pdf-parse returned empty result, falling back to unpdf');
  } catch (pdfParseErr) {
    console.warn('[PDF] pdf-parse failed, falling back to unpdf:', pdfParseErr.message);
  }

  // --- Attempt 2: unpdf ---
  try {
    const { extractText: unpdfExtract, getDocumentProxy } = await import('unpdf');
    const doc = await getDocumentProxy(new Uint8Array(buffer));
    const result = await unpdfExtract(doc, { mergePages: true });

    const text = (typeof result.text === 'string' ? result.text : Array.isArray(result.text) ? result.text.join('\n') : '').replace(/\0/g, '').trim();
    const pageCount = result.totalPages || 0;

    if (text.length > 0 && pageCount > 0) {
      console.log('[PDF] Extracted with unpdf');
      return { text, pageCount };
    }

    // unpdf returned empty / zero-page — treat as failure and fall through
    console.warn('[PDF] unpdf returned empty result, falling back to pdfjs-dist');
  } catch (unpdfErr) {
    console.warn('[PDF] unpdf failed, falling back to pdfjs-dist:', unpdfErr.message);
  }

  // --- Attempt 3: pdfjs-dist (legacy build, ESM-only in v5, use dynamic import) ---
  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = '';

    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer), disableWorker: true });
    const doc = await loadingTask.promise;

    const pageTexts = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageStr = content.items.map(item => item.str).join(' ');
      pageTexts.push(pageStr);
    }

    const text = pageTexts.join('\n').replace(/\0/g, '').trim();
    const pageCount = doc.numPages;

    console.log('[PDF] Extracted with pdfjs-dist');
    return { text, pageCount };
  } catch (pdfjsErr) {
    throw new Error(`Both PDF extractors failed. pdfjs-dist error: ${pdfjsErr.message}`);
  }
};

const extractText = async (filePath) => {
  try {
    const buffer = fs.readFileSync(filePath);
    const { text, pageCount } = await extractTextFromBuffer(buffer);
    return {
      text: text || '',
      pageCount: pageCount || 0,
      info: {}
    };
  } catch (err) {
    console.error('PDF parse error:', err.message);
    return { text: '', pageCount: 0, info: {} };
  }
};

/**
 * Extract text from a PDF in the background, updating the DB record when done.
 * This is fire-and-forget — the caller does not await it.
 * @param {string} filePath - Path to the PDF on disk
 * @param {string} pdfId - DB id of the PDF record to update
 * @param {Function} queryFn - The DB query function
 */
const extractTextInBackground = (filePath, pdfId, queryFn) => {
  // Intentionally not awaited by the caller — runs async in the background
  (async () => {
    try {
      console.log(`[PDF] Starting background text extraction for PDF ${pdfId}`);
      const buffer = fs.readFileSync(filePath);

      // Set a timeout for extraction — abort if it takes > 60s
      const extractionPromise = extractTextFromBuffer(buffer);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Text extraction timed out after 60s')), 60000)
      );

      const data = await Promise.race([extractionPromise, timeoutPromise]);
      const extractedText = (data.text || '').slice(0, 100000); // cap at 100k chars
      const pageCount = data.pageCount || 0;

      await queryFn(
        'UPDATE pdfs SET extracted_text = $1, page_count = $2 WHERE id = $3',
        [extractedText, pageCount, pdfId]
      );

      console.log(`[PDF] Background extraction complete for PDF ${pdfId} (${pageCount} pages)`);
    } catch (err) {
      console.error(`[PDF] Background extraction failed for PDF ${pdfId}:`, err.message);
      // Non-fatal — the PDF record already exists, just without extracted text
    }
  })();
};

module.exports = { extractText, extractTextInBackground };
