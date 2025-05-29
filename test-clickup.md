# ClickUp Integration Testing Guide

## Prerequisites

1. **Environment Setup**: Make sure your `.env` file includes:
   ```
   CLICKUP_CLIENT_ID=your_client_id
   CLICKUP_CLIENT_SECRET=your_client_secret
   CLICKUP_REDIRECT_URI=http://localhost:3000/auth/clickup/callback
   ```

2. **ClickUp App Configuration**: 
   - Go to ClickUp Settings > Apps
   - Create a new app or verify existing app
   - Set redirect URI to: `http://localhost:3000/auth/clickup/callback`

## Testing Steps

### 1. Start the Application
```bash
npm start
# or
npm run dev
```

### 2. Login with Google
- Visit http://localhost:3000
- Click "Login with Google"
- Complete Google OAuth flow

### 3. Connect ClickUp
- After Google login, you should see the ClickUp Integration section
- Click "🔗 Connect ClickUp" button
- You'll be redirected to ClickUp for authorization
- Grant permissions to the app
- You'll be redirected back with success message

### 4. Configure ClickUp Workspace
- After successful ClickUp authentication, you'll see workspace selection
- Choose your desired Team > Space > List from the dropdown
- Click "✅ Configure Default List"
- You should see confirmation message

### 5. Test Email Processing
- Click "📧 Fetch Latest 5 Emails"
- For any email, click "🚀 Create Task from Email"
- The Chipp.ai response should now include:
  - ClickUp access token in the system prompt
  - Default list ID for task creation
  - Instructions for Chipp to create actual ClickUp tasks

### 6. Verify ClickUp Task Creation
- Check your ClickUp workspace
- Look for newly created tasks in the configured list
- Tasks should include:
  - Email subject as task title
  - Email content in description
  - Appropriate priority level
  - Due dates (if mentioned in email)

## Expected Behavior

### Without ClickUp Configuration
- Chipp provides task suggestions only
- No actual ClickUp tasks are created
- Response format: "📋 **Suggested Task:** ..."

### With ClickUp Configuration
- Chipp creates actual ClickUp tasks via API
- Response includes ClickUp task links
- Response format: "✅ Task created successfully! 🔗 **ClickUp Link:** ..."

## Troubleshooting

### ClickUp Authentication Fails
- Check ClickUp app credentials in `.env`
- Verify redirect URI matches exactly
- Check ClickUp app permissions

### No Workspaces/Lists Found
- Ensure ClickUp user has access to workspaces
- Check ClickUp API permissions
- Verify access token is valid

### Task Creation Fails
- Check ClickUp list permissions
- Verify list ID is correct
- Check Chipp.ai API integration

## API Endpoints

- `GET /clickup/auth` - Start ClickUp OAuth
- `GET /clickup/callback` - Handle OAuth callback
- `GET /clickup/workspaces` - Get user workspaces/lists
- `POST /clickup/configure` - Save default list configuration
- `GET /clickup/status` - Get current ClickUp status

## Success Indicators

✅ ClickUp authentication successful
✅ Workspaces and lists loaded
✅ Default list configured
✅ Email processing includes ClickUp credentials
✅ Chipp creates actual ClickUp tasks
✅ Task links returned in response
