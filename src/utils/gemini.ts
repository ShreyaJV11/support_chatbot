import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import { logger } from './logger'; // Ya console.log use kar le agar logger nahi hai

dotenv.config();

// API Key check
const apiKey = process.env.EMBEDDING_API_KEY;
if (!apiKey) {
  throw new Error('EMBEDDING_API_KEY is missing in .env file');
}

const genAI = new GoogleGenerativeAI(apiKey);

export const getEmbedding = async (text: string): Promise<number[]> => {
  try {
    // Model select karo (embedding-001 ya text-embedding-004)
    const model = genAI.getGenerativeModel({ model: "embedding-001" });

    // Text ko vector banao
    const result = await model.embedContent(text);
    const embedding = result.embedding;
    
    return embedding.values;
  } catch (error) {
    logger.error('Error generating embedding with Gemini:', error);
    throw error;
  }
};