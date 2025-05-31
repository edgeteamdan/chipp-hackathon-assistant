const express = require('express');
const { google } = require('googleapis');
const axios = require('axios');
const { generateToken, requireAuth } = require('../utils/jwt');
const router = express.Router();

// Utility function to decode HTML entities
const decodeHtmlEntities = (text) => {
  if (!text || typeof text !== 'string') {
    return '';
  }

  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&#x60;/g, '`')
    .replace(/&#x3D;/g, '=')
    .replace(/&apos;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&hellip;/g, '...')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–');
};

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

// Helper function to extract task data from formatted text response
const extractTaskFromFormattedText = (text) => {
  try {
    const taskData = {};

    // Extract task title
    const titleMatch = text.match(/\*\*Task Title:\*\*\s*(.+?)(?:\n|$)/i);
    if (titleMatch) {
      taskData.task_title = titleMatch[1].trim();
    }

    // Extract description
    const descMatch = text.match(/\*\*Description:\*\*\s*([\s\S]*?)(?:\n\*\*|$)/i);
    if (descMatch) {
      taskData.description = descMatch[1].trim();
    }

    // Extract priority
    const priorityMatch = text.match(/\*\*Priority Level?:\*\*\s*(\d+)/i);
    if (priorityMatch) {
      taskData.priority = parseInt(priorityMatch[1]);
    }

    // Extract due date (Unix timestamp)
    const dueDateMatch = text.match(/\*\*Due Date:\*\*.*?(\d{13})/i);
    if (dueDateMatch) {
      taskData.due_date = parseInt(dueDateMatch[1]);
    }

    // Extract tags
    const tagsMatch = text.match(/\*\*Tags:\*\*\s*(.+?)(?:\n|$)/i);
    if (tagsMatch) {
      const tagsText = tagsMatch[1].trim();
      taskData.tags = tagsText.split(',').map(tag => tag.trim());
    }

    console.log('🔍 Extracted task fields:', {
      hasTitle: !!taskData.task_title,
      hasDescription: !!taskData.description,
      hasPriority: !!taskData.priority,
      hasDueDate: !!taskData.due_date,
      hasTags: !!taskData.tags
    });

    return taskData;
  } catch (error) {
    console.error('❌ Error extracting task data from formatted text:', error);
    return null;
  }
};

// Middleware to check if user is authenticated (using JWT)
const isAuthenticated = (req, res, next) => {
  if (!req.isAuthenticated) {
    console.log('❌ Authentication failed: No valid JWT token');
    return res.status(401).json({
      error: 'Not authenticated',
      details: 'Valid JWT token required. Please login again.'
    });
  }

  if (!req.user.tokens) {
    console.log('❌ Authentication failed: No tokens in JWT');
    return res.status(401).json({
      error: 'Google tokens not found',
      details: 'Please login again to restore credentials.'
    });
  }

  if (!req.user.clientCredentials) {
    console.log('❌ Authentication failed: No client credentials in JWT');
    return res.status(401).json({
      error: 'Client credentials not found',
      details: 'Please login again to restore session.'
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

    // Remove HTML entities - comprehensive list
    body = body
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, '/')
      .replace(/&#x60;/g, '`')
      .replace(/&#x3D;/g, '=')
      .replace(/&apos;/g, "'")
      .replace(/&lsquo;/g, "'")
      .replace(/&rsquo;/g, "'")
      .replace(/&ldquo;/g, '"')
      .replace(/&rdquo;/g, '"')
      .replace(/&hellip;/g, '...')
      .replace(/&mdash;/g, '—')
      .replace(/&ndash;/g, '–');

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
    const { googleClientId, googleClientSecret } = req.user.clientCredentials;

    // Build redirect URI dynamically
    const protocol = req.get('x-forwarded-proto') || req.protocol;
    const host = req.get('host');
    const redirectUri = `${protocol}://${host}/client-auth/google/callback`;

    const oauth2Client = new google.auth.OAuth2(
      googleClientId,
      googleClientSecret,
      redirectUri
    );

    oauth2Client.setCredentials(req.user.tokens);
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
        subject: decodeHtmlEntities(subject),
        from: decodeHtmlEntities(from),
        snippet: decodeHtmlEntities(email.data.snippet),
        body,
        date: new Date(parseInt(email.data.internalDate)).toLocaleString()
      });
    }

    // For serverless environments like Vercel, store emails in a more compact format
    // and always include them in the response for immediate client-side storage
    const compactEmails = emails.map(email => ({
      id: email.id,
      subject: email.subject,
      from: email.from,
      snippet: email.snippet,
      body: email.body.length > 1000 ? email.body.substring(0, 1000) + '...' : email.body, // Truncate long bodies
      date: email.date
    }));

    // Update JWT token with compact emails
    const updatedPayload = {
      ...req.user,
      emails: compactEmails,
      emailsFetchedAt: new Date().toISOString()
    };

    try {
      const newJwtToken = generateToken(updatedPayload);

      // Update JWT token cookie
      res.cookie('authToken', newJwtToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      });

      console.log(`✅ Fetched ${emails.length} emails and saved to JWT token (compact format)`);

      // Store in memory for current session (but don't rely on it for serverless)
      const userId = req.user.id || req.user.email;
      if (global.userDataStore) {
        const existingData = global.userDataStore.get(userId) || {};
        global.userDataStore.set(userId, {
          ...existingData,
          emails: emails // Store full emails in memory for current session
        });
        console.log(`💾 Stored ${emails.length} emails in memory for user: ${userId} (current session only)`);
      }

      // Return JSON response with full emails and updated JWT token
      res.json({
        success: true,
        message: `Successfully fetched ${emails.length} emails`,
        emails: emails, // Return full emails to client
        emailCount: emails.length,
        // Include the new JWT token in the response for immediate use
        newToken: newJwtToken
      });
    } catch (jwtError) {
      console.error('❌ Error generating JWT token with emails:', jwtError);
      console.log('🔍 Payload that failed:', Object.keys(updatedPayload));

      // If JWT fails due to size, try without emails in JWT but still return them
      console.log('🔄 Attempting to save without emails in JWT due to size constraints...');
      try {
        const fallbackPayload = {
          ...req.user,
          emailsFetchedAt: new Date().toISOString()
        };
        const fallbackToken = generateToken(fallbackPayload);

        res.cookie('authToken', fallbackToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 24 * 60 * 60 * 1000
        });

        console.log(`⚠️ JWT token saved without emails due to size constraints`);

        res.json({
          success: true,
          message: `Successfully fetched ${emails.length} emails (stored client-side only)`,
          emails: emails,
          emailCount: emails.length,
          newToken: fallbackToken,
          warning: 'Emails stored client-side only due to size constraints'
        });
      } catch (fallbackError) {
        console.error('❌ Fallback JWT generation also failed:', fallbackError);
        res.status(500).json({
          success: false,
          error: 'Failed to update JWT token',
          details: fallbackError.message
        });
      }
    }
  } catch (error) {
    console.error('❌ Error fetching emails:', error);
    res.redirect('/?error=fetch_failed');
  }
});

// Process email with Chipp.ai
router.post('/process/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const { chippApiKey, storedEmails } = req.body; // Get Chipp API key and stored emails from client

    console.log(`📧 Email processing endpoint called for ID: ${id}`);

    if (!chippApiKey) {
      console.log('❌ No Chipp API key provided');
      return res.status(400).json({ error: 'Chipp API key required' });
    }

    // Check multiple sources for emails: client-provided, in-memory store, then JWT token
    const userId = req.user.id || req.user.email;
    const storedData = global.userDataStore?.get(userId);
    let emails = storedEmails || storedData?.emails || req.user.emails || [];

    console.log(`🔍 Email sources checked: client=${storedEmails?.length || 0}, store=${storedData?.emails?.length || 0}, jwt=${req.user.emails?.length || 0}`);

    const emailSource = storedEmails ? 'from client' : (storedData?.emails ? 'from store' : 'from JWT');
    console.log(`🔍 Email data source: ${emailSource}`);
    console.log(`🔍 Available emails: ${emails.length}`);
    console.log(`🔍 Looking for email ID: ${id}`);

    let email = emails.find(e => e.id === id);

    // If email not found and we don't have many emails, try to re-fetch from Gmail
    if (!email && emails.length === 0) {
      console.log(`🔄 No emails available, attempting to re-fetch from Gmail...`);
      try {
        const { googleClientId, googleClientSecret } = req.user.clientCredentials;

        // Build redirect URI dynamically
        const protocol = req.get('x-forwarded-proto') || req.protocol;
        const host = req.get('host');
        const redirectUri = `${protocol}://${host}/client-auth/google/callback`;

        const oauth2Client = new google.auth.OAuth2(
          googleClientId,
          googleClientSecret,
          redirectUri
        );

        oauth2Client.setCredentials(req.user.tokens);
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

        // Get list of messages
        const response = await gmail.users.messages.list({
          userId: 'me',
          maxResults: 10 // Get more emails to increase chance of finding the target
        });

        const messages = response.data.messages || [];
        const refetchedEmails = [];

        // Get details for each message
        for (const message of messages) {
          const emailData = await gmail.users.messages.get({
            userId: 'me',
            id: message.id
          });

          const headers = emailData.data.payload.headers;
          const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
          const from = headers.find(h => h.name === 'From')?.value || 'Unknown Sender';
          const body = extractEmailBody(emailData.data.payload);

          refetchedEmails.push({
            id: message.id,
            subject: decodeHtmlEntities(subject),
            from: decodeHtmlEntities(from),
            snippet: decodeHtmlEntities(emailData.data.snippet),
            body,
            date: new Date(parseInt(emailData.data.internalDate)).toLocaleString()
          });
        }

        emails = refetchedEmails;
        email = emails.find(e => e.id === id);

        console.log(`🔄 Re-fetched ${emails.length} emails from Gmail`);

        // Store the re-fetched emails in memory for this session
        if (global.userDataStore) {
          const existingData = global.userDataStore.get(userId) || {};
          global.userDataStore.set(userId, {
            ...existingData,
            emails: emails
          });
        }

      } catch (refetchError) {
        console.error('❌ Error re-fetching emails from Gmail:', refetchError);
      }
    }

    if (!email) {
      console.log(`❌ Email not found. Available IDs: ${emails.map(e => e.id).join(', ')}`);
      return res.status(404).json({
        error: 'Email not found',
        details: `Email ID ${id} not found. Available emails: ${emails.length}`,
        availableIds: emails.map(e => e.id)
      });
    }

    console.log(`✅ Found email: ${email.subject}`);

    // Also check ClickUp configuration from store
    const clickupData = storedData?.clickup || req.user.clickup;
    console.log(`🔍 ClickUp configured: ${!!clickupData?.configured}`);
    console.log(`🔍 ClickUp access_token: ${!!clickupData?.access_token}`);
    console.log(`🔍 ClickUp defaultList: ${!!clickupData?.defaultList}`);

    // Update req.user with store data for compatibility with existing code
    if (storedData?.emails) {
      req.user.emails = emails;
    }
    if (storedData?.clickup) {
      req.user.clickup = clickupData;
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
      console.log('- ClickUp configured:', !!req.user.clickup?.configured);
      console.log('- ClickUp access_token:', !!req.user.clickup?.access_token);
      console.log('- ClickUp defaultList:', !!req.user.clickup?.defaultList);

      if (taskData && (taskData.task_title || taskData.task?.name) && req.user.clickup?.configured && req.user.clickup?.access_token && req.user.clickup?.defaultList) {
        console.log('🚀 Creating ClickUp task...');

        const { access_token, defaultList } = req.user.clickup;

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
      console.log('🔄 Attempting to extract task data from response...');

      // First, try to extract JSON from markdown code blocks
      let extractedData = null;
      try {
        console.log('🔍 Checking for JSON in markdown code blocks...');
        console.log('📝 Response contains ```json:', chippResponse.includes('```json'));
        console.log('📝 Response contains ```:', chippResponse.includes('```'));

        const jsonMatch = chippResponse.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          console.log('🔍 Found JSON in markdown code block, attempting to parse...');
          console.log('📝 Matched content length:', jsonMatch[1].length);
          const jsonContent = jsonMatch[1].trim();
          console.log('📝 First 200 chars of JSON:', jsonContent.substring(0, 200));
          const parsedJson = JSON.parse(jsonContent);
          console.log('✅ Successfully parsed JSON from markdown code block');

          // Handle nested task structure
          if (parsedJson.task) {
            extractedData = {
              task_title: parsedJson.task.name || parsedJson.task.task_title,
              description: parsedJson.task.description,
              priority: parsedJson.task.priority,
              due_date: parsedJson.task.due_date,
              tags: parsedJson.task.tags
            };
          } else {
            extractedData = parsedJson;
          }

          console.log('📋 Extracted task data from JSON:', JSON.stringify(extractedData, null, 2));
        }
      } catch (jsonError) {
        console.log('⚠️ Failed to parse JSON from markdown code block:', jsonError.message);
      }

      // If JSON extraction failed, try formatted text extraction
      if (!extractedData || !extractedData.task_title) {
        console.log('🔄 Attempting to extract task data from formatted text...');
        extractedData = extractTaskFromFormattedText(chippResponse);
      }

      // Try to extract task information from response
      try {
        if (extractedData && extractedData.task_title) {
          console.log('✅ Successfully extracted task data from formatted text');
          console.log('📋 Extracted task data:', JSON.stringify(extractedData, null, 2));
          taskData = extractedData;

          // Check if we can create ClickUp task with extracted data
          console.log('🔍 ClickUp configuration check:');
          console.log('  - taskData exists:', !!taskData);
          console.log('  - task_title exists:', !!taskData?.task_title);
          console.log('  - ClickUp configured:', !!req.user.clickup?.configured);
          console.log('  - ClickUp access_token exists:', !!req.user.clickup?.access_token);
          console.log('  - ClickUp defaultList exists:', !!req.user.clickup?.defaultList);

          if (taskData && taskData.task_title && req.user.clickup?.configured && req.user.clickup?.access_token && req.user.clickup?.defaultList) {
            console.log('🚀 Creating ClickUp task from extracted data...');

            const { access_token, defaultList } = req.user.clickup;

            // Prepare ClickUp task payload
            const clickupPayload = {
              name: taskData.task_title,
              description: taskData.description,
              priority: taskData.priority || 3,
              tags: taskData.tags || []
            };

            // Add due date if provided
            if (taskData.due_date) {
              clickupPayload.due_date = taskData.due_date;
            }

            console.log('📤 Sending extracted task to ClickUp API...');
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

              console.log('✅ ClickUp task created successfully from extracted data!');
              console.log('📋 Task ID:', clickupResponse.data.id);
              console.log('🔗 Task URL:', clickupResponse.data.url);

              clickupTaskUrl = clickupResponse.data.url;

              // Create a simple success response with task link
              finalResponse = `✅ **Task created successfully!**

🔗 [View Task in ClickUp](${clickupTaskUrl})`;

            } catch (clickupError) {
              console.error('❌ Failed to create ClickUp task from extracted data:', clickupError.response?.data || clickupError.message);
              finalResponse = `⚠️ **Task creation failed**

Email analyzed successfully, but couldn't create ClickUp task. Please check your ClickUp configuration and try again.`;
            }
          } else {
            // ClickUp not configured, show simple message
            finalResponse = `📋 **Email analyzed successfully**

ClickUp integration is not configured. Please set up ClickUp to automatically create tasks.`;
          }
        } else {
          console.log('⚠️ Could not extract valid task data from formatted text');
          finalResponse = chippResponse;
        }
      } catch (extractError) {
        console.log('⚠️ Failed to extract task data from formatted text:', extractError.message);
        console.log('📝 Using raw response as fallback');
        finalResponse = chippResponse;
      }
    }

    // Update the email in JWT token with the final response
    const updatedEmails = req.user.emails.map(e => {
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

    // Update JWT token with processed email
    const updatedPayload = {
      ...req.user,
      emails: updatedEmails
    };

    const newJwtToken = generateToken(updatedPayload);

    // Update JWT token cookie
    res.cookie('authToken', newJwtToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000
    });

    // Also update in-memory store to ensure UI reflects changes
    if (global.userDataStore && storedData) {
      global.userDataStore.set(userId, {
        ...storedData,
        emails: updatedEmails
      });
      console.log(`💾 Updated processed email in memory store for user: ${userId}`);
    }

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
