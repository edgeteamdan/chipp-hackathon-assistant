# Vercel Deployment Guide

## Overview

This guide outlines the modifications made to deploy the Chipp Hackathon Assistant to Vercel with client-side configuration storage.

## Key Changes Made

### 1. Vercel Configuration
- ✅ Added `vercel.json` for deployment configuration
- ✅ Configured Node.js build and routing

### 2. Client-Side Settings Page
- ✅ Created `/settings` page for user configuration
- ✅ Local storage for API keys and OAuth credentials
- ✅ No server-side storage of sensitive credentials

### 3. Client-Side Authentication
- ✅ New `/client-auth` routes for dynamic OAuth
- ✅ Google OAuth with client-provided credentials
- ✅ ClickUp OAuth with client-provided credentials
- ✅ JavaScript functions for authentication flow

### 4. Configuration Management
- ✅ `/config` routes for validation
- ✅ Local storage utilities
- ✅ Settings validation

## Files Added/Modified

### New Files:
- `vercel.json` - Vercel deployment configuration
- `views/settings.ejs` - Settings page UI
- `views/instructions.ejs` - Step-by-step setup guide
- `routes/client-auth.js` - Client-side OAuth handling
- `routes/config.js` - Configuration validation

### Modified Files:
- `index.js` - Added new routes
- `views/index.ejs` - Client-side auth integration
- `routes/emails.js` - Use client credentials for Chipp API

## Environment Variables

For Vercel deployment, only these environment variables are needed:
```
NODE_ENV=production
SESSION_SECRET=your_random_session_secret
```

All other credentials (Google, ClickUp, Chipp) are stored client-side.

## User Flow

1. **Visit App**: User goes to deployed Vercel URL
2. **Settings**: User clicks "Settings" to configure credentials
3. **Configure**: User enters API keys and OAuth credentials
4. **Save**: Credentials stored in browser localStorage
5. **Authenticate**: User can now login with Google using their credentials
6. **Use App**: Full functionality with client-side configuration

## Security Considerations

### Advantages:
- ✅ No server-side storage of user credentials
- ✅ Each user manages their own API keys
- ✅ No shared credentials or security risks
- ✅ Users control their own data

### Considerations:
- ⚠️ Users must configure their own OAuth apps
- ⚠️ Credentials stored in browser (cleared if user clears storage)
- ⚠️ Users need technical knowledge to set up OAuth apps

## OAuth Callback URLs - AUTOMATIC! 🎉

### **The Solution: Dynamic URL Detection**
Our app **automatically detects** the correct callback URLs! No manual updates needed.

### **How it works:**
```javascript
// Code automatically builds URLs based on current domain
const protocol = req.get('x-forwarded-proto') || req.protocol; // https
const host = req.get('host'); // your-app.vercel.app
const redirectUri = `${protocol}://${host}/client-auth/google/callback`;
```

### **URLs for different environments:**
- **Local**: `http://localhost:3000/client-auth/google/callback`
- **Vercel**: `https://your-app-name.vercel.app/client-auth/google/callback`
- **Custom Domain**: `https://yourdomain.com/client-auth/google/callback`

### **Settings Page Shows Current URLs**
The `/settings` page displays the **exact callback URLs** for your current deployment:
- ✅ Google OAuth redirect URI
- ✅ ClickUp OAuth redirect URI
- ✅ Copy-paste ready for OAuth app configuration

## Deployment Steps

1. **Push to GitHub**: Ensure all changes are committed
2. **Connect Vercel**: Link GitHub repo to Vercel
3. **Set Environment Variables**: Only SESSION_SECRET needed
4. **Deploy**: Vercel will build and deploy automatically
5. **Get Callback URLs**: Visit `/settings` to see the exact URLs
6. **Configure OAuth Apps**: Use the URLs shown in settings
7. **Test**: Verify settings page and authentication flow

## Next Steps

- [ ] Test complete deployment on Vercel
- [ ] Update documentation with live URL
- [ ] Add user guide for OAuth app setup
- [ ] Consider adding OAuth app creation tutorials
