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
    
    // Send to Chipp.ai
    const response = await axios.post(
      'https://app.chipp.ai/api/v1/chat/completions',
      {
        model: 'hackathonassistant-70377',
        messages: [
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
