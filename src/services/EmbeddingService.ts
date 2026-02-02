import axios from 'axios';
import { config } from '../config';
import { EmbeddingRequest, EmbeddingResponse } from '../types';
import { logger } from '../utils/logger';

export class EmbeddingService {
  private baseUrl: string;
  private apiKey?: string;

  constructor() {
    this.baseUrl = config.embeddingService.url;
    this.apiKey = config.embeddingService.apiKey;
  }

  /**
   * Generate embedding for a text string
   * This is the core function for converting text to vectors for similarity matching
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const response = await axios.post<EmbeddingResponse>(
        `${this.baseUrl}/embeddings`,
        { text } as EmbeddingRequest,
        {
          headers,
          timeout: 10000, // 10 second timeout
        }
      );

      if (!response.data.embedding || !Array.isArray(response.data.embedding)) {
        throw new Error('Invalid embedding response format');
      }

      logger.debug('Embedding generated successfully', { 
        textLength: text.length,
        embeddingDimension: response.data.embedding.length 
      });

      return response.data.embedding;
    } catch (error) {
      logger.error('Error generating embedding:', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        text: text.substring(0, 100) + '...' // Log first 100 chars for debugging
      });
      
      // Re-throw with more context
      if (axios.isAxiosError(error)) {
        throw new Error(`Embedding service error: ${error.response?.status} ${error.response?.statusText}`);
      }
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   * More efficient for processing multiple questions at once
   */
  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const response = await axios.post(
        `${this.baseUrl}/embeddings/batch`,
        { texts },
        {
          headers,
          timeout: 30000, // 30 second timeout for batch
        }
      );

      if (!response.data.embeddings || !Array.isArray(response.data.embeddings)) {
        throw new Error('Invalid batch embedding response format');
      }

      logger.debug('Batch embeddings generated successfully', { 
        count: texts.length,
        embeddingDimension: response.data.embeddings[0]?.length || 0
      });

      return response.data.embeddings;
    } catch (error) {
      logger.error('Error generating batch embeddings:', error);
      
      // Fallback to individual requests if batch fails
      logger.info('Falling back to individual embedding requests');
      const embeddings: number[][] = [];
      
      for (const text of texts) {
        try {
          const embedding = await this.generateEmbedding(text);
          embeddings.push(embedding);
        } catch (individualError) {
          logger.error('Failed to generate individual embedding:', individualError);
          throw individualError;
        }
      }
      
      return embeddings;
    }
  }

  /**
   * Calculate cosine similarity between two embeddings
   * This is the core similarity calculation as specified in requirements
   */
  static calculateCosineSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embeddings must have the same dimension');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
    
    if (magnitude === 0) {
      return 0;
    }

    return dotProduct / magnitude;
  }

  /**
   * Health check for the embedding service
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.baseUrl}/health`, {
        timeout: 5000,
      });
      
      return response.status === 200;
    } catch (error) {
      logger.error('Embedding service health check failed:', error);
      return false;
    }
  }
}

export default EmbeddingService;