const express = require('express');
const axios = require('axios');
const router = express.Router();

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
};

// Get workspaces and lists for configuration
router.get('/workspaces', isAuthenticated, async (req, res) => {
  if (!req.session.clickup?.access_token) {
    return res.status(401).json({ error: 'ClickUp not authenticated' });
  }
  
  try {
    const { access_token, teams } = req.session.clickup;
    const workspaces = [];
    
    // Get spaces and lists for each team
    for (const team of teams) {
      console.log(`📂 Getting spaces for team: ${team.name}`);
      
      const spacesResponse = await axios.get(`https://api.clickup.com/api/v2/team/${team.id}/space`, {
        headers: {
          'Authorization': access_token,
          'Content-Type': 'application/json'
        }
      });
      
      const spaces = spacesResponse.data.spaces || [];
      
      for (const space of spaces) {
        console.log(`📁 Getting lists for space: ${space.name}`);
        
        const listsResponse = await axios.get(`https://api.clickup.com/api/v2/space/${space.id}/list`, {
          headers: {
            'Authorization': access_token,
            'Content-Type': 'application/json'
          }
        });
        
        const lists = listsResponse.data.lists || [];
        
        workspaces.push({
          team: {
            id: team.id,
            name: team.name
          },
          space: {
            id: space.id,
            name: space.name
          },
          lists: lists.map(list => ({
            id: list.id,
            name: list.name
          }))
        });
      }
    }
    
    console.log(`✅ Retrieved ${workspaces.length} workspaces with lists`);
    res.json({ workspaces });
    
  } catch (error) {
    console.error('❌ Error fetching ClickUp workspaces:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch workspaces' });
  }
});

// Configure default list for task creation
router.post('/configure', isAuthenticated, async (req, res) => {
  const { listId, listName, spaceName, teamName, reset } = req.body;
  
  // Handle reset configuration
  if (reset) {
    if (req.session.clickup) {
      req.session.clickup.configured = false;
      req.session.clickup.defaultList = null;
    }
    console.log('🔄 ClickUp configuration reset');
    return res.json({ success: true, message: 'Configuration reset' });
  }
  
  if (!listId) {
    return res.status(400).json({ error: 'List ID is required' });
  }
  
  if (!req.session.clickup?.access_token) {
    return res.status(401).json({ error: 'ClickUp not authenticated' });
  }
  
  try {
    // Update session with configuration
    req.session.clickup.configured = true;
    req.session.clickup.defaultList = {
      id: listId,
      name: listName,
      spaceName,
      teamName
    };
    
    console.log(`✅ ClickUp configured - Default list: ${listName} (${listId})`);
    res.json({
      success: true,
      message: 'ClickUp configuration saved',
      defaultList: req.session.clickup.defaultList
    });
    
  } catch (error) {
    console.error('❌ Error configuring ClickUp:', error);
    res.status(500).json({ error: 'Failed to save configuration' });
  }
});

// Get current ClickUp status
router.get('/status', isAuthenticated, (req, res) => {
  const clickup = req.session.clickup;
  
  if (!clickup) {
    return res.json({
      authenticated: false,
      configured: false
    });
  }
  
  res.json({
    authenticated: !!clickup.access_token,
    configured: clickup.configured || false,
    defaultList: clickup.defaultList || null,
    teamsCount: clickup.teams?.length || 0
  });
});

module.exports = router;
