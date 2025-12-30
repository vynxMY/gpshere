// ============================================
// 📋 CHATBOT ADMIN CONTROLLER
// ============================================
// Admin CRUD operations for chatbot knowledge management

const pool = require('../config/database');

// Get all chatbot knowledge entries
const getAllKnowledge = async (req, res) => {
  try {
    const [entries] = await pool.query(
      "SELECT * FROM chatbot_knowledge ORDER BY priority DESC, category ASC"
    );

    return res.json(entries);
  } catch (error) {
    console.error('Error fetching chatbot knowledge:', error);
    return res.status(500).json({ error: 'Failed to fetch chatbot knowledge' });
  }
};

// Get single chatbot knowledge entry by ID
const getKnowledgeById = async (req, res) => {
  try {
    const { id } = req.params;

    const [entries] = await pool.query(
      "SELECT * FROM chatbot_knowledge WHERE id = ?",
      [id]
    );

    if (entries.length === 0) {
      return res.status(404).json({ error: 'Knowledge entry not found' });
    }

    return res.json(entries[0]);
  } catch (error) {
    console.error('Error fetching knowledge entry:', error);
    return res.status(500).json({ error: 'Failed to fetch knowledge entry' });
  }
};

// Create new chatbot knowledge entry
const createKnowledge = async (req, res) => {
  try {
    const { category, keywords, response, suggestions, priority, is_active } = req.body;

    // Validation
    if (!category || !keywords || !response) {
      return res.status(400).json({ 
        error: 'Category, keywords, and response are required' 
      });
    }

    // Check if category already exists
    const [existing] = await pool.query(
      "SELECT id FROM chatbot_knowledge WHERE category = ?",
      [category]
    );

    if (existing.length > 0) {
      return res.status(400).json({ 
        error: 'Category already exists. Use update instead.' 
      });
    }

    // Insert new entry
    const [result] = await pool.query(
      "INSERT INTO chatbot_knowledge (category, keywords, response, suggestions, priority, is_active) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
      [
        category,
        keywords || '',
        response,
        suggestions || '',
        priority || 0,
        is_active !== undefined ? is_active : true
      ]
    );

    // Fetch the created entry
    const [newEntry] = await pool.query(
      "SELECT * FROM chatbot_knowledge WHERE id = ?",
      [result.insertId]
    );

    return res.status(201).json({
      message: 'Knowledge entry created successfully',
      data: newEntry[0]
    });
  } catch (error) {
    console.error('Error creating knowledge entry:', error);
    return res.status(500).json({ error: 'Failed to create knowledge entry' });
  }
};

// Update chatbot knowledge entry
const updateKnowledge = async (req, res) => {
  try {
    const { id } = req.params;
    const { category, keywords, response, suggestions, priority, is_active } = req.body;

    // Check if entry exists
    const [existing] = await pool.query(
      "SELECT id FROM chatbot_knowledge WHERE id = ?",
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Knowledge entry not found' });
    }

    // If category is being changed, check if new category already exists
    if (category) {
      const [categoryCheck] = await pool.query(
        "SELECT id FROM chatbot_knowledge WHERE category = ? AND id != ?",
        [category, id]
      );

      if (categoryCheck.length > 0) {
        return res.status(400).json({ 
          error: 'Category already exists' 
        });
      }
    }

    // Build update query dynamically
    const updates = [];
    const values = [];

    if (category !== undefined) {
      updates.push('category = ?');
      values.push(category);
    }
    if (keywords !== undefined) {
      updates.push('keywords = ?');
      values.push(keywords);
    }
    if (response !== undefined) {
      updates.push('response = ?');
      values.push(response);
    }
    if (suggestions !== undefined) {
      updates.push('suggestions = ?');
      values.push(suggestions);
    }
    if (priority !== undefined) {
      updates.push('priority = ?');
      values.push(priority);
    }
    if (is_active !== undefined) {
      updates.push('is_active = ?');
      values.push(is_active);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);

    await pool.query(
      `UPDATE chatbot_knowledge SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP WHERE id = ?`,
      values
    );

    // Fetch updated entry
    const [updatedEntry] = await pool.query(
      "SELECT * FROM chatbot_knowledge WHERE id = ?",
      [id]
    );

    return res.json({
      message: 'Knowledge entry updated successfully',
      data: updatedEntry[0]
    });
  } catch (error) {
    console.error('Error updating knowledge entry:', error);
    return res.status(500).json({ error: 'Failed to update knowledge entry' });
  }
};

// Delete chatbot knowledge entry
const deleteKnowledge = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if entry exists
    const [existing] = await pool.query(
      "SELECT id FROM chatbot_knowledge WHERE id = ?",
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Knowledge entry not found' });
    }

    await pool.query(
      "DELETE FROM chatbot_knowledge WHERE id = ?",
      [id]
    );

    return res.json({ message: 'Knowledge entry deleted successfully' });
  } catch (error) {
    console.error('Error deleting knowledge entry:', error);
    return res.status(500).json({ error: 'Failed to delete knowledge entry' });
  }
};

// Toggle knowledge entry active status
const toggleKnowledgeStatus = async (req, res) => {
  try {
    const { id } = req.params;

    // Get current status
    const [entries] = await pool.query(
      "SELECT is_active FROM chatbot_knowledge WHERE id = ?",
      [id]
    );

    if (entries.length === 0) {
      return res.status(404).json({ error: 'Knowledge entry not found' });
    }

    const newStatus = !entries[0].is_active;

    await pool.query(
      "UPDATE chatbot_knowledge SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [newStatus, id]
    );

    return res.json({
      message: `Knowledge entry ${newStatus ? 'activated' : 'deactivated'} successfully`,
      is_active: newStatus
    });
  } catch (error) {
    console.error('Error toggling knowledge status:', error);
    return res.status(500).json({ error: 'Failed to toggle knowledge status' });
  }
};

// Populate chatbot knowledge from predefined entries
// Uses the same knowledge entries as scripts/populateChatbotData.js
const populateChatbotKnowledge = async (req, res) => {
  try {
    console.log('Starting chatbot knowledge population via API...');
    
    // Import knowledge entries from the populate script
    let getKnowledgeEntries;
    try {
      const populateModule = require('../../scripts/populateChatbotData');
      getKnowledgeEntries = populateModule.getKnowledgeEntries;
      
      if (typeof getKnowledgeEntries !== 'function') {
        throw new Error('getKnowledgeEntries is not a function');
      }
    } catch (requireError) {
      console.error('Error requiring populateChatbotData:', requireError);
      return res.status(500).json({ 
        error: 'Failed to load knowledge entries',
        details: requireError.message,
        stack: process.env.NODE_ENV === 'development' ? requireError.stack : undefined
      });
    }
    
    const knowledgeEntries = getKnowledgeEntries();
    
    if (!Array.isArray(knowledgeEntries) || knowledgeEntries.length === 0) {
      return res.status(500).json({ 
        error: 'No knowledge entries found',
        details: 'getKnowledgeEntries() returned empty or invalid data'
      });
    }
    
    console.log(`Processing ${knowledgeEntries.length} knowledge entries...`);
    
    let inserted = 0;
    let updated = 0;

    for (const knowledge of knowledgeEntries) {
      // Validate required fields
      if (!knowledge.category || !knowledge.keywords || !knowledge.response) {
        console.warn(`Skipping invalid entry: ${knowledge.category || 'unknown'}`);
        continue;
      }
      
      // Check if entry exists by category
      const [existing] = await pool.query(
        "SELECT id FROM chatbot_knowledge WHERE category = ?",
        [knowledge.category]
      );

      if (existing.length > 0) {
        // Update existing entry
        await pool.query(
          "UPDATE chatbot_knowledge SET keywords = ?, response = ?, suggestions = ?, priority = ?, updated_at = CURRENT_TIMESTAMP WHERE category = ?",
          [knowledge.keywords, knowledge.response, knowledge.suggestions || '', knowledge.priority || 0, knowledge.category]
        );
        updated++;
        console.log(`Updated: ${knowledge.category}`);
      } else {
        // Insert new entry
        await pool.query(
          "INSERT INTO chatbot_knowledge (category, keywords, response, suggestions, priority) VALUES (?, ?, ?, ?, ?)",
          [knowledge.category, knowledge.keywords, knowledge.response, knowledge.suggestions || '', knowledge.priority || 0]
        );
        inserted++;
        console.log(`Inserted: ${knowledge.category}`);
      }
    }

    console.log(`Population complete! Inserted: ${inserted}, Updated: ${updated}`);

    return res.json({
      success: true,
      message: 'Chatbot knowledge populated successfully',
      inserted,
      updated,
      total: knowledgeEntries.length
    });
  } catch (error) {
    console.error('Error populating chatbot knowledge:', error);
    console.error('Error stack:', error.stack);
    
    // Ensure we always return valid JSON
    try {
      return res.status(500).json({ 
        error: 'Failed to populate chatbot knowledge',
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    } catch (jsonError) {
      // Fallback if JSON.stringify fails
      console.error('Failed to send JSON response:', jsonError);
      return res.status(500).send('Internal server error');
    }
  }
};

module.exports = {
  getAllKnowledge,
  getKnowledgeById,
  createKnowledge,
  updateKnowledge,
  deleteKnowledge,
  toggleKnowledgeStatus,
  populateChatbotKnowledge
};

