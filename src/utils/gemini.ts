import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import { logger } from './logger';

dotenv.config();

// API Key check
const apiKey = process.env.EMBEDDING_API_KEY;
if (!apiKey) {
  throw new Error('EMBEDDING_API_KEY is missing in .env file');
}

const genAI = new GoogleGenerativeAI(apiKey);

export const getEmbedding = async (text: string): Promise<number[]> => {
  try {
    const model = genAI.getGenerativeModel({ model: "embedding-001" });
    const result = await model.embedContent(text);
    const embedding = result.embedding;
    return embedding.values;
  } catch (error) {
    logger.error('Error generating embedding with Gemini:', error);
    throw error;
  }
};