import { KnowledgeBaseModel } from '../models/KnowledgeBase';
import { EmbeddingService } from './EmbeddingService';
import { KnowledgeBaseEntry } from '../types';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface MatchResult {
  matched_entry: KnowledgeBaseEntry | null;
  confidence_score: number;
  is_confident: boolean;
  processing_time_ms: number;
}

export class MatchingEngine {
  private embeddingService: EmbeddingService;
  private confidenceThreshold: number;

  constructor() {
    this.embeddingService = new EmbeddingService();
    this.confidenceThreshold = config.confidenceThreshold;
  }

  /**
   * Find the best match for a user question
   * This implements the exact confidence calculation specified:
   * Final Confidence Score = similarity_score × confidence_weight
   */
  async findBestMatch(userQuestion: string): Promise<MatchResult> {
    const startTime = Date.now();
    
    try {
      logger.info('Starting question matching process', { 
        question: userQuestion.substring(0, 100) + '...',
        threshold: this.confidenceThreshold 
      });

      // Step 1: Get all active knowledge base entries
      const kbEntries = await KnowledgeBaseModel.findAll();
      
      if (kbEntries.length === 0) {
        logger.warn('No knowledge base entries found');
        return {
          matched_entry: null,
          confidence_score: 0,
          is_confident: false,
          processing_time_ms: Date.now() - startTime
        };
      }

      // Step 2: Generate embedding for user question
      let userEmbedding: number[];
      try {
        userEmbedding = await this.embeddingService.generateEmbedding(userQuestion);
      } catch (embeddingError) {
        logger.error('Failed to generate user question embedding:', embeddingError);
        // If embedding service fails → ESCALATE (as specified)
        return {
          matched_entry: null,
          confidence_score: 0,
          is_confident: false,
          processing_time_ms: Date.now() - startTime
        };
      }

      // Step 3: Calculate similarities and find best match
      let bestMatch: KnowledgeBaseEntry | null = null;
      let bestConfidenceScore = 0;

      for (const entry of kbEntries) {
        try {
          // Generate embeddings for primary question and alternates
          const questionsToCheck = [
            entry.primary_question,
            ...entry.alternate_questions
          ];

          let maxSimilarity = 0;

          // Check similarity against all question variants
          for (const question of questionsToCheck) {
            const questionEmbedding = await this.embeddingService.generateEmbedding(question);
            const similarity = EmbeddingService.calculateCosineSimilarity(
              userEmbedding, 
              questionEmbedding
            );
            
            maxSimilarity = Math.max(maxSimilarity, similarity);
          }

          // Calculate final confidence score as specified:
          // Final Confidence Score = similarity_score × confidence_weight
          const finalConfidenceScore = maxSimilarity * entry.confidence_weight;

          logger.debug('Entry evaluated', {
            entry_id: entry.id,
            similarity: maxSimilarity,
            confidence_weight: entry.confidence_weight,
            final_score: finalConfidenceScore
          });

          // Track the best match
          if (finalConfidenceScore > bestConfidenceScore) {
            bestConfidenceScore = finalConfidenceScore;
            bestMatch = entry;
          }

        } catch (entryError) {
          logger.error('Error processing KB entry:', { 
            entry_id: entry.id, 
            error: entryError 
          });
          // Continue with other entries
        }
      }

      // Step 4: Apply threshold decision
      const isConfident = bestConfidenceScore >= this.confidenceThreshold;
      const processingTime = Date.now() - startTime;

      logger.info('Matching process completed', {
        best_score: bestConfidenceScore,
        threshold: this.confidenceThreshold,
        is_confident: isConfident,
        matched_entry_id: bestMatch?.id || null,
        processing_time_ms: processingTime
      });

      return {
        matched_entry: isConfident ? bestMatch : null,
        confidence_score: bestConfidenceScore,
        is_confident: isConfident,
        processing_time_ms: processingTime
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Error in matching engine:', error);
      
      // On any error → ESCALATE (as specified)
      return {
        matched_entry: null,
        confidence_score: 0,
        is_confident: false,
        processing_time_ms: processingTime
      };
    }
  }

  /**
   * Detect category from user question using simple keyword matching
   * This is used for categorizing escalated questions
   */
  detectCategory(userQuestion: string): 'DOI' | 'Access' | 'Hosting' | 'Unknown' {
    const questionLower = userQuestion.toLowerCase();

    // DOI-related keywords
    const doiKeywords = ['doi', 'digital object identifier', 'publication', 'paper', 'article', 'journal'];
    if (doiKeywords.some(keyword => questionLower.includes(keyword))) {
      return 'DOI';
    }

    // Access-related keywords
    const accessKeywords = ['login', 'password', 'access', 'account', 'sign in', 'authentication', 'credentials'];
    if (accessKeywords.some(keyword => questionLower.includes(keyword))) {
      return 'Access';
    }

    // Hosting-related keywords
    const hostingKeywords = ['hosting', 'server', 'domain', 'website', 'deployment', 'bandwidth', 'storage'];
    if (hostingKeywords.some(keyword => questionLower.includes(keyword))) {
      return 'Hosting';
    }

    return 'Unknown';
  }

  /**
   * Update confidence threshold (for admin configuration)
   */
  updateConfidenceThreshold(newThreshold: number): void {
    if (newThreshold < 0 || newThreshold > 1) {
      throw new Error('Confidence threshold must be between 0.0 and 1.0');
    }
    
    this.confidenceThreshold = newThreshold;
    logger.info('Confidence threshold updated', { new_threshold: newThreshold });
  }

  /**
   * Get current confidence threshold
   */
  getConfidenceThreshold(): number {
    return this.confidenceThreshold;
  }

  /**
   * Health check for the matching engine
   */
  async healthCheck(): Promise<{ 
    embedding_service: boolean; 
    knowledge_base: boolean; 
    threshold: number 
  }> {
    try {
      const [embeddingHealth, kbEntries] = await Promise.all([
        this.embeddingService.healthCheck(),
        KnowledgeBaseModel.findAll()
      ]);

      return {
        embedding_service: embeddingHealth,
        knowledge_base: kbEntries.length > 0,
        threshold: this.confidenceThreshold
      };
    } catch (error) {
      logger.error('Health check failed:', error);
      return {
        embedding_service: false,
        knowledge_base: false,
        threshold: this.confidenceThreshold
      };
    }
  }
}

export default MatchingEngine;