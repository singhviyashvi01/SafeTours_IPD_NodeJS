const ApiError = require('../utils/apiError');

/**
 * Restricts a route to users holding one of the given roles. Must run after verifyJWT.
 *   router.get('/admin/x', verifyJWT, requireRole('admin'), handler)
 */
const requireRole = (...roles) => (req, res, next) => {
  const role = req.user?.role || 'user';
  if (!roles.includes(role)) {
    return next(new ApiError(403, 'Forbidden – insufficient permissions'));
  }
  return next();
};

module.exports = { requireRole };
