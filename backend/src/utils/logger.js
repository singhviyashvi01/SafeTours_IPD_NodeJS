/**
 * Centralised logging utility for SafeTours.
 * Uses standard streams to isolate logs and conforms to "Never use console.log" rule in services/controllers.
 */
const logger = {
  info: (message) => {
    process.stdout.write(`[INFO] ${new Date().toISOString()}: ${message}\n`);
  },
  warn: (message) => {
    process.stdout.write(`[WARN] ${new Date().toISOString()}: ${message}\n`);
  },
  error: (message, error) => {
    const errorDetails = error ? ` - ${error.stack || error}` : '';
    process.stderr.write(`[ERROR] ${new Date().toISOString()}: ${message}${errorDetails}\n`);
  },
};

module.exports = logger;
