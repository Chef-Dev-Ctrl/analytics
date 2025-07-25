# DVL Analytics API - Railway Deployment

A Node.js analytics API for DVL Media website tracking deployed on Railway with custom subdomain.

🌐 **Live API**: https://analytics.dvlmedia.co.za  
📊 **Dashboard**: https://analytics.dvlmedia.co.za/dashboard  
🔧 **Health Check**: https://analytics.dvlmedia.co.za/api/health

## Environment Variables Required

```env
PORT=3002
WEBSITE_URL=https://www.dvlmedia.co.za
META_PIXEL_ID=1934911910679068
GA4_PROPERTY_ID=your_ga4_property_id
```

## Deployment Steps

1. **Upload to GitHub**: Push this deployment folder to a GitHub repository
2. **Connect Railway**: Link your GitHub repo to Railway
3. **Configure Environment**: Set the required environment variables
4. **Deploy**: Railway automatically builds and deploys
5. **Custom Domain**: CNAME `analytics` to your Railway domain

## API Endpoints

- `POST /api/track` - Analytics tracking endpoint
- `GET /api/dashboard` - Web analytics dashboard
- `GET /api/integrations/status` - External service integration status
- `GET /api/health` - Server health check
