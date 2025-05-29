const express = require('express');
const { google } = require('googleapis');
const axios = require('axios');
const router = express.Router();

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
  if (!req.session.tokens) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
};

// Helper function to extract email body
const extractEmailBody = (payload) => {
  let body = '';

  if (payload.parts && payload.parts.length) {
    // Handle multipart message
    const textPart = payload.parts.find(part =>
      part.mimeType === 'text/plain' || part.mimeType === 'text/html'
    );

    if (textPart && textPart.body.data) {
      body = Buffer.from(textPart.body.data, 'base64').toString();
    }
  } else if (payload.body && payload.body.data) {
    // Handle single part message
    body = Buffer.from(payload.body.data, 'base64').toString();
  }

  // Clean up HTML tags if present
  body = body.replace(/<[^>]*>/g, '');
  return body.trim();
};

// Get recent emails
router.get('/recent', isAuthenticated, async (req, res) => {
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.REDIRECT_URI
    );

    oauth2Client.setCredentials(req.session.tokens);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    console.log('📧 Fetching recent emails...');

    // Get list of messages
    const response = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 5
    });

    const messages = response.data.messages || [];
    const emails = [];

    // Get details for each message
    for (const message of messages) {
      const email = await gmail.users.messages.get({
        userId: 'me',
        id: message.id
      });

      const headers = email.data.payload.headers;
      const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
      const from = headers.find(h => h.name === 'From')?.value || 'Unknown Sender';

      // Extract message body
      const body = extractEmailBody(email.data.payload);

      emails.push({
        id: message.id,
        subject,
        from,
        snippet: email.data.snippet,
        body,
        date: new Date(parseInt(email.data.internalDate)).toLocaleString()
      });
    }

    // Store in session and return
    req.session.emails = emails;
    console.log(`✅ Fetched ${emails.length} emails`);
    res.redirect('/');
  } catch (error) {
    console.error('❌ Error fetching emails:', error);
    res.redirect('/?error=fetch_failed');
  }
});

// Process email with Chipp.ai
router.post('/process/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const email = req.session.emails.find(e => e.id === id);

    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }

    console.log(`🤖 Processing email with Chipp.ai: ${email.subject}`);

    // Prepare content for Chipp.ai
    const emailContent = `Subject: ${email.subject}\nFrom: ${email.from}\n\nContent:\n${email.body || email.snippet}`;

    // Prepare system prompt with ClickUp credentials if available
    let systemPrompt = `You are an intelligent task creation assistant that converts email content into actionable ClickUp tasks. When processing emails, you should:

1. **Analyze the email content** to identify actionable items, requests, or tasks
2. **Extract key information** including:
   - Task title (concise, action-oriented)
   - Detailed description
   - Priority level (1=urgent, 2=high, 3=normal, 4=low)
   - Due date (if mentioned or can be inferred, format as Unix timestamp in milliseconds)
   - Task type/category
   - Any relevant tags

3. **Create ClickUp tasks** by calling the ClickUp API directly using the provided access token

4. **Response format**: After creating the task, respond with a confirmation message that includes:
   - ✅ Task created successfully
   - 📋 Task title
   - 🎯 Priority level
   - 📅 Due date (if set)
   - 🔗 ClickUp task link (will be provided by the API response)`;

    // Add ClickUp API integration details if user has configured ClickUp
    if (req.session.clickup?.configured && req.session.clickup?.access_token && req.session.clickup?.defaultList) {
      const { access_token, defaultList } = req.session.clickup;
      systemPrompt += `

**ClickUp API Integration:**
Use the ClickUp API directly to create tasks. You have been provided with:
- ClickUp Access Token: ${access_token}
- Default List ID: ${defaultList.id}

Make POST requests to: https://api.clickup.com/api/v2/list/${defaultList.id}/task

**Headers:**
Authorization: ${access_token}
Content-Type: application/json

**Example Response:**
"✅ Task created successfully!
📋 **Task:** Review Q4 budget proposal
🎯 **Priority:** High
📅 **Due:** December 15, 2024
🔗 **ClickUp Link:** [View Task](https://app.clickup.com/t/task_id)

The task has been created with the full email context and is ready for action!"`;
    } else {
      systemPrompt += `

**Note:** ClickUp integration is not configured. Please provide task suggestions in this format:
"📋 **Suggested Task:** [Task Title]
📝 **Description:** [Detailed description]
🎯 **Priority:** [High/Medium/Low]
📅 **Due Date:** [If applicable]
🏷️ **Tags:** [Relevant tags]

To enable automatic ClickUp task creation, please configure your ClickUp integration first."`;
    }

    // Send to Chipp.ai
    const response = await axios.post(
      'https://app.chipp.ai/api/v1/chat/completions',
      {
        model: 'hackathonassistant-70377',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: emailContent }
        ],
        stream: false
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.CHIPP_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Store the Chipp response with the email
    const chippResponse = response.data.choices[0].message.content;

    // Update the email in session with the Chipp response
    req.session.emails = req.session.emails.map(e => {
      if (e.id === id) {
        return { ...e, chippResponse };
      }
      return e;
    });

    console.log('✅ Chipp.ai response received');
    res.redirect('/');
  } catch (error) {
    console.error('❌ Error processing with Chipp.ai:', error);
    res.redirect('/?error=chipp_failed');
  }
});

module.exports = router;
