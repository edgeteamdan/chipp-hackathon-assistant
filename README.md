# AutoTask AI 🤖

A hackathon project that automatically converts Gmail emails into ClickUp tasks using Chipp.ai's intelligent task generation.

## Features ✨

- 🔐 **Gmail OAuth Authentication** - Secure login with Google
- 📧 **Email Fetching** - Retrieve your latest 5 emails
- 🤖 **AI Task Generation** - Convert emails to tasks using Chipp.ai
- 🎯 **Smart Suggestions** - Get task titles, descriptions, and due dates
- 📱 **Responsive Design** - Works on desktop and mobile

## Tech Stack 🛠️

- **Backend**: Node.js + Express
- **Authentication**: Google OAuth 2.0 via googleapis
- **AI Integration**: Chipp.ai API
- **Frontend**: EJS templating with vanilla CSS
- **Session Management**: express-session

## Setup Instructions 🚀

### 1. Clone and Install

```bash
git clone <repository-url>
cd autotask-ai
npm install
```

### 2. Environment Configuration

Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

Fill in your credentials:

```env
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
REDIRECT_URI=http://localhost:3000/auth/google/callback
CHIPP_API_KEY=live_c8801992-98c9-4128-aabc-656788d194a2
PORT=3000
SESSION_SECRET=your_random_session_secret
```

### 3. Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Gmail API and Google+ API
4. Create OAuth 2.0 credentials
5. Add `http://localhost:3000/auth/google/callback` to authorized redirect URIs

### 4. Run the Application

```bash
# Development mode with auto-restart
npm run dev

# Production mode
npm start
```

Visit `http://localhost:3000` in your browser.

## How It Works 🔄

1. **Login**: User authenticates with Google OAuth
2. **Fetch Emails**: Retrieve latest 5 emails from Gmail
3. **AI Processing**: Send email content to Chipp.ai for analysis
4. **Task Suggestions**: Display AI-generated task details
5. **Review**: User can review and use the suggested tasks

## API Integration 🔌

### Chipp.ai Endpoint

```
POST https://app.chipp.ai/api/v1/chat/completions
```

**Headers:**
```
Authorization: Bearer live_c8801992-98c9-4128-aabc-656788d194a2
Content-Type: application/json
```

**Body:**
```json
{
  "model": "hackathonassistant-70377",
  "messages": [
    { "role": "user", "content": "EMAIL_CONTENT_HERE" }
  ],
  "stream": false
}
```

## Project Structure 📁

```
autotask-ai/
├── index.js              # Main Express app
├── routes/
│   ├── auth.js           # OAuth authentication routes
│   └── emails.js         # Email processing routes
├── views/
│   └── index.ejs         # Main UI template
├── public/
│   └── css/
│       └── style.css     # Custom styles
├── package.json          # Dependencies
├── .env.example          # Environment template
└── README.md            # This file
```

## Security Considerations 🔒

- OAuth tokens stored in server-side sessions only
- No sensitive data exposed to client-side
- Environment variables for all secrets
- Secure session configuration

## Contributing 🤝

This is a hackathon project! Feel free to:

- Report bugs
- Suggest features
- Submit pull requests
- Improve documentation

## License 📄

MIT License - feel free to use this code for your own projects!

---

Built with ❤️ for the Chipp.ai Hackathon
