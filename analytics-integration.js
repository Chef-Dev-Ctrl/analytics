const axios = require('axios');
const cron = require('node-cron');

/**
 * DVL Analytics Data Integration Service
 * Fetches data from external analytics services and stores in local database
 */

class AnalyticsIntegration {
  constructor(db) {
    this.db = db;
    this.integrations = {
      googleAnalytics: {
        enabled: false,
        config: {
          propertyId: process.env.GA4_PROPERTY_ID,
          credentials: process.env.GA4_SERVICE_ACCOUNT_KEY
        }
      },
      metaPixel: {
        enabled: false,
        config: {
          accessToken: process.env.META_ACCESS_TOKEN,
          pixelId: process.env.META_PIXEL_ID,
          appId: process.env.META_APP_ID
        }
      },
      searchConsole: {
        enabled: false,
        config: {
          siteUrl: process.env.SEARCH_CONSOLE_SITE_URL,
          credentials: process.env.GOOGLE_SEARCH_CONSOLE_KEY
        }
      }
    };
    
    this.initializeSchedulers();
  }

  /**
   * Google Analytics 4 Integration
   */
  async fetchGA4Data() {
    console.log('🔄 Fetching Google Analytics 4 data...');
    
    try {
      const { GoogleAuth } = require('google-auth-library');
      const { BetaAnalyticsDataClient } = require('@google-analytics/data');
      
      if (!this.integrations.googleAnalytics.config.credentials) {
        console.log('⚠️ GA4 credentials not configured');
        return;
      }

      const analyticsDataClient = new BetaAnalyticsDataClient({
        keyFilename: this.integrations.googleAnalytics.config.credentials,
      });

      const propertyId = this.integrations.googleAnalytics.config.propertyId;

      // Fetch page views and session data
      const [response] = await analyticsDataClient.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [
          {
            startDate: '7daysAgo',
            endDate: 'today',
          },
        ],
        dimensions: [
          { name: 'pagePath' },
          { name: 'deviceCategory' },
          { name: 'country' }
        ],
        metrics: [
          { name: 'sessions' },
          { name: 'pageviews' },
          { name: 'averageSessionDuration' },
          { name: 'bounceRate' }
        ],
      });

      // Process and store GA4 data
      for (const row of response.rows) {
        const pagePath = row.dimensionValues[0].value;
        const deviceType = row.dimensionValues[1].value.toLowerCase();
        const country = row.dimensionValues[2].value;
        const sessions = parseInt(row.metricValues[0].value);
        const pageviews = parseInt(row.metricValues[1].value);
        const avgSessionDuration = parseFloat(row.metricValues[2].value);
        const bounceRate = parseFloat(row.metricValues[3].value);

        // Store in user_analytics table
        this.db.run(`
          INSERT INTO user_analytics (api_key, session_id, page_url, time_on_page, device_type, referrer) 
          VALUES (?, ?, ?, ?, ?, ?)
        `, [
          'dvl-media-main',
          `ga4_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          pagePath,
          avgSessionDuration * 1000, // Convert to milliseconds
          deviceType,
          `GA4_${country}`
        ]);
      }

      console.log('✅ GA4 data imported successfully');
      
    } catch (error) {
      console.error('❌ GA4 data fetch error:', error.message);
    }
  }

  /**
   * Meta Pixel Integration
   */
  async fetchMetaPixelData() {
    console.log('🔄 Fetching Meta Pixel data...');
    
    try {
      const config = this.integrations.metaPixel.config;
      
      if (!config.accessToken || !config.pixelId) {
        console.log('⚠️ Meta Pixel credentials not configured');
        return;
      }

      // Fetch insights from Meta Marketing API
      const response = await axios.get(
        `https://graph.facebook.com/v18.0/${config.pixelId}/stats`,
        {
          params: {
            access_token: config.accessToken,
            start_time: Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60), // 7 days ago
            end_time: Math.floor(Date.now() / 1000),
            aggregation: 'event_source_delivery_type'
          }
        }
      );

      // Process Meta Pixel data
      for (const stat of response.data.data || []) {
        const eventCount = stat.count || 0;
        const eventType = stat.event || 'unknown';
        
        // Store form submissions (if event is form-related)
        if (['lead', 'contact', 'submit_application'].includes(eventType.toLowerCase())) {
          this.db.run(`
            INSERT INTO form_submissions (api_key, form_type, user_agent, conversion_source, submission_data) 
            VALUES (?, ?, ?, ?, ?)
          `, [
            'dvl-media-main',
            eventType,
            'Meta Pixel Integration',
            'social_media',
            JSON.stringify({ event_count: eventCount, source: 'meta_pixel' })
          ]);
        }
      }

      console.log('✅ Meta Pixel data imported successfully');
      
    } catch (error) {
      console.error('❌ Meta Pixel data fetch error:', error.message);
    }
  }

  /**
   * Google Search Console Integration
   */
  async fetchSearchConsoleData() {
    console.log('🔄 Fetching Google Search Console data...');
    
    try {
      const { google } = require('googleapis');
      const { GoogleAuth } = require('google-auth-library');
      
      const config = this.integrations.searchConsole.config;
      
      if (!config.credentials || !config.siteUrl) {
        console.log('⚠️ Search Console credentials not configured');
        return;
      }

      const auth = new GoogleAuth({
        keyFile: config.credentials,
        scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
      });

      const searchconsole = google.searchconsole({ version: 'v1', auth });

      // Fetch search performance data
      const response = await searchconsole.searchanalytics.query({
        siteUrl: config.siteUrl,
        requestBody: {
          startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          endDate: new Date().toISOString().split('T')[0],
          dimensions: ['page', 'query'],
          rowLimit: 100
        }
      });

      // Process Search Console data
      for (const row of response.data.rows || []) {
        const page = row.keys[0];
        const query = row.keys[1];
        const clicks = row.clicks || 0;
        const impressions = row.impressions || 0;
        const ctr = row.ctr || 0;
        const position = row.position || 0;

        // Store SEO data
        this.db.run(`
          INSERT INTO seo_metrics (api_key, page_url, lighthouse_score, internal_links, external_links) 
          VALUES (?, ?, ?, ?, ?)
        `, [
          'dvl-media-main',
          page,
          Math.round((ctr * 100)), // Use CTR as a proxy for SEO score
          clicks,
          impressions
        ]);
      }

      console.log('✅ Search Console data imported successfully');
      
    } catch (error) {
      console.error('❌ Search Console data fetch error:', error.message);
    }
  }

  /**
   * Core Web Vitals from PageSpeed Insights
   */
  async fetchPageSpeedData() {
    console.log('🔄 Fetching PageSpeed Insights data...');
    
    try {
      const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;
      const urls = [
        process.env.WEBSITE_URL || 'https://www.dvlmedia.co.za',
        `${process.env.WEBSITE_URL || 'https://www.dvlmedia.co.za'}/services`,
        `${process.env.WEBSITE_URL || 'https://www.dvlmedia.co.za'}/contact`
      ];

      for (const url of urls) {
        const response = await axios.get(
          `https://www.googleapis.com/pagespeedonline/v5/runPagespeed`,
          {
            params: {
              url: url,
              key: apiKey,
              category: ['PERFORMANCE', 'SEO', 'ACCESSIBILITY'],
              strategy: 'MOBILE'
            }
          }
        );

        const lighthouse = response.data.lighthouseResult;
        const loadingExperience = response.data.loadingExperience;

        // Extract Core Web Vitals
        const fcp = lighthouse.audits['first-contentful-paint']?.numericValue / 1000 || 0;
        const lcp = lighthouse.audits['largest-contentful-paint']?.numericValue / 1000 || 0;
        const cls = lighthouse.audits['cumulative-layout-shift']?.numericValue || 0;
        const fid = loadingExperience?.metrics?.FIRST_INPUT_DELAY_MS?.percentile / 1000 || 0;

        // Store performance data
        this.db.run(`
          INSERT INTO performance_metrics (api_key, page_url, load_time, first_contentful_paint, largest_contentful_paint, cumulative_layout_shift, first_input_delay, user_agent, referrer) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          'dvl-media-main',
          url,
          (fcp + lcp) / 2, // Average as load time approximation
          fcp,
          lcp,
          cls,
          fid,
          'PageSpeed Insights API',
          'automated_check'
        ]);

        // Store SEO scores
        const seoScore = lighthouse.categories.seo?.score * 100 || 0;
        const performanceScore = lighthouse.categories.performance?.score * 100 || 0;
        
        this.db.run(`
          INSERT INTO seo_metrics (api_key, page_url, lighthouse_score, title_length, meta_description_length, h1_count) 
          VALUES (?, ?, ?, ?, ?, ?)
        `, [
          'dvl-media-main',
          url,
          (seoScore + performanceScore) / 2,
          lighthouse.audits['document-title']?.details?.items?.[0]?.text?.length || 0,
          lighthouse.audits['meta-description']?.details?.items?.[0]?.description?.length || 0,
          1 // Default H1 count
        ]);
      }

      console.log('✅ PageSpeed data imported successfully');
      
    } catch (error) {
      console.error('❌ PageSpeed data fetch error:', error.message);
    }
  }

  /**
   * Initialize scheduled data fetching
   */
  initializeSchedulers() {
    // Fetch data every hour
    cron.schedule('0 * * * *', () => {
      this.runAllIntegrations();
    });

    // Initial run after 30 seconds
    setTimeout(() => {
      this.runAllIntegrations();
    }, 30000);

    console.log('📅 Analytics integration schedulers initialized');
  }

  /**
   * Run all enabled integrations
   */
  async runAllIntegrations() {
    console.log('🚀 Running all analytics integrations...');
    
    const integrations = [
      { name: 'PageSpeed', fn: () => this.fetchPageSpeedData() },
      { name: 'GA4', fn: () => this.fetchGA4Data() },
      { name: 'Meta Pixel', fn: () => this.fetchMetaPixelData() },
      { name: 'Search Console', fn: () => this.fetchSearchConsoleData() }
    ];

    for (const integration of integrations) {
      try {
        await integration.fn();
      } catch (error) {
        console.error(`❌ ${integration.name} integration failed:`, error.message);
      }
    }

    console.log('✅ All integrations completed');
  }

  /**
   * Manual trigger for testing
   */
  async testIntegration(serviceName) {
    switch (serviceName) {
      case 'ga4':
        await this.fetchGA4Data();
        break;
      case 'meta':
        await this.fetchMetaPixelData();
        break;
      case 'search-console':
        await this.fetchSearchConsoleData();
        break;
      case 'pagespeed':
        await this.fetchPageSpeedData();
        break;
      default:
        await this.runAllIntegrations();
    }
  }
}

module.exports = AnalyticsIntegration;
