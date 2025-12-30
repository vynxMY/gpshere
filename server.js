// ============================================
// 📋 STEP 11: MAIN SERVER FILE
// ============================================
// This is your application entry point (like index.php in PHP)
// Starts Express server and sets up all routes

const express = require('express');
const session = require('express-session');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors({
  origin: true, // Allow all origins (for development)
  credentials: true // Allow credentials (cookies, sessions)
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware (like PHP: session_start())
// Note: MemoryStore warning is safe to ignore for single-process deployments (Render free tier)
app.use(session({
  secret: process.env.JWT_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  name: 'gsphere.sid', // Custom session name
  cookie: { 
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    secure: false, // Render handles HTTPS termination, so we allow HTTP cookies
    httpOnly: true, // Prevent XSS attacks
    sameSite: 'lax', // Allow cookies on cross-site requests (for Render)
    domain: undefined // Let browser set domain automatically
  }
}));

// Force homepage.html to be the default landing page
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/homepage.html');
});

// Serve static files (CSS, JS)
app.use(express.static('public'));

// Import routes
const authRoutes = require('./src/routes/authRoutes');
const userRoutes = require('./src/routes/userRoutes');
const eventRoutes = require('./src/routes/eventRoutes');
const chatbotRoutes = require('./src/routes/chatbotRoutes');
const chatbotAdminRoutes = require('./src/routes/chatbotAdminRoutes');
const notificationRoutes = require('./src/routes/notificationRoutes');

// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/chatbot', chatbotRoutes);
app.use('/api/admin/chatbot', chatbotAdminRoutes);
app.use('/api/notifications', notificationRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running ✅' });
});

// Email configuration diagnostic endpoint (for troubleshooting)
app.get('/api/email-config', (req, res) => {
  const { getEmailConfigStatus } = require('./src/utils/email');
  const config = getEmailConfigStatus();
  
  // Don't expose sensitive information
  const safeConfig = {
    isTestMode: config.isTestMode,
    isConfigured: config.isConfigured,
    hasConfig: config.hasConfig,
    emailHost: config.emailHost,
    emailPort: config.emailPort,
    emailUser: config.emailUser,
    emailPassSet: config.emailPassSet,
    emailConfigValid: config.emailConfigValid,
    recommendations: []
  };
  
  // Add recommendations
  if (config.isTestMode) {
    safeConfig.recommendations.push('TAC_TEST_MODE is enabled. Set TAC_TEST_MODE=false in .env to enable email sending.');
  }
  if (!config.hasConfig) {
    safeConfig.recommendations.push('Email configuration is missing. Set EMAIL_HOST, EMAIL_USER, and EMAIL_PASS in .env file.');
  }
  if (config.hasConfig && !config.isConfigured) {
    safeConfig.recommendations.push('Email configuration exists but transporter failed to initialize. Check your email settings.');
  }
  if (config.hasConfig && config.isConfigured && !config.emailConfigValid) {
    safeConfig.recommendations.push('Email configuration verification failed. Check your email credentials (for Gmail, use App Password).');
  }
  if (config.emailHost === 'smtp.gmail.com' && !config.emailConfigValid) {
    safeConfig.recommendations.push('For Gmail: Use App Password instead of regular password. Get it from: https://myaccount.google.com/apppasswords');
  }
  
  res.json(safeConfig);
});

// Database initialization endpoint (one-time use)
// SECURITY: Requires INIT_SECRET env var in production
const { initializeDatabase } = require('./src/controllers/initController');
app.post('/api/init-db', initializeDatabase);
app.get('/api/init-db', initializeDatabase); // Also support GET for easy browser access

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((error, req, res, next) => {
  console.error('Error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Scheduled job to notify members about upcoming events (runs daily at 9 AM)
const { notifyMembersAboutUpcomingEvents } = require('./src/controllers/notificationController');

// Function to schedule daily notifications
function scheduleUpcomingEventNotifications() {
  // Calculate milliseconds until next 9 AM
  const now = new Date();
  const next9AM = new Date();
  next9AM.setHours(9, 0, 0, 0);
  
  // If it's already past 9 AM today, schedule for tomorrow
  if (now >= next9AM) {
    next9AM.setDate(next9AM.getDate() + 1);
  }
  
  const msUntil9AM = next9AM - now;
  
  setTimeout(() => {
    console.log('📅 Running scheduled notification for upcoming events...');
    notifyMembersAboutUpcomingEvents();
    
    // Schedule next run (24 hours later)
    setInterval(() => {
      console.log('📅 Running scheduled notification for upcoming events...');
      notifyMembersAboutUpcomingEvents();
    }, 24 * 60 * 60 * 1000); // 24 hours
  }, msUntil9AM);
  
  console.log(`⏰ Scheduled upcoming event notifications to run daily at 9 AM`);
}

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log('📚 API Documentation:');
  console.log(`   POST   /api/auth/register      - Register new user`);
  console.log(`   POST   /api/auth/login         - Login user (sends TAC)`);
  console.log(`   POST   /api/auth/verify-tac    - Verify TAC and get token`);
  console.log(`   GET    /api/user/profile       - Get user profile`);
  console.log(`   GET    /api/user/all           - Get all users (admin)`);
  console.log(`   POST   /api/user/approve       - Approve user (admin)`);
  console.log(`   GET    /api/events             - Get all events`);
  console.log(`   GET    /api/events/:id         - Get event details`);
  console.log(`   POST   /api/events             - Create event (admin)`);
  console.log(`   PUT    /api/events/:id         - Update event (admin)`);
  console.log(`   DELETE /api/events/:id         - Delete event (admin)`);
  console.log(`   GET    /api/notifications      - Get notifications`);
  console.log(`   POST   /api/notifications/notify-upcoming - Notify about upcoming events (admin)`);
  console.log(`   POST   /api/chatbot            - Send message to chatbot`);
  
  // Start scheduled notifications
  scheduleUpcomingEventNotifications();
});
