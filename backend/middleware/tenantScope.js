const tenantScope = (req, res, next) => {
  if (!req.tenantId) {
    return res.status(400).json({ message: 'Tenant context is missing.' });
  }
  next();
};

module.exports = tenantScope;
