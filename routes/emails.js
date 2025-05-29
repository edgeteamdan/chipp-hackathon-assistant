const express = require('express');
const { google } = require('googleapis');
const axios = require('axios');
const router = express.Router();

// Utility function to sanitize text for safe JSON transmission
const sanitizeText = (text) => {
  if (!text || typeof text !== 'string') {
    return '';
  }

  return text
    // Remove or replace control characters (except newlines and tabs)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Escape backslashes first (must be done before escaping quotes)
    .replace(/\\/g, '\\\\')
    // Escape double quotes
    .replace(/"/g, '\\"')
    // Normalize line endings and limit consecutive newlines
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    // Trim excessive whitespace
    .replace(/[ \t]+/g, ' ')
    .trim()
    // Limit total length to prevent extremely long prompts
    .substring(0, 10000);
};

// Utility function to sanitize email content specifically
const sanitizeEmailContent = (email) => {
  return {
    subject: sanitizeText(email.subject || 'No Subject'),
    from: sanitizeText(email.from || 'Unknown Sender'),
    body: sanitizeText(email.body || email.snippet || ''),
    snippet: sanitizeText(email.snippet || '')
  };
};

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
  console.log('🔐 Authentication check:', {
    hasSession: !!req.session,
    hasTokens: !!req.session?.tokens,
    hasUser: !!req.session?.user,
    hasClientCredentials: !!req.session?.clientCredentials,
    sessionId: req.sessionID ? req.sessionID.substring(0, 8) + '...' : 'none'
  });

  if (!req.session.tokens) {
    console.log('❌ Authentication failed: No tokens in session');
    return res.status(401).json({
      error: 'Not authenticated',
      details: 'Session tokens not found. Please login again.',
      sessionId: req.sessionID
    });
  }

  if (!req.session.clientCredentials) {
    console.log('❌ Authentication failed: No client credentials in session');
    return res.status(401).json({
      error: 'Client credentials not found',
      details: 'Please login again to restore session.',
      sessionId: req.sessionID
    });
  }

  next();
};

// Helper function to extract email body
const extractEmailBody = (payload) => {
  let body = '';

  try {
    if (payload.parts && payload.parts.length) {
      // Handle multipart message
      const textPart = payload.parts.find(part =>
        part.mimeType === 'text/plain' || part.mimeType === 'text/html'
      );

      if (textPart && textPart.body.data) {
        body = Buffer.from(textPart.body.data, 'base64').toString('utf8');
      }
    } else if (payload.body && payload.body.data) {
      // Handle single part message
      body = Buffer.from(payload.body.data, 'base64').toString('utf8');
    }

    // Clean up HTML tags if present
    body = body.replace(/<[^>]*>/g, '');

    // Remove HTML entities
    body = body
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    // Clean up excessive whitespace and normalize line endings
    body = body
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+/g, ' ')
      .trim();

    return body;
  } catch (error) {
    console.error('❌ Error extracting email body:', error.message);
    return '';
  }
};

// Get recent emails
router.get('/recent', isAuthenticated, async (req, res) => {
  try {
    const { googleClientId, googleClientSecret } = req.session.clientCredentials;

    // Build redirect URI dynamically
    const protocol = req.get('x-forwarded-proto') || req.protocol;
    const host = req.get('host');
    const redirectUri = `${protocol}://${host}/client-auth/google/callback`;

    const oauth2Client = new google.auth.OAuth2(
      googleClientId,
      googleClientSecret,
      redirectUri
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

    // Explicitly save session to ensure persistence
    req.session.save((err) => {
      if (err) {
        console.error('❌ Error saving emails session:', err);
        return res.redirect('/?error=session_save_failed');
      }

      console.log(`✅ Fetched ${emails.length} emails and saved to session`);
      console.log(`🔒 Emails session saved with ID: ${req.sessionID}`);
      res.redirect('/');
    });
  } catch (error) {
    console.error('❌ Error fetching emails:', error);
    res.redirect('/?error=fetch_failed');
  }
});

// Process email with Chipp.ai
router.post('/process/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const { chippApiKey } = req.body; // Get Chipp API key from client

    if (!chippApiKey) {
      return res.status(400).json({ error: 'Chipp API key required' });
    }

    const email = req.session.emails.find(e => e.id === id);

    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }

    console.log(`🤖 Processing email with Chipp.ai: ${email.subject}`);

    // Sanitize email content to prevent special character issues
    const sanitizedEmail = sanitizeEmailContent(email);

    console.log('🧹 Email content sanitized:');
    console.log('- Original subject length:', email.subject?.length || 0);
    console.log('- Sanitized subject length:', sanitizedEmail.subject.length);
    console.log('- Original body length:', (email.body || email.snippet || '').length);
    console.log('- Sanitized body length:', sanitizedEmail.body.length);

    // Prepare content for Chipp.ai using sanitized data
    const emailContent = `Subject: ${sanitizedEmail.subject}\nFrom: ${sanitizedEmail.from}\n\nContent:\n${sanitizedEmail.body}`;

    // Prepare user message for Chipp to format the task
    let userMessage = `Please analyze this email and format it as a ClickUp task specification:

${emailContent}

Please respond with a JSON object containing the task details and analysis as specified in your system prompt.`;

    // Final sanitization of the complete user message
    userMessage = sanitizeText(userMessage);

    console.log('📤 Sending to Chipp.ai (system prompt configured on backend):');
    console.log('='.repeat(80));
    console.log('📧 User message (length:', userMessage.length, 'chars):');
    console.log(userMessage);
    console.log('='.repeat(80));

    // Validate the user message before sending
    if (!userMessage || userMessage.trim().length === 0) {
      throw new Error('User message is empty after sanitization');
    }

    if (userMessage.length > 50000) {
      console.log('⚠️ WARNING: User message is very long (', userMessage.length, 'chars), truncating...');
      userMessage = userMessage.substring(0, 50000) + '\n\n[Message truncated due to length]';
    }

    // Prepare the request payload
    const requestPayload = {
      model: 'hackathonassistant-70377',
      messages: [
        { role: 'user', content: userMessage }
      ],
      stream: false
    };

    // Validate JSON serialization
    try {
      const testJson = JSON.stringify(requestPayload);
      console.log('✅ JSON payload validation successful (size:', testJson.length, 'bytes)');
    } catch (jsonError) {
      console.error('❌ JSON serialization failed:', jsonError.message);
      throw new Error('Failed to serialize request payload: ' + jsonError.message);
    }

    // Send to Chipp.ai (system prompt already configured on backend)
    console.log('🔄 Making request to Chipp.ai with stream: false...');

    const response = await axios.post(
      'https://app.chipp.ai/api/v1/chat/completions',
      requestPayload,
      {
        headers: {
          'Authorization': `Bearer ${chippApiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 second timeout
      }
    );

    console.log('📊 Response status:', response.status);
    console.log('📊 Response headers:', response.headers);

    // Store the Chipp response with the email
    const chippResponse = response.data.choices[0]?.message?.content || '';

    console.log('🔍 Checking response structure:');
    console.log('- choices array length:', response.data.choices?.length);
    console.log('- first choice:', response.data.choices[0]);
    console.log('- message object:', response.data.choices[0]?.message);
    console.log('- content length:', chippResponse.length);

    console.log('📥 Chipp.ai response received:');
    console.log('='.repeat(80));
    console.log('Extracted message content:');
    console.log(chippResponse);
    console.log('='.repeat(80));

    // Parse the JSON response from Chipp
    let taskData = null;
    let finalResponse = chippResponse;
    let clickupTaskUrl = null;

    try {
      // Try to parse the JSON response
      taskData = JSON.parse(chippResponse);
      console.log('✅ Successfully parsed JSON from Chipp response');
      console.log('📋 Task data:', JSON.stringify(taskData, null, 2));

      // If we have valid task data and ClickUp is configured, create the task
      console.log('🔍 Checking ClickUp task creation conditions:');
      console.log('- taskData exists:', !!taskData);
      console.log('- has task_title:', !!taskData?.task_title);
      console.log('- has task.name:', !!taskData?.task?.name);
      console.log('- ClickUp configured:', !!req.session.clickup?.configured);
      console.log('- ClickUp access_token:', !!req.session.clickup?.access_token);
      console.log('- ClickUp defaultList:', !!req.session.clickup?.defaultList);

      if (taskData && (taskData.task_title || taskData.task?.name) && req.session.clickup?.configured && req.session.clickup?.access_token && req.session.clickup?.defaultList) {
        console.log('🚀 Creating ClickUp task...');

        const { access_token, defaultList } = req.session.clickup;

        // Handle both JSON structures: direct properties or nested task object
        const task = taskData.task || taskData;

        // Prepare ClickUp task payload
        const clickupPayload = {
          name: task.task_title || task.name,
          description: task.description,
          priority: task.priority,
          tags: task.tags || []
        };

        // Add due date if provided
        if (task.due_date) {
          clickupPayload.due_date = task.due_date;
        }

        console.log('📤 Sending task to ClickUp API...');
        console.log('📋 Payload:', JSON.stringify(clickupPayload, null, 2));

        try {
          const clickupResponse = await axios.post(
            `https://api.clickup.com/api/v2/list/${defaultList.id}/task`,
            clickupPayload,
            {
              headers: {
                'Authorization': access_token,
                'Content-Type': 'application/json'
              },
              timeout: 15000
            }
          );

          console.log('✅ ClickUp task created successfully!');
          console.log('📋 Task ID:', clickupResponse.data.id);
          console.log('🔗 Task URL:', clickupResponse.data.url);

          clickupTaskUrl = clickupResponse.data.url;

          // Create a simple success response with task link
          finalResponse = `✅ **Task created successfully!**

🔗 [View Task in ClickUp](${clickupTaskUrl})`;

        } catch (clickupError) {
          console.error('❌ Failed to create ClickUp task:', clickupError.response?.data || clickupError.message);

          finalResponse = `⚠️ **Task creation failed**

Email analyzed successfully, but couldn't create ClickUp task. Please check your ClickUp configuration and try again.`;
        }
      } else if (taskData && (taskData.task_title || taskData.task)) {
        // ClickUp not configured, just show simple message
        finalResponse = `📋 **Email analyzed successfully**

ClickUp integration is not configured. Please set up ClickUp to automatically create tasks.`;
      }

    } catch (parseError) {
      console.log('⚠️ Failed to parse JSON from Chipp response:', parseError.message);
      console.log('📝 Using raw response as fallback');
      finalResponse = chippResponse;
    }

    // Update the email in session with the final response
    req.session.emails = req.session.emails.map(e => {
      if (e.id === id) {
        return {
          ...e,
          chippResponse: finalResponse,
          clickupTaskUrl: clickupTaskUrl,
          taskData: taskData,
          processedAt: new Date().toISOString()
        };
      }
      return e;
    });

    // Check if response is empty and try session-based recovery
    if (!chippResponse || chippResponse.trim().length === 0) {
      console.log('⚠️ WARNING: Chipp response is empty!');
      console.log('This might indicate a streaming issue or model configuration problem.');
      console.log('Completion tokens used:', response.data.usage?.completion_tokens);

      // If we got completion tokens but no content, try session-based recovery
      if (response.data.usage?.completion_tokens > 0 && response.data.chatSessionId) {
        console.log('🔍 DIAGNOSIS: Completion tokens > 0 but empty content suggests streaming issue');
        console.log('� ATTEMPTING RECOVERY: Using session ID to retrieve task details...');

        const sessionId = response.data.chatSessionId;
        console.log('📋 Session ID:', sessionId);

        try {
          // Wait 5 seconds then ask for the task link using the same session
          console.log('⏳ Waiting 5 seconds before follow-up request...');
          await new Promise(resolve => setTimeout(resolve, 5000));

          console.log('📤 Sending follow-up request to retrieve task details...');
          const followUpResponse = await axios.post(
            'https://app.chipp.ai/api/v1/chat/completions',
            {
              model: 'hackathonassistant-70377',
              messages: [
                { role: 'user', content: 'What was the link for the ClickUp task you just created? Please provide the task details and link.' }
              ],
              stream: false,
              chatSessionId: sessionId // Use the same session
            },
            {
              headers: {
                'Authorization': `Bearer ${chippApiKey}`,
                'Content-Type': 'application/json'
              },
              timeout: 30000
            }
          );

          const followUpContent = followUpResponse.data.choices[0]?.message?.content || '';
          console.log('📥 Follow-up response received:');
          console.log('='.repeat(80));
          console.log('Follow-up content:', followUpContent);
          console.log('='.repeat(80));

          if (followUpContent && followUpContent.trim().length > 0) {
            console.log('✅ SUCCESS: Retrieved task details via session recovery!');
            chippResponse = followUpContent;
          } else {
            console.log('❌ Follow-up request also returned empty content');
            chippResponse = `Task analysis completed but content not retrieved due to streaming issue.
Session ID: ${sessionId}
Completion tokens used: ${response.data.usage?.completion_tokens}
Please check ClickUp for the created task.`;
          }

        } catch (followUpError) {
          console.error('❌ Error in follow-up request:', followUpError.message);
          chippResponse = `Task analysis completed but content not retrieved due to streaming issue.
Session ID: ${sessionId}
Completion tokens used: ${response.data.usage?.completion_tokens}
Follow-up error: ${followUpError.message}`;
        }
      } else {
        chippResponse = 'No response content received from Chipp.ai';
      }
    }

    console.log('✅ Chipp.ai response processed and stored');

    // Return JSON response instead of redirect for AJAX calls
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.json({
        success: true,
        chippResponse: finalResponse || 'No response content received from Chipp.ai',
        clickupTaskUrl: clickupTaskUrl,
        taskData: taskData,
        message: 'Email processed successfully',
        debug: {
          hasContent: !!finalResponse,
          contentLength: finalResponse.length,
          completionTokens: response.data.usage?.completion_tokens,
          promptTokens: response.data.usage?.prompt_tokens,
          clickupTaskCreated: !!clickupTaskUrl
        }
      });
    }

    res.redirect('/');
  } catch (error) {
    console.error('❌ Error processing with Chipp.ai:', error.response?.data || error.message);
    console.error('Full error object:', error);

    // Return JSON error for AJAX calls
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(500).json({
        success: false,
        error: 'Failed to process email with Chipp.ai',
        details: error.response?.data || error.message
      });
    }

    res.redirect('/?error=chipp_failed');
  }
});

module.exports = router;
