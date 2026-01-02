// ============================================
// 📋 AI CHATBOT CONTROLLER
// ============================================
// Enhanced chatbot with AI-like responses and conversation handling
// Now uses database-backed knowledge with fallback to hardcoded responses
// Enhanced with improved matching algorithm for better accuracy

const pool = require('../config/database');

// Helper function to calculate Levenshtein distance (for fuzzy matching)
const levenshteinDistance = (str1, str2) => {
  const matrix = [];
  const len1 = str1.length;
  const len2 = str2.length;

  if (len1 === 0) return len2;
  if (len2 === 0) return len1;

  for (let i = 0; i <= len2; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len1; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len2; i++) {
    for (let j = 1; j <= len1; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[len2][len1];
};

// Helper function to calculate similarity percentage
const calculateSimilarity = (str1, str2) => {
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 100;
  const distance = levenshteinDistance(str1, str2);
  return ((maxLen - distance) / maxLen) * 100;
};

// Helper function to extract words from message
const extractWords = (message) => {
  return message.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 0);
};

// Helper function to check if keyword is a phrase (multiple words)
const isPhrase = (keyword) => {
  return keyword.trim().split(/\s+/).length > 1;
};

// Helper function to calculate match score for a keyword (enhanced version)
const calculateMatchScore = (message, keyword) => {
  const lowerMessage = message.toLowerCase().trim();
  const lowerKeyword = keyword.toLowerCase().trim();
  
  if (!lowerKeyword || lowerKeyword.length === 0) return 0;
  
  // Exact match gets highest score (works for both single words and phrases)
  if (lowerMessage === lowerKeyword) {
    return 100;
  }
  
  // For multi-word phrases, check phrase matching first
  if (isPhrase(lowerKeyword)) {
    // Normalize both message and keyword (remove extra spaces)
    const normalizedMessage = lowerMessage.replace(/\s+/g, ' ').trim();
    const normalizedKeyword = lowerKeyword.replace(/\s+/g, ' ').trim();
    
    // Exact phrase match - message equals keyword exactly (after normalization)
    if (normalizedMessage === normalizedKeyword) {
      return 100; // Perfect match
    }
    
    // Exact phrase match - message contains the exact phrase (case-insensitive, with word boundaries)
    const escapedKeyword = normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match phrase with word boundaries on both sides
    const phraseRegex = new RegExp(`(^|\\s)${escapedKeyword}(\\s|$)`, 'i');
    if (phraseRegex.test(normalizedMessage)) {
      return 98; // Very high score for exact phrase match
    }
    
    // Phrase appears in message (all words present in order, consecutive or near)
    const keywordWords = normalizedKeyword.split(/\s+/).map(w => w.trim()).filter(w => w.length > 0);
    const messageWords = extractWords(normalizedMessage);
    
    // Special case: if message words exactly match keyword words in order
    if (messageWords.length === keywordWords.length) {
      const exactMatch = messageWords.every((mw, idx) => mw === keywordWords[idx]);
      if (exactMatch) {
        return 99; // Very high score for exact word sequence match
      }
      
      // Check for word order variation (same words, different order)
      // Sort both arrays and compare - if they match, it's the same phrase
      const sortedMessageWords = [...messageWords].sort();
      const sortedKeywordWords = [...keywordWords].sort();
      const wordOrderMatch = sortedMessageWords.every((mw, idx) => mw === sortedKeywordWords[idx]);
      if (wordOrderMatch) {
        return 95; // Very high score for word order variation (e.g., "product comparison" = "compare products")
      }
    }
    
    // Check if all keyword words appear in message in order (consecutive or near)
    let keywordIndex = 0;
    let lastMatchIndex = -1;
    for (let i = 0; i < messageWords.length && keywordIndex < keywordWords.length; i++) {
      if (messageWords[i] === keywordWords[keywordIndex]) {
        // Exact word match
        if (keywordIndex === 0 || i === lastMatchIndex + 1) {
          // First word or consecutive match
          keywordIndex++;
          lastMatchIndex = i;
        } else if (i - lastMatchIndex <= 2) {
          // Words are close together (within 2 words)
          keywordIndex++;
          lastMatchIndex = i;
        }
      }
    }
    
    if (keywordIndex === keywordWords.length) {
      // All words found in order - very high score
      return 92;
    }
    
    // Check if all words are present (not necessarily in order) - this handles word order variations
    const allWordsPresent = keywordWords.every(kw => 
      messageWords.some(mw => mw === kw)
    );
    
    if (allWordsPresent) {
      // If all words match but in different order, still give high score
      // This handles cases like "product comparison" matching "compare products"
      return 85; // Increased from 80 to give better score for word order variations
    }
    
    // Partial phrase match - check how many words match exactly
    const exactMatches = keywordWords.filter(kw => 
      messageWords.some(mw => mw === kw)
    ).length;
    
    if (exactMatches > 0) {
      // Score based on how many words matched exactly
      const matchRatio = exactMatches / keywordWords.length;
      return 60 + (matchRatio * 20); // 60-80 range
    }
    
    // Very partial match - some words similar
    const similarMatches = keywordWords.filter(kw => 
      messageWords.some(mw => mw.includes(kw) || kw.includes(mw))
    ).length;
    
    if (similarMatches > 0) {
      return (similarMatches / keywordWords.length) * 50;
    }
    
    // No phrase match found, return 0 (don't continue to single word matching for phrases)
    return 0;
  }
  
  // Single word matching (only for single-word keywords)
  const messageWords = extractWords(lowerMessage);
  const keywordWords = lowerKeyword.split(/\s+/);
  const singleKeyword = keywordWords[0]; // For single word keywords
  
  // Word boundary matches (exact word match) - highest for single words
  const wordBoundaryRegex = new RegExp(`\\b${singleKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  if (wordBoundaryRegex.test(lowerMessage)) {
    return 90;
  }
  
  // Check if keyword is a complete word in message
  if (messageWords.includes(singleKeyword)) {
    return 85;
  }
  
  // Starts with keyword
  if (lowerMessage.startsWith(singleKeyword + ' ') || lowerMessage.startsWith(singleKeyword + ',')) {
    return 80;
  }
  
  // Ends with keyword
  if (lowerMessage.endsWith(' ' + singleKeyword) || lowerMessage.endsWith(',' + singleKeyword)) {
    return 75;
  }
  
  // Contains keyword as whole word (with spaces)
  if (lowerMessage.includes(' ' + singleKeyword + ' ') || 
      lowerMessage.includes(' ' + singleKeyword + ',') ||
      lowerMessage.includes(',' + singleKeyword + ' ')) {
    return 70;
  }
  
  // Fuzzy matching for typos and variations
  let bestSimilarity = 0;
  for (const word of messageWords) {
    if (word.length >= 3 && singleKeyword.length >= 3) {
      const similarity = calculateSimilarity(word, singleKeyword);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
      }
    }
  }
  
  // If similarity is high enough (>= 80%), consider it a match
  if (bestSimilarity >= 80) {
    return Math.min(65, bestSimilarity * 0.8);
  }
  
  // Check if keyword is contained in any word (substring match)
  for (const word of messageWords) {
    if (word.includes(singleKeyword)) {
      // Longer keywords get higher score
      return Math.min(60, 40 + (singleKeyword.length * 2));
    }
    if (singleKeyword.includes(word) && word.length >= 3) {
      return Math.min(55, 30 + (word.length * 2));
    }
  }
  
  // Partial match (contains keyword anywhere)
  if (lowerMessage.includes(singleKeyword)) {
    // Longer keywords get higher score for partial matches
    return Math.min(50, 20 + (singleKeyword.length * 2));
  }
  
  return 0;
};

// Helper function to find matching knowledge from database (enhanced with multi-keyword scoring)
const findMatchingKnowledge = async (message) => {
  try {
    // Get all active knowledge entries, ordered by priority
    const [knowledgeEntries] = await pool.query(
      "SELECT * FROM chatbot_knowledge WHERE is_active = TRUE ORDER BY priority DESC"
    );

    if (!knowledgeEntries || knowledgeEntries.length === 0) {
      return null;
    }

    const lowerMessage = message.toLowerCase().trim();
    let bestMatch = null;
    let bestScore = 0;

    // First pass: Check for exact keyword matches (highest priority)
    // This must happen BEFORE any scoring to ensure exact matches always win
    for (const entry of knowledgeEntries) {
      if (!entry.keywords) continue;
      
      const keywords = entry.keywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k.length > 0);
      
      // Check for exact match first (both full message match and phrase match)
      for (const keyword of keywords) {
        // Exact match (message equals keyword exactly)
        if (lowerMessage === keyword) {
          return entry;
        }
        
        // For phrases, check if message is exactly the phrase (after normalization)
        if (isPhrase(keyword)) {
          // Normalize both: remove extra spaces, trim
          const normalizedMessage = lowerMessage.replace(/\s+/g, ' ').trim();
          const normalizedKeyword = keyword.replace(/\s+/g, ' ').trim();
          
          if (normalizedMessage === normalizedKeyword) {
            return entry;
          }
          
          // Check if message contains the exact phrase with word boundaries
          const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const phraseRegex = new RegExp(`(^|\\s)${escapedKeyword}(\\s|$)`, 'i');
          if (phraseRegex.test(lowerMessage)) {
            return entry;
          }
          
          // Check for word order variations (e.g., "product comparison" = "compare products")
          const keywordWords = normalizedKeyword.split(/\s+/).sort();
          const messageWords = normalizedMessage.split(/\s+/).sort();
          
          // If sorted words match exactly, it's the same phrase in different order
          if (keywordWords.length === messageWords.length && 
              keywordWords.every((kw, idx) => kw === messageWords[idx])) {
            return entry;
          }
        }
      }
    }

    // Second pass: Check each knowledge entry for keyword matches
    // Track perfect matches separately to ensure they always win
    let perfectMatch = null;
    let perfectMatchScore = 0;
    
    for (const entry of knowledgeEntries) {
      if (!entry.keywords) continue;
      
      const keywords = entry.keywords.split(',').map(k => k.trim()).filter(k => k.length > 0);
      
      if (keywords.length === 0) continue;
      
      // Enhanced scoring: consider multiple keyword matches
      const keywordScores = [];
      let entryBestScore = 0;
      let matchingKeywordsCount = 0;
      
      for (const keyword of keywords) {
        const score = calculateMatchScore(lowerMessage, keyword);
        if (score > 0) {
          keywordScores.push(score);
          matchingKeywordsCount++;
          if (score > entryBestScore) {
            entryBestScore = score;
          }
        }
      }
      
      // If we found matches, calculate enhanced score
      if (entryBestScore > 0) {
        // PERFECT MATCHES (95-100) always win - return immediately
        if (entryBestScore >= 95) {
          // Don't add any bonuses - perfect matches should win as-is
          // Track the best perfect match (100 > 99 > 98 > 95)
          if (!perfectMatch || entryBestScore > perfectMatchScore) {
            perfectMatch = entry;
            perfectMatchScore = entryBestScore;
          }
          // If we find a perfect 100, we can return immediately
          if (entryBestScore === 100) {
            return entry;
          }
          continue; // Skip to next entry, but remember this perfect match
        }
        
        // Base score: best single keyword match
        let finalScore = entryBestScore;
        
        // For near-exact matches (90-94), give small boost
        if (entryBestScore >= 90) {
          finalScore = entryBestScore + 5; // Small boost
        } else {
          // For other matches, apply normal scoring
          // Bonus for multiple keyword matches (indicates stronger relevance)
          if (matchingKeywordsCount > 1) {
            // Calculate average of top matches
            const topScores = keywordScores.sort((a, b) => b - a).slice(0, Math.min(3, matchingKeywordsCount));
            const avgScore = topScores.reduce((sum, s) => sum + s, 0) / topScores.length;
            
            // Combine best match with average (weighted: 70% best, 30% average)
            finalScore = (entryBestScore * 0.7) + (avgScore * 0.3);
            
            // Additional bonus for multiple matches (up to 15 points)
            const multiMatchBonus = Math.min(15, matchingKeywordsCount * 3);
            finalScore += multiMatchBonus;
          }
          
          // Priority boost (priority adds up to 20 points, scaled)
          const priorityBoost = Math.min(20, (entry.priority || 0) * 2);
          finalScore += priorityBoost;
          
          // Bonus for longer, more specific keywords (indicates better match)
          const avgKeywordLength = keywords.reduce((sum, k) => sum + k.length, 0) / keywords.length;
          if (avgKeywordLength > 5) {
            finalScore += Math.min(5, (avgKeywordLength - 5) * 0.5);
          }
        }
        
        // Only update if this is a better match (and not a perfect match)
        if (finalScore > bestScore) {
          bestScore = finalScore;
          bestMatch = entry;
        }
      }
    }
    
    // If we found a perfect match, return it (it always wins)
    if (perfectMatch) {
      return perfectMatch;
    }

    // Lower threshold for better matching (was 30, now 25 to catch more relevant matches)
    // But require at least a decent match quality
    return bestScore > 25 ? bestMatch : null;
  } catch (error) {
    console.error('Error fetching chatbot knowledge:', error);
    return null;
  }
};

// Helper function to parse suggestions string
const parseSuggestions = (suggestionsString) => {
  if (!suggestionsString || !suggestionsString.trim()) {
    return [];
  }
  return suggestionsString.split('|').map(s => s.trim()).filter(s => s.length > 0);
};

// Fallback hardcoded responses (used when database is unavailable or no match found)
const getFallbackResponse = (lowerMessage) => {
  let response = '';
  let suggestions = [];

  // Greetings and casual conversation - check first for exact matches
  if (lowerMessage.match(/^(hi|hello|hey|greetings|good morning|good afternoon|good evening)/i)) {
    response = '👋 Hello! I\'m the GPS UTM Assistant. How can I help you today?';
    suggestions = ['What is GPS UTM?', 'How do I register?', 'Tell me about events'];
  }
  // GPS UTM Information
  else if (lowerMessage.match(/\b(gps|gps utm|gerakan pengguna siswa|what is gps)\b/i)) {
    response = '🌍 **GPS UTM** (Gerakan Pengguna Siswa) is the Student Consumer Movement at Universiti Teknologi Malaysia.\n\n' +
               'We empower students to become smart, ethical, and responsible consumers through:\n' +
               '• Educational workshops\n' +
               '• Consumer rights awareness\n' +
               '• Community events\n' +
               '• Student advocacy\n\n' +
               'GPSphere is our digital platform for managing members, events, and activities!';
    suggestions = ['How do I join?', 'What events are available?', 'How do I register?'];
  }
  // Registration
  else if (lowerMessage.match(/\b(register|sign up|create account|how to register|registration)\b/i)) {
    response = '📝 **Registration Process:**\n\n' +
               '1. Click on "Register" or go to the registration page\n' +
               '2. Fill in your details (name, email, password)\n' +
               '3. Make sure your password is strong (8+ characters, uppercase, lowercase, number, symbol)\n' +
               '4. Submit your registration\n' +
               '5. Wait for admin approval (usually 1-2 business days)\n' +
               '6. You\'ll receive an email notification once approved!\n\n' +
               'Once approved, you\'ll become a GPS member and can participate in events!';
    suggestions = ['What is TAC?', 'How do I login?', 'What happens after registration?'];
  }
  // Login and TAC
  else if (lowerMessage.match(/\b(login|sign in|tac|authentication code|time authentication code)\b/i)) {
    response = '🔐 **Login & TAC System:**\n\n' +
               '**TAC** stands for "Time Authentication Code" - it\'s a 6-digit security code sent to your email.\n\n' +
               '**Login Steps:**\n' +
               '1. Enter your email and password\n' +
               '2. Click "Login"\n' +
               '3. Check your email for the TAC code\n' +
               '4. Enter the TAC code (expires in 15 minutes)\n' +
               '5. You\'re in! 🎉\n\n' +
               '**Note:** In test mode, the TAC appears on screen instead of email.';
    suggestions = ['I didn\'t receive TAC', 'Forgot password', 'How to change password?'];
  }
  // Thank you
  else if (lowerMessage.match(/^(thanks|thank you|ty|appreciate|grateful)/i)) {
    response = '😊 You\'re welcome! Is there anything else I can help you with?';
    suggestions = ['Tell me about events', 'How to register?', 'Contact information'];
  }
  // Goodbye
  else if (lowerMessage.match(/^(bye|goodbye|see you|farewell|exit|quit)/i)) {
    response = '👋 Goodbye! Feel free to come back if you have any questions. Have a great day!';
    suggestions = [];
  }
  // Default - AI-like response
  else {
    if (lowerMessage.match(/\b(how|what|when|where|why|who)\b/i)) {
      response = '🤔 I understand you\'re asking about something. Let me help you!\n\n' +
                 'I can assist you with:\n' +
                 '• GPS UTM information\n' +
                 '• Registration process\n' +
                 '• Login and TAC\n' +
                 '• Events and activities\n' +
                 '• Joining events\n' +
                 '• Contact information\n\n' +
                 'Could you rephrase your question or try one of the suggestions below?';
    } else {
      response = '🤖 I\'m the GPS UTM Assistant! I can help you with:\n\n' +
                 '📌 **Information:**\n' +
                 '• What is GPS UTM?\n' +
                 '• How to register\n' +
                 '• Login and TAC system\n\n' +
                 '📅 **Events:**\n' +
                 '• Available events\n' +
                 '• How to join events\n' +
                 '• Event roles\n\n' +
                 '💬 **Support:**\n' +
                 '• Contact information\n' +
                 '• Account status\n' +
                 '• Password help\n\n' +
                 'What would you like to know?';
    }
    suggestions = ['What is GPS UTM?', 'How do I register?', 'Tell me about events', 'Contact information'];
  }

  return { response, suggestions };
};

const getChatbotResponse = async (req, res) => {
  try {
    const { message, conversationId } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message required' });
    }

    const lowerMessage = message.toLowerCase().trim();
    let response = '';
    let suggestions = [];

    // ALWAYS check knowledge base first - this ensures accurate matching
    const knowledge = await findMatchingKnowledge(message);
    
    // If we have a good knowledge base match, use it (unless it's an event query that needs real data)
    if (knowledge) {
      // Check if this is an event-related query that might benefit from real event data
      const eventPatterns = [
        /\b(event|events|activity|activities)\b/i,
        /\b(upcoming|coming|scheduled|available)\s+(event|events|activity|activities)\b/i,
        /\b(what|which|show|list|tell me about)\s+(event|events|activity|activities)\b/i,
        /\b(event|activity)\s+(schedule|list|calendar|info|information)\b/i
      ];
      
      const isEventQuery = eventPatterns.some(pattern => pattern.test(lowerMessage));
      const isEventCategory = knowledge.category === 'events' || knowledge.category === 'join_event';
      
      // If it's an event query and we have real events, enhance the response
      if (isEventQuery && isEventCategory) {
        try {
          const [events] = await pool.query(
            "SELECT event_name, description, event_date, location FROM events WHERE status = 'ongoing' ORDER BY event_date ASC LIMIT 5"
          );
          
          if (events && events.length > 0) {
            // Use real events data
            response = '📅 **Upcoming Events:**\n\n';
            events.forEach((event, index) => {
              const date = event.event_date ? new Date(event.event_date).toLocaleDateString() : 'TBA';
              response += `${index + 1}. **${event.event_name}**\n`;
              if (event.description) response += `   ${event.description.substring(0, 100)}...\n`;
              response += `   📍 ${event.location || 'TBA'}\n`;
              response += `   📆 ${date}\n\n`;
            });
            response += 'Visit your dashboard to see all events and apply for roles!';
            suggestions = parseSuggestions(knowledge.suggestions);
            if (suggestions.length === 0) {
              suggestions = ['How do I join an event?', 'What roles are available?', 'How to apply?'];
            }
          } else {
            // No real events, use knowledge base response
            response = knowledge.response;
            suggestions = parseSuggestions(knowledge.suggestions);
          }
        } catch (err) {
          console.error('Error fetching events:', err);
          // Fallback to knowledge base response on error
          response = knowledge.response;
          suggestions = parseSuggestions(knowledge.suggestions);
        }
      } else {
        // For all other queries, use knowledge base response directly
        response = knowledge.response;
        suggestions = parseSuggestions(knowledge.suggestions);
      }
    } else {
      // No knowledge base match found, check if it's an event query for real events
      const eventPatterns = [
        /\b(event|events|activity|activities)\b/i,
        /\b(upcoming|coming|scheduled|available)\s+(event|events|activity|activities)\b/i,
        /\b(what|which|show|list|tell me about)\s+(event|events|activity|activities)\b/i,
        /\b(event|activity)\s+(schedule|list|calendar|info|information)\b/i
      ];
      
      const isEventQuery = eventPatterns.some(pattern => pattern.test(lowerMessage));
      
      if (isEventQuery) {
        // Try to fetch real events
        try {
          const [events] = await pool.query(
            "SELECT event_name, description, event_date, location FROM events WHERE status = 'ongoing' ORDER BY event_date ASC LIMIT 5"
          );
          
          if (events && events.length > 0) {
            response = '📅 **Upcoming Events:**\n\n';
            events.forEach((event, index) => {
              const date = event.event_date ? new Date(event.event_date).toLocaleDateString() : 'TBA';
              response += `${index + 1}. **${event.event_name}**\n`;
              if (event.description) response += `   ${event.description.substring(0, 100)}...\n`;
              response += `   📍 ${event.location || 'TBA'}\n`;
              response += `   📆 ${date}\n\n`;
            });
            response += 'Visit your dashboard to see all events and apply for roles!';
            suggestions = ['How do I join an event?', 'What roles are available?', 'How to apply?'];
          } else {
            // No events, use fallback
            const fallback = getFallbackResponse(lowerMessage);
            response = fallback.response;
            suggestions = fallback.suggestions;
          }
        } catch (err) {
          console.error('Error fetching events:', err);
          // Use fallback on error
          const fallback = getFallbackResponse(lowerMessage);
          response = fallback.response;
          suggestions = fallback.suggestions;
        }
      } else {
        // Not an event query, use fallback
        const fallback = getFallbackResponse(lowerMessage);
        response = fallback.response;
        suggestions = fallback.suggestions;
      }
    }
    
    // Ensure suggestions are always set
    if (!suggestions || suggestions.length === 0) {
      suggestions = ['What is GPS UTM?', 'How do I register?', 'Tell me about events'];
    }

    // Add a small delay to simulate AI thinking (optional)
    await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 500));

    return res.json({ 
      reply: response,
      suggestions: suggestions,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Chatbot error:', error);
    
    // Final fallback on error
    const lowerMessage = (req.body.message || '').toLowerCase().trim();
    const fallback = getFallbackResponse(lowerMessage);
    
    return res.status(500).json({ 
      error: 'Sorry, I encountered an error. Please try again or contact support.',
      reply: fallback.response || '❌ I\'m having trouble processing that. Could you try rephrasing your question?',
      suggestions: fallback.suggestions || ['What is GPS UTM?', 'How do I register?', 'Tell me about events']
    });
  }
};

module.exports = {
  getChatbotResponse
};
