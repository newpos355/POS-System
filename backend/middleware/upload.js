/**
 * File Upload Security Middleware — ApexPOS Platform
 *
 * Restricts uploads to safe image formats only.
 * Rejects executables, scripts, PDFs, and any non-image MIME types.
 */

const multer = require('multer');
const path   = require('path');

// ── Allowed image MIME types ──────────────────────────────────────────────────
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
]);

// ── Allowed file extensions (double-check against MIME spoofing) ──────────────
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

const fileFilter = (req, file, cb) => {
  const ext  = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype.toLowerCase();

  if (!ALLOWED_MIME_TYPES.has(mime)) {
    return cb(new Error(`File type '${file.mimetype}' is not allowed. Only images (JPG, PNG, WebP, GIF) are accepted.`), false);
  }

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return cb(new Error(`File extension '${ext}' is not allowed. Only .jpg, .jpeg, .png, .webp, .gif are accepted.`), false);
  }

  cb(null, true);
};

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,   // 5 MB max per file
    files: 5,                      // Max 5 files per request
    fields: 20,                    // Max 20 non-file fields
  },
  fileFilter,
});

// Error handler wrapper — converts Multer errors to JSON responses
const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'File too large. Maximum size is 5MB.' });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ success: false, message: 'Too many files. Maximum 5 files per upload.' });
    }
    return res.status(400).json({ success: false, message: err.message });
  }
  if (err && err.message && err.message.includes('not allowed')) {
    return res.status(400).json({ success: false, message: err.message });
  }
  next(err);
};

module.exports = { upload, handleUploadError };
