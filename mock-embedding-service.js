// Simple mock embedding service for testing
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Mock embedding generation with improved keyword matching
function generateMockEmbedding(text) {
  const normalizedText = text.toLowerCase().trim();
  
  // Create distinct embeddings based on keywords with better separation
  const embedding = new Array(384).fill(0);
  
  // DNS queries should NOT match anything - force escalation (check first)
  if (normalizedText.includes('dns') || 
      normalizedText.includes('domain name system') ||
      normalizedText.includes('name server')) {
    // Generate very low similarity to everything
    for (let i = 0; i < 384; i++) {
      embedding[i] = Math.random() * 0.2; // Very low values to force escalation
    }
    console.log('🚫 DNS query detected - will force escalation:', normalizedText);
    return embedding;
  }
  
  // Random words with DOI (like "bottle doi") should NOT match DOI answers (check before legitimate DOI)
  if (normalizedText.includes('doi') && 
      !normalizedText.match(/\b(access|find|where|how|get|locate|my|the|what|which)\b/)) {
    // Generate very low similarity to force escalation
    for (let i = 0; i < 384; i++) {
      embedding[i] = Math.random() * 0.1; // Very low values to trigger escalation
    }
    console.log('🚫 Random DOI mention detected - will escalate:', normalizedText);
    return embedding;
  }
  
  // DOI-related keywords - very specific matching (must be meaningful DOI context)
  if (normalizedText.includes('doi') && 
       (normalizedText.includes('access') || normalizedText.includes('find') || 
        normalizedText.includes('where') || normalizedText.includes('how') ||
        normalizedText.includes('get') || normalizedText.includes('locate') ||
        normalizedText.includes('my') || normalizedText.includes('the') ||
        normalizedText.includes('what') || normalizedText.includes('which'))) {
    for (let i = 0; i < 128; i++) {
      embedding[i] = 0.85 + Math.random() * 0.1; // High values for DOI
    }
    console.log('🎯 DOI-related query detected:', normalizedText);
    return embedding;
  }
  
  // Digital object identifier (full term)
  if (normalizedText.includes('digital object identifier') ||
      normalizedText.includes('publication identifier')) {
    for (let i = 0; i < 128; i++) {
      embedding[i] = 0.85 + Math.random() * 0.1; // High values for DOI
    }
    console.log('🎯 DOI-related query detected:', normalizedText);
    return embedding;
  }
  
  // Access/Login-related keywords - specific matching
  if (normalizedText.includes('login') || 
      normalizedText.includes('access') || 
      normalizedText.includes('account') || 
      normalizedText.includes('password') ||
      normalizedText.includes('sign in') ||
      normalizedText.includes('log in') ||
      normalizedText.includes('cannot access') ||
      normalizedText.includes('locked out')) {
    for (let i = 128; i < 256; i++) {
      embedding[i] = 0.85 + Math.random() * 0.1; // High values for Access
    }
    console.log('🔐 Access-related query detected:', normalizedText);
    return embedding;
  }
  
  // Hosting-related keywords - specific matching
  if (normalizedText.includes('hosting') || 
      normalizedText.includes('server') || 
      normalizedText.includes('bandwidth') || 
      normalizedText.includes('plan') ||
      normalizedText.includes('storage') ||
      normalizedText.includes('domain') ||
      normalizedText.includes('tier')) {
    for (let i = 256; i < 384; i++) {
      embedding[i] = 0.85 + Math.random() * 0.1; // High values for Hosting
    }
    console.log('🖥️ Hosting-related query detected:', normalizedText);
    return embedding;
  }
  
  // Unknown questions (should have low similarity to everything)
  for (let i = 0; i < 384; i++) {
    embedding[i] = Math.random() * 0.1; // Very low random values to trigger escalation
  }
  console.log('❓ Unknown query - will likely escalate:', normalizedText);
  return embedding;
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// Single embedding
app.post('/embeddings', (req, res) => {
  const { text } = req.body;
  
  if (!text) {
    return res.status(400).json({ error: 'Text is required' });
  }
  
  const embedding = generateMockEmbedding(text);
  
  res.json({
    embedding,
    model: 'mock-embedding-model'
  });
});

// Batch embeddings
app.post('/embeddings/batch', (req, res) => {
  const { texts } = req.body;
  
  if (!texts || !Array.isArray(texts)) {
    return res.status(400).json({ error: 'Texts array is required' });
  }
  
  const embeddings = texts.map(text => generateMockEmbedding(text));
  
  res.json({
    embeddings,
    model: 'mock-embedding-model'
  });
});

const PORT = 8000;
app.listen(PORT, () => {
  console.log(`🤖 Mock Embedding Service running on http://localhost:${PORT}`);
  console.log('📝 Available endpoints:');
  console.log('  GET  /health');
  console.log('  POST /embeddings');
  console.log('  POST /embeddings/batch');
  console.log('🎯 Configured for proper question matching:');
  console.log('  - DOI queries → DOI answers');
  console.log('  - Access queries → Access answers');
  console.log('  - Hosting queries → Hosting answers');
  console.log('  - DNS queries → Escalation (no match)');
  console.log('  - Unknown queries → Escalation');
});