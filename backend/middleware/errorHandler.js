const errorHandler = (err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  const isProd = process.env.NODE_ENV === 'production';
  console.error('Unhandled error:', err);
  res.status(statusCode).json({
    // err.message was always sent to the client, even in production —
    // occasionally surfacing internal Mongo/Cloudinary/payment-provider
    // detail. Only expose it for client errors (4xx, where the message is
    // meant to explain what the caller did wrong); genuine 5xx internals are
    // logged above and get a generic message instead.
    message: (isProd && statusCode >= 500) ? 'Something went wrong. Please try again.' : err.message,
    stack: isProd ? null : err.stack,
  });
};

module.exports = errorHandler;
