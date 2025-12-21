require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const { connectDatabase } = require('./config/database');
const logger = require('./utils/logger');

// Create Express app
const app = express();

// Middleware
app.use(helmet());

// CORS configuration - allow multiple origins
const allowedOrigins = [
  'http://localhost:3000', // Local development
  'https://zenpay-frontend-mocha.vercel.app', // Vercel production
  'https://zenpay-frontend.netlify.app'
];

// Add FRONTEND_URL from environment if provided
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// Health check with database status
app.get('/health', async (req, res) => {
  const { prisma } = require('./config/database');
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: 'disconnected',
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    health.database = 'connected';
    res.json(health);
  } catch (error) {
    health.database = 'error';
    health.error = error.message;
    res.status(503).json(health);
  }
});

// API Routes
app.use('/api/v1/auth', require('./routes/authRoutes'));
app.use('/api/v1/employees', require('./routes/employeeRoutes'));
app.use('/api/v1/payments', require('./routes/paymentRoutes'));
app.use('/api/v1/invoices', require('./routes/invoiceRoutes'));
app.use('/api/v1/receipts', require('./routes/receiptRoutes'));
app.use('/api/v1/analytics', require('./routes/analyticsRoutes'));
app.use('/api/v1/notifications', require('./routes/notificationRoutes'));
app.use('/api/v1/approvals', require('./routes/approvalRoutes'));
app.use('/api/v1/wallets', require('./routes/walletRoutes'));
app.use('/api/v1/users', require('./routes/userRoutes'));
app.use('/api/v1/settings', require('./routes/settingsRoutes'));

// Swagger documentation
if (process.env.NODE_ENV !== 'production') {
  const swaggerUi = require('swagger-ui-express');
  const swaggerDocument = require('./swagger');
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
}

// Error handling middleware
app.use(require('./middleware/errorHandler'));

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    // Connect to database
    await connectDatabase();

    // Start cron jobs
    require('./services/syncService');
    require('./services/notificationService').startCronJobs();

    // Start HTTP server
    app.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`📝 API Documentation: http://localhost:${PORT}/api-docs`);
      logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  const { disconnectDatabase } = require('./config/database');
  await disconnectDatabase();
  process.exit(0);
});

startServer();

module.exports = app;

