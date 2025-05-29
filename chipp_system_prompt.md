# Chipp System Prompt & ClickUp Integration Documentation

## 🤖 Chipp System Prompt Configuration

### Copy this section into your Chipp system prompt:

```
You are an intelligent task creation assistant that analyzes email content and formats it into ClickUp task specifications. When processing emails, you should:

1. **Analyze the email content** to identify actionable items, requests, or tasks
2. **Extract key information** including:
   - Task title (concise, action-oriented)
   - Detailed description
   - Priority level (1=urgent, 2=high, 3=normal, 4=low)
   - Due date (if mentioned or can be inferred, format as Unix timestamp in milliseconds)
   - Task type/category
   - Any relevant tags

3. **Format the response as JSON** for the backend to process

**Required Response Format:**
You MUST respond with a JSON object in this exact format:

```json
{
  "task": {
    "name": "Task title here",
    "description": "Detailed description including email context",
    "priority": 1,
    "due_date": 1734220800000,
    "tags": ["tag1", "tag2"]
  },
  "analysis": {
    "summary": "Brief summary of what was extracted from the email",
    "actionable_items": ["item1", "item2"],
    "urgency_reason": "Why this priority was chosen"
  }
}
```

**Priority Values:**
- 1 = Urgent (red) - Immediate action required
- 2 = High (yellow) - Important, needs attention soon
- 3 = Normal (blue) - Standard priority
- 4 = Low (gray) - Can be done when time permits

**Example Response:**
```json
{
  "task": {
    "name": "Review Q4 budget proposal and prepare feedback",
    "description": "Review the Q4 budget proposal from manager@company.com and prepare feedback for the meeting scheduled for next Friday.\n\nOriginal email context:\nSubject: Q4 Budget Review Meeting\nFrom: manager@company.com\n\nPlease review the attached Q4 budget proposal and come prepared with feedback for our meeting next Friday at 2 PM.",
    "priority": 2,
    "due_date": 1734220800000,
    "tags": ["budget", "review", "meeting", "q4"]
  },
  "analysis": {
    "summary": "Email requests review of Q4 budget proposal with feedback needed for upcoming meeting",
    "actionable_items": ["Review budget proposal", "Prepare feedback", "Attend Friday meeting"],
    "urgency_reason": "High priority due to specific deadline (Friday meeting) and manager request"
  }
}
```

**Critical Instructions:**
- ALWAYS respond with valid JSON in the exact format specified above
- Include the original email context in the task description
- Choose appropriate priority based on urgency indicators in the email
- Extract realistic due dates from email content when mentioned
- If no specific deadline is mentioned, omit the due_date field
- Include relevant tags that would help categorize the task
```

## 🔌 ClickUp API Integration Details

### ClickUp OAuth Token Generation

To get an access token for Chipp to use, follow these steps:

1. **Get Authorization Code**: Direct users to:
   ```
   https://app.clickup.com/api?client_id={CLICKUP_CLIENT_ID}&redirect_uri={REDIRECT_URI}
   ```

2. **Exchange Code for Token**: Make a POST request to:
   ```
   POST https://api.clickup.com/api/v2/oauth/token
   Content-Type: application/json

   {
     "client_id": "YOUR_CLICKUP_CLIENT_ID",
     "client_secret": "YOUR_CLICKUP_CLIENT_SECRET",
     "code": "AUTHORIZATION_CODE_FROM_STEP_1"
   }
   ```

3. **Response**: You'll receive an access token:
   ```json
   {
     "access_token": "pk_123456789_ABC123DEF456GHI789JKL012MNO345",
     "token_type": "Bearer"
   }
   ```

### ClickUp Task Creation API

**Endpoint:** `POST https://api.clickup.com/api/v2/list/{list_id}/task`

**Headers:**
```
Authorization: {access_token}
Content-Type: application/json
```

**Request Body Schema:**
```json
{
  "name": "string (required)",
  "description": "string",
  "priority": 1|2|3|4,
  "due_date": 1234567890123,
  "tags": ["string"],
  "assignees": [123456789]
}
```

**Priority Values:**
- 1 = Urgent (red)
- 2 = High (yellow)
- 3 = Normal (blue)
- 4 = Low (gray)

**Example Request:**
```json
{
  "name": "Review Q4 budget proposal and prepare feedback",
  "description": "Review the Q4 budget proposal from manager@company.com and prepare feedback for the meeting scheduled for next Friday.\n\nOriginal email: Q4 Budget Review Meeting",
  "priority": 2,
  "due_date": 1734220800000,
  "tags": ["budget", "review", "meeting"]
}
```

**Success Response:**
```json
{
  "id": "abc123def456",
  "name": "Review Q4 budget proposal and prepare feedback",
  "url": "https://app.clickup.com/t/abc123def456",
  "status": {
    "status": "to do",
    "color": "#d3d3d3"
  },
  "priority": {
    "priority": "high",
    "color": "#ffcc00"
  },
  "due_date": "1734220800000"
}
```

## �️ Implementation Steps

### Step 1: Generate ClickUp Access Token

1. **Create ClickUp OAuth App** (if not already done):
   - Go to ClickUp Settings > Apps > Create new app
   - Use your client ID and secret from .env

2. **Get Authorization Code**:
   - Direct user to: `https://app.clickup.com/api?client_id={CLICKUP_CLIENT_ID}&redirect_uri={REDIRECT_URI}`
   - User authorizes and gets redirected with code

3. **Exchange Code for Access Token**:
   ```bash
   curl -X POST https://api.clickup.com/api/v2/oauth/token \
     -H "Content-Type: application/json" \
     -d '{
       "client_id": "AX83GAG32NMUNML77VW9YFP9X9LO8WHN",
       "client_secret": "7K2J2BSDDQOHZGR8I8OXPF8M4PM76GCJ4JUZGWDVBZT9IRO5FEJCQA65DWEPU7P5",
       "code": "AUTHORIZATION_CODE_FROM_REDIRECT"
     }'
   ```

### Step 2: Get ClickUp List ID

1. **Get Workspaces**: `GET https://api.clickup.com/api/v2/team` with access token
2. **Get Spaces**: `GET https://api.clickup.com/api/v2/team/{team_id}/space`
3. **Get Lists**: `GET https://api.clickup.com/api/v2/space/{space_id}/list`
4. **Choose Default List**: Select the list ID where tasks should be created

### Step 3: Configure Chipp

Provide Chipp with:
- **ClickUp Access Token**: `pk_123456789_ABC123DEF456GHI789JKL012MNO345`
- **Default List ID**: `123456789`
- **System Prompt**: Copy from the section above

### Step 4: Test Integration

1. Send an email to your Gmail
2. Process it through your app with Chipp
3. Verify task is created in ClickUp
4. Check that task link is returned in Chipp response

## 🔧 Optional: Local Webhook Handler

If you want to track task creation in your local app, create an endpoint:

**URL:** `POST http://localhost:3000/api/chipp/task-created`

**Request Body:**
```json
{
  "email_id": "gmail_message_id",
  "task_id": "clickup_task_id",
  "task_url": "https://app.clickup.com/t/task_id",
  "task_name": "Task name",
  "chipp_response": "Full Chipp response text"
}
```

This allows your UI to show which emails have associated ClickUp tasks.

## 🔐 Security Considerations

1. **API Authentication:** Validate Chipp API key on incoming requests
2. **ClickUp OAuth:** Secure token storage and refresh handling
3. **Data Validation:** Sanitize all input data before processing
4. **Rate Limiting:** Implement rate limits on API endpoints
5. **Error Handling:** Graceful error handling with user-friendly messages

## 📝 Next Steps

1. Implement ClickUp OAuth integration
2. Create the task creation API endpoint
3. Set up the Chipp webhook handler
4. Update the UI to show task links
5. Test the complete integration flow
6. Configure Chipp with the system prompt and API endpoints
