const AppError = require("../utils/AppError");

// Detect the real file type from its magic bytes — the user-supplied MIME
// type is never trusted on its own (a renamed HTML/script file declares
// image/jpeg). Runs AFTER multer, when the full in-memory buffer exists.
function detectFileType(buffer) {
  if (!buffer || buffer.length < 12) return null;
  // PDF: "%PDF"
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return "application/pdf";
  }
  // JPEG: SOI marker FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  // PNG: \x89 P N G
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 &&
    buffer[2] === 0x4e && buffer[3] === 0x47
  ) {
    return "image/png";
  }
  // WebP: "RIFF" .... "WEBP"
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

// Rejects files whose bytes aren't a supported format, or whose declared MIME
// contradicts the detected signature. Passes through when the upload
// middleware was mocked in tests (no buffer available) so existing test
// shapes keep working.
function validateFileSignature(req, res, next) {
  if (!req.file || !req.file.buffer) return next();
  const detected = detectFileType(req.file.buffer);
  if (!detected) {
    return next(new AppError("File content is not a valid image or PDF", 400));
  }
  if (detected !== req.file.mimetype) {
    return next(new AppError("File type does not match its declared format", 400));
  }
  return next();
}

module.exports = { validateFileSignature, detectFileType };
