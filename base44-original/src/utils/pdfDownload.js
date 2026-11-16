/**
 * Saves or opens a jsPDF document.
 * In iframe environments (e.g. Base44 builder preview), downloads are blocked,
 * so we open the PDF in a new browser tab instead.
 */
export function savePdf(doc, filename) {
  const isIframe = typeof window !== 'undefined' && window.self !== window.top;
  if (isIframe) {
    const blobUrl = doc.output('bloburl');
    window.open(blobUrl, '_blank');
    return;
  }
  doc.save(filename);
}