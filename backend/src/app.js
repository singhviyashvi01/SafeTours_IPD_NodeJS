const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

// import routes
const authRoutes = require('./routes/authRoutes');
const profileRoutes = require('./routes/profileRoutes');
const emergencyContactRoutes = require('./routes/emergencyContactRoutes');
const locationRoutes = require('./routes/locationRoutes');
const journeyRoutes = require('./routes/journeyRoutes');
const weatherRoutes = require('./routes/weather.routes');
const environmentRoutes = require('./routes/environment.routes');
const crowdRoutes = require('./routes/crowd.routes');
const crimeRoutes = require('./modules/crime/crimeRoutes');
const dangerZoneRoutes = require('./routes/dangerZone.routes');
const sosRoutes = require('./routes/sosRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const communityRoutes = require('./routes/community.routes');

const { errorMiddleware } = require('./middleware/errorMiddleware');

const app = express();

// ─── Security headers ─────────────────────────────────────────────────────────
app.use(helmet());

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || '*',
    credentials: true,
  })
);

// ─── Request rate limiting (auth routes get tighter limits) ──────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many auth attempts, please try again in 15 minutes.' },
});

app.use(globalLimiter);

// ─── Body parsers ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: true, limit: '16kb' }));
app.use(cookieParser());

// ─── HTTP request logger (dev only) ──────────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is healthy 🚀'
  });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/profile', profileRoutes);

app.use('/api/contacts', emergencyContactRoutes);

app.use('/api/location', locationRoutes);

app.use('/api/journey', journeyRoutes);

app.use('/api/sos', sosRoutes);

app.use('/api/notifications', notificationRoutes);

app.use('/api/weather', weatherRoutes);

app.use('/api/environment', environmentRoutes);

app.use('/api/crowd', crowdRoutes);

app.use('/api/crime', crimeRoutes);

app.use('/api/danger-zones', dangerZoneRoutes);
app.use('/api/community', communityRoutes);

// ─── 404 handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`
  });
});

// ─── Global error handler (must be last) ─────────────────────────────────────
app.use(errorMiddleware);

module.exports = app;