const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const WebSocket = require('ws');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const AnalyticsIntegration = require('./analytics-integration');

const app = express();
const PORT = process.env.PORT || 3002;

// API Keys for authentication
const API_KEYS = {
  'dvl-media-main': {
    name: 'DVL Media Main Website',
    domain: 'www.dvlmedia.co.za',
    created: new Date().toISOString()
  },
  'dvl-media-dev': {
    name: 'DVL Media Development',
    domain: 'localhost',
    created: new Date().toISOString()
  }
};

// Middleware
app.use(cors());
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, '../../public')));

// API Key validation middleware
const validateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  
  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }
  
  if (!API_KEYS[apiKey]) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  req.apiKeyInfo = API_KEYS[apiKey];
  next();
};

// Initialize SQLite database for analytics storage
const db = new sqlite3.Database('./analytics.db');

// Create tables if they don't exist
db.serialize(() => {
  // Performance metrics table
  db.run(`CREATE TABLE IF NOT EXISTS performance_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    api_key TEXT,
    page_url TEXT,
    load_time REAL,
    dom_ready_time REAL,
    first_contentful_paint REAL,
    largest_contentful_paint REAL,
    cumulative_layout_shift REAL,
    first_input_delay REAL,
    user_agent TEXT,
    referrer TEXT
  )`);

  // SEO metrics table
  db.run(`CREATE TABLE IF NOT EXISTS seo_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    api_key TEXT,
    page_url TEXT,
    title_length INTEGER,
    meta_description_length INTEGER,
    h1_count INTEGER,
    image_alt_missing INTEGER,
    internal_links INTEGER,
    external_links INTEGER,
    lighthouse_score REAL
  )`);

  // Form submissions table
  db.run(`CREATE TABLE IF NOT EXISTS form_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    api_key TEXT,
    form_type TEXT,
    user_agent TEXT,
    ip_address TEXT,
    submission_data TEXT,
    conversion_source TEXT
  )`);

  // User analytics table
  db.run(`CREATE TABLE IF NOT EXISTS user_analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    api_key TEXT,
    session_id TEXT,
    page_url TEXT,
    user_agent TEXT,
    referrer TEXT,
    time_on_page INTEGER,
    scroll_depth REAL,
    clicks INTEGER,
    device_type TEXT
  )`);
});

// Add sample data for demonstration
function addSampleData() {
  const sampleData = [
    // Performance data
    () => db.run(`INSERT INTO performance_metrics (api_key, page_url, load_time, dom_ready_time, first_contentful_paint, largest_contentful_paint, user_agent, referrer) 
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['dvl-media-main', '/', 2.4, 1.8, 1.2, 2.1, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', '']),
    
    () => db.run(`INSERT INTO performance_metrics (api_key, page_url, load_time, dom_ready_time, first_contentful_paint, largest_contentful_paint, user_agent, referrer) 
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['dvl-media-main', '/services', 1.9, 1.4, 0.9, 1.7, 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0)', 'https://google.com']),
    
    // Form submissions
    () => db.run(`INSERT INTO form_submissions (api_key, form_type, user_agent, conversion_source) 
                  VALUES (?, ?, ?, ?)`,
      ['dvl-media-main', 'contact-form', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'organic']),
    
    () => db.run(`INSERT INTO form_submissions (api_key, form_type, user_agent, conversion_source) 
                  VALUES (?, ?, ?, ?)`,
      ['dvl-media-main', 'quote-form', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'referral']),
    
    // SEO data
    () => db.run(`INSERT INTO seo_metrics (api_key, page_url, title_length, meta_description_length, h1_count, image_alt_missing, internal_links, external_links, lighthouse_score) 
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['dvl-media-main', '/', 45, 155, 1, 2, 12, 3, 92]),
    
    () => db.run(`INSERT INTO seo_metrics (api_key, page_url, title_length, meta_description_length, h1_count, image_alt_missing, internal_links, external_links, lighthouse_score) 
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['dvl-media-main', '/services', 38, 148, 1, 1, 8, 2, 88]),
    
    // User analytics
    () => db.run(`INSERT INTO user_analytics (api_key, session_id, page_url, user_agent, referrer, time_on_page, scroll_depth, clicks, device_type) 
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['dvl-media-main', 'sess_123', '/', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', '', 45000, 85.5, 7, 'desktop']),
    
    () => db.run(`INSERT INTO user_analytics (api_key, session_id, page_url, user_agent, referrer, time_on_page, scroll_depth, clicks, device_type) 
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['dvl-media-main', 'sess_456', '/services', 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0)', 'https://google.com', 32000, 92.3, 12, 'mobile'])
  ];
  
  // Insert sample data with small delays
  sampleData.forEach((insertFn, index) => {
    setTimeout(() => {
      insertFn();
      if (index === sampleData.length - 1) {
        console.log('📊 Sample analytics data added to database');
      }
    }, index * 100);
  });
}

// Add sample data on startup
setTimeout(addSampleData, 1000);

// Initialize Analytics Integration
const analyticsIntegration = new AnalyticsIntegration(db);

// WebSocket server for real-time updates
const wss = new WebSocket.Server({ port: 8081 });

wss.on('connection', (ws) => {
  console.log('📱 Mobile client connected');
  
  ws.on('message', (message) => {
    console.log('📨 Received:', message.toString());
  });

  ws.on('close', () => {
    console.log('📱 Mobile client disconnected');
  });
});

// Broadcast data to all connected clients
function broadcastToClients(data) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// API Routes

// Performance Metrics
app.get('/api/performance', (req, res) => {
  const { days = 7 } = req.query;
  
  db.all(`
    SELECT * FROM performance_metrics 
    WHERE timestamp > datetime('now', '-${days} days')
    ORDER BY timestamp DESC
  `, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ data: rows, summary: calculatePerformanceSummary(rows) });
  });
});

app.post('/api/performance', (req, res) => {
  const { page_url, load_time, dom_ready_time, first_contentful_paint, largest_contentful_paint, cumulative_layout_shift, first_input_delay } = req.body;
  
  db.run(`
    INSERT INTO performance_metrics (page_url, load_time, dom_ready_time, first_contentful_paint, largest_contentful_paint, cumulative_layout_shift, first_input_delay)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [page_url, load_time, dom_ready_time, first_contentful_paint, largest_contentful_paint, cumulative_layout_shift, first_input_delay], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    const newData = { id: this.lastID, page_url, load_time, timestamp: new Date().toISOString() };
    broadcastToClients({ type: 'performance', data: newData });
    
    res.json({ id: this.lastID, message: 'Performance data recorded' });
  });
});

// SEO Metrics
app.get('/api/seo', (req, res) => {
  const { days = 7 } = req.query;
  
  db.all(`
    SELECT * FROM seo_metrics 
    WHERE timestamp > datetime('now', '-${days} days')
    ORDER BY timestamp DESC
  `, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ data: rows, summary: calculateSeoSummary(rows) });
  });
});

app.post('/api/seo', (req, res) => {
  const { page_url, title_length, meta_description_length, h1_count, image_alt_missing, internal_links, external_links, lighthouse_score } = req.body;
  
  db.run(`
    INSERT INTO seo_metrics (page_url, title_length, meta_description_length, h1_count, image_alt_missing, internal_links, external_links, lighthouse_score)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [page_url, title_length, meta_description_length, h1_count, image_alt_missing, internal_links, external_links, lighthouse_score], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    const newData = { id: this.lastID, page_url, lighthouse_score, timestamp: new Date().toISOString() };
    broadcastToClients({ type: 'seo', data: newData });
    
    res.json({ id: this.lastID, message: 'SEO data recorded' });
  });
});

// Form Submissions
app.get('/api/forms', (req, res) => {
  const { days = 7 } = req.query;
  
  db.all(`
    SELECT * FROM form_submissions 
    WHERE timestamp > datetime('now', '-${days} days')
    ORDER BY timestamp DESC
  `, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ data: rows, summary: calculateFormSummary(rows) });
  });
});

app.post('/api/forms', (req, res) => {
  const { form_type, user_agent, ip_address, submission_data, conversion_source } = req.body;
  
  db.run(`
    INSERT INTO form_submissions (form_type, user_agent, ip_address, submission_data, conversion_source)
    VALUES (?, ?, ?, ?, ?)
  `, [form_type, user_agent, ip_address, JSON.stringify(submission_data), conversion_source], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    const newData = { id: this.lastID, form_type, conversion_source, timestamp: new Date().toISOString() };
    broadcastToClients({ type: 'form_submission', data: newData });
    
    res.json({ id: this.lastID, message: 'Form submission recorded' });
  });
});

// User Analytics
app.get('/api/users', (req, res) => {
  const { days = 7 } = req.query;
  
  db.all(`
    SELECT * FROM user_analytics 
    WHERE timestamp > datetime('now', '-${days} days')
    ORDER BY timestamp DESC
  `, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ data: rows, summary: calculateUserSummary(rows) });
  });
});

app.post('/api/users', (req, res) => {
  const { session_id, page_url, user_agent, referrer, time_on_page, scroll_depth, clicks, device_type } = req.body;
  
  db.run(`
    INSERT INTO user_analytics (session_id, page_url, user_agent, referrer, time_on_page, scroll_depth, clicks, device_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [session_id, page_url, user_agent, referrer, time_on_page, scroll_depth, clicks, device_type], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    const newData = { id: this.lastID, page_url, device_type, timestamp: new Date().toISOString() };
    broadcastToClients({ type: 'user_activity', data: newData });
    
    res.json({ id: this.lastID, message: 'User activity recorded' });
  });
});

// API Key management routes
app.get('/api/keys', (req, res) => {
  res.json(Object.keys(API_KEYS).map(key => ({
    key,
    ...API_KEYS[key]
  })));
});

app.post('/api/keys', (req, res) => {
  const { name, domain } = req.body;
  if (!name || !domain) {
    return res.status(400).json({ error: 'Name and domain required' });
  }
  
  const newKey = `dvl-${crypto.randomBytes(16).toString('hex')}`;
  API_KEYS[newKey] = {
    name,
    domain,
    created: new Date().toISOString()
  };
  
  res.json({ key: newKey, ...API_KEYS[newKey] });
});

// Website tracking endpoint (public, requires API key)
app.post('/api/track', validateApiKey, (req, res) => {
  const { type, data } = req.body;
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  
  switch (type) {
    case 'pageview':
      // Track page view
      db.run(`INSERT INTO user_analytics (api_key, session_id, page_url, user_agent, referrer, device_type) 
              VALUES (?, ?, ?, ?, ?, ?)`, 
        [apiKey, data.sessionId, data.url, data.userAgent, data.referrer, data.deviceType]);
      break;
      
    case 'performance':
      // Track performance metrics
      db.run(`INSERT INTO performance_metrics (api_key, page_url, load_time, dom_ready_time, first_contentful_paint, largest_contentful_paint, user_agent, referrer) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [apiKey, data.url, data.loadTime, data.domReady, data.fcp, data.lcp, data.userAgent, data.referrer]);
      break;
      
    case 'form':
      // Track form submission
      db.run(`INSERT INTO form_submissions (api_key, form_type, page_url, user_agent, conversion_source) 
              VALUES (?, ?, ?, ?, ?)`,
        [apiKey, data.formType, data.url, data.userAgent, data.source]);
      break;
  }
  
  // Broadcast real-time update
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'analytics_update', data: { type, ...data } }));
    }
  });
  
  res.json({ success: true });
});

// Dashboard overview endpoint
app.get('/api/dashboard', (req, res) => {
  const { days = 7 } = req.query;
  
  // Get summary data from all tables
  Promise.all([
    new Promise((resolve, reject) => {
      db.all(`SELECT COUNT(*) as total_visits, AVG(load_time) as avg_load_time FROM performance_metrics WHERE timestamp > datetime('now', '-${days} days')`, (err, rows) => {
        if (err) reject(err);
        else resolve(rows[0]);
      });
    }),
    new Promise((resolve, reject) => {
      db.all(`SELECT COUNT(*) as total_forms FROM form_submissions WHERE timestamp > datetime('now', '-${days} days')`, (err, rows) => {
        if (err) reject(err);
        else resolve(rows[0]);
      });
    }),
    new Promise((resolve, reject) => {
      db.all(`SELECT AVG(lighthouse_score) as avg_seo_score FROM seo_metrics WHERE timestamp > datetime('now', '-${days} days')`, (err, rows) => {
        if (err) reject(err);
        else resolve(rows[0]);
      });
    })
  ]).then(([performance, forms, seo]) => {
    res.json({
      performance: {
        total_visits: performance.total_visits || 0,
        avg_load_time: performance.avg_load_time || 0
      },
      forms: {
        total_submissions: forms.total_forms || 0
      },
      seo: {
        avg_score: seo.avg_seo_score || 0
      }
    });
  }).catch(err => {
    res.status(500).json({ error: err.message });
  });
});

// Helper functions for summary calculations
function calculatePerformanceSummary(data) {
  if (!data.length) return { avg_load_time: 0, avg_fcp: 0, avg_lcp: 0 };
  
  return {
    avg_load_time: data.reduce((sum, row) => sum + (row.load_time || 0), 0) / data.length,
    avg_fcp: data.reduce((sum, row) => sum + (row.first_contentful_paint || 0), 0) / data.length,
    avg_lcp: data.reduce((sum, row) => sum + (row.largest_contentful_paint || 0), 0) / data.length
  };
}

function calculateSeoSummary(data) {
  if (!data.length) return { avg_lighthouse_score: 0, pages_analyzed: 0 };
  
  return {
    avg_lighthouse_score: data.reduce((sum, row) => sum + (row.lighthouse_score || 0), 0) / data.length,
    pages_analyzed: new Set(data.map(row => row.page_url)).size
  };
}

function calculateFormSummary(data) {
  if (!data.length) return { total_submissions: 0, conversion_rate: 0 };
  
  return {
    total_submissions: data.length,
    form_types: [...new Set(data.map(row => row.form_type))]
  };
}

function calculateUserSummary(data) {
  if (!data.length) return { unique_sessions: 0, avg_time_on_page: 0 };
  
  return {
    unique_sessions: new Set(data.map(row => row.session_id)).size,
    avg_time_on_page: data.reduce((sum, row) => sum + (row.time_on_page || 0), 0) / data.length
  };
}

// Analytics Integration Management Endpoints
app.get('/api/integrations/status', (req, res) => {
  const status = {
    googleAnalytics: {
      enabled: !!process.env.GA4_PROPERTY_ID && !!process.env.GA4_SERVICE_ACCOUNT_KEY,
      configured: {
        propertyId: !!process.env.GA4_PROPERTY_ID,
        credentials: !!process.env.GA4_SERVICE_ACCOUNT_KEY
      }
    },
    metaPixel: {
      enabled: !!process.env.META_ACCESS_TOKEN && !!process.env.META_PIXEL_ID,
      configured: {
        accessToken: !!process.env.META_ACCESS_TOKEN,
        pixelId: !!process.env.META_PIXEL_ID,
        appId: !!process.env.META_APP_ID
      }
    },
    searchConsole: {
      enabled: !!process.env.SEARCH_CONSOLE_SITE_URL && !!process.env.GOOGLE_SEARCH_CONSOLE_KEY,
      configured: {
        siteUrl: !!process.env.SEARCH_CONSOLE_SITE_URL,
        credentials: !!process.env.GOOGLE_SEARCH_CONSOLE_KEY
      }
    },
    pageSpeed: {
      enabled: !!process.env.GOOGLE_PAGESPEED_API_KEY,
      configured: {
        apiKey: !!process.env.GOOGLE_PAGESPEED_API_KEY,
        websiteUrl: !!process.env.WEBSITE_URL
      }
    }
  };
  
  res.json(status);
});

app.post('/api/integrations/trigger/:service', async (req, res) => {
  const { service } = req.params;
  
  try {
    await analyticsIntegration.testIntegration(service);
    res.json({ success: true, message: `${service} integration triggered successfully` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/integrations/trigger-all', async (req, res) => {
  try {
    await analyticsIntegration.runAllIntegrations();
    res.json({ success: true, message: 'All integrations triggered successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Tracking script endpoint
app.get('/dvl-analytics.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
  res.sendFile(path.join(__dirname, '../../public/dvl-analytics.js'));
});

// Integration example
app.get('/integration-example', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.sendFile(path.join(__dirname, '../../public/integration-example.html'));
});

// Dashboard UI
app.get('/dashboard', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.sendFile(path.join(__dirname, '../../public/dashboard.html'));
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 DVL Analytics API Server running on port ${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}/api/dashboard`);
  console.log(`🔌 WebSocket: ws://localhost:8081`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('🛑 Shutting down server...');
  db.close();
  process.exit(0);
});
