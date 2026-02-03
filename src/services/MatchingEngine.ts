import { Pinecone } from '@pinecone-database/pinecone';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config';
import { db } from '../database/connection';
import { logger } from '../utils/logger';

interface MatchResult {
  matched_entry: any | null;
  confidence_score: number;
  is_confident: boolean;
  source: 'VECTOR' | 'TEXT' | 'NONE';
}

export class MatchingEngine {
  private pinecone: Pinecone;
  private genAI: GoogleGenerativeAI;
  private indexName: string;
  private model: any;
  private CONFIDENCE_THRESHOLD = 0.75;

  constructor() {
    this.pinecone = new Pinecone({
      apiKey: config.pinecone.apiKey, 
    });
    this.indexName = config.pinecone.indexName;

    // API Key check (403 error prevent karne ke liye)
    this.genAI = new GoogleGenerativeAI(config.gemini.apiKey);
    this.model = this.genAI.getGenerativeModel({ model: "text-embedding-004" });
  }

  /**
   * Main logic to find the best match from Vector or Text search
   */
  async findBestMatch(userQuestion: string): Promise<MatchResult> {
    try {
      // Step 1: Vector Search (Semantic/AI Search)
      const vectorMatch = await this.performVectorSearch(userQuestion);
      
      if (vectorMatch && vectorMatch.score >= this.CONFIDENCE_THRESHOLD) {
        logger.info(`🎯 Vector Match Found! Score: ${vectorMatch.score}`);
        return {
          matched_entry: vectorMatch.metadata,
          confidence_score: vectorMatch.score,
          is_confident: true,
          source: 'VECTOR'
        };
      }

      // Step 2: Smart Text Search (Keyword Fallback)
      const textMatch = await this.performTextSearch(userQuestion);

      if (textMatch) {
        // ✅ FIX: 1.0 ki jagah dynamic score calculate kar rahe hain
        // search_rank (ts_rank) typically 0.0 to 1.0 ke beech hota hai
        const dynamicScore = textMatch.search_rank > 0 ? Math.min(0.85 + textMatch.search_rank, 0.95) : 0.85;
        
        logger.info(`🔍 Text Search Match! Rank Score: ${textMatch.search_rank}`);
        return {
          matched_entry: textMatch,
          confidence_score: dynamicScore, 
          is_confident: true,
          source: 'TEXT'
        };
      }

      return { matched_entry: null, confidence_score: 0, is_confident: false, source: 'NONE' };

    } catch (error) {
      logger.error('Error in findBestMatch:', error);
      return { matched_entry: null, confidence_score: 0, is_confident: false, source: 'NONE' };
    }
  }

  private async generateEmbedding(text: string): Promise<number[] | null> {
    const maxRetries = 3;
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        const result = await this.model.embedContent(text);
        return result.embedding.values;
      } catch (error: any) {
        attempt++;
        if (error.status === 403) {
            logger.error('❌ 403 Forbidden: API Key issues or Permissions. Vector search disabled.');
            return null;
        }
        if (error.status === 429 || error.message?.includes('429')) {
          await new Promise(res => setTimeout(res, attempt * 2000));
        } else {
          return null;
        }
      }
    }
    return null;
  }

  private async performVectorSearch(query: string) {
    try {
      const vector = await this.generateEmbedding(query);
      if (!vector) return null;

      const index = this.pinecone.index(this.indexName);
      const queryResponse = await index.query({
        vector: vector,
        topK: 1,
        includeMetadata: true,
      });

      if (queryResponse.matches.length > 0) {
        return {
          score: queryResponse.matches[0].score || 0,
          metadata: queryResponse.matches[0].metadata
        };
      }
      return null;
    } catch (error) {
      logger.error('Vector search failed:', error);
      return null;
    }
  }

  /**
   * ✅ UPDATED: Dynamic Text Search with Ranking
   * Ab ye sirf "ha/na" nahi bolega, balki batayega kitna accha match hai.
   */
  private async performTextSearch(query: string) {
    try {
      // ts_rank calculate karta hai ki keywords kitni bar aur kahan match hue
      const sqlQuery = `
        SELECT *, 
        ts_rank(to_tsvector('english', primary_question), plainto_tsquery('english', $1)) as search_rank
        FROM knowledge_base
        WHERE to_tsvector('english', primary_question || ' ' || COALESCE(alternate_questions::text, '')) 
        @@ plainto_tsquery('english', $1)
        ORDER BY search_rank DESC
        LIMIT 1;
      `;

      const result = await db.query(sqlQuery, [query]);
      
      if (result.rows.length > 0) {
        return result.rows[0];
      }
      
      return null;
    } catch (error) {
      logger.error('Text search failed:', error);
      return null;
    }
  }

  detectCategory(text: string): string {
    const lower = text.toLowerCase();
    if (lower.includes('doi')) return 'DOI';
    if (lower.includes('access') || lower.includes('login')) return 'Access';
    if (lower.includes('host') || lower.includes('server')) return 'Hosting';
    return 'General';
  }

  async healthCheck() {
    try {
      await this.pinecone.listIndexes();
      return { embedding_service: true, knowledge_base: true, overall_status: 'healthy' };
    } catch (e) {
      return { embedding_service: false, knowledge_base: false, overall_status: 'degraded' };
    }
  }

  getConfidenceThreshold() { return this.CONFIDENCE_THRESHOLD; }
  updateConfidenceThreshold(val: number) { this.CONFIDENCE_THRESHOLD = val; }
}

export default MatchingEngine;