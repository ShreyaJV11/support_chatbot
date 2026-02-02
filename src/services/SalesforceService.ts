import axios from 'axios';
import { config } from '../config';
import { SalesforceCase, SalesforceResponse } from '../types';
import { logger } from '../utils/logger';

export class SalesforceService {
  private instanceUrl: string;
  private clientId: string;
  private clientSecret: string;
  private username: string;
  private password: string;
  private securityToken: string;
  private accessToken?: string;
  private tokenExpiry?: Date;
  private useMockMode: boolean;

  constructor() {
    this.instanceUrl = config.salesforce.instanceUrl;
    this.clientId = config.salesforce.clientId;
    this.clientSecret = config.salesforce.clientSecret;
    this.username = config.salesforce.username;
    this.password = config.salesforce.password;
    this.securityToken = config.salesforce.securityToken;
    
    // Use mock mode if credentials are not properly configured
    this.useMockMode = !this.instanceUrl || !this.clientId || !this.username || 
                      this.instanceUrl.includes('test.salesforce.com') || 
                      this.clientId.includes('test_client_id') ||
                      this.username.includes('test@example.com');
    
    if (this.useMockMode) {
      logger.info('🎭 Salesforce Service running in MOCK MODE - no real API calls will be made');
    }
  }

  /**
   * Authenticate with Salesforce and get access token
   */
  private async authenticate(): Promise<string> {
    if (this.useMockMode) {
      return 'mock_access_token_' + Date.now();
    }

    try {
      // Check if we have a valid token
      if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
        return this.accessToken;
      }

      logger.info('Authenticating with Salesforce');

      const response = await axios.post(
        `${this.instanceUrl}/services/oauth2/token`,
        new URLSearchParams({
          grant_type: 'password',
          client_id: this.clientId,
          client_secret: this.clientSecret,
          username: this.username,
          password: this.password + this.securityToken,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 10000,
        }
      );

      this.accessToken = response.data.access_token;
      // Set token expiry to 1 hour from now (Salesforce tokens typically last 2 hours)
      this.tokenExpiry = new Date(Date.now() + 60 * 60 * 1000);

      logger.info('Salesforce authentication successful');
      return this.accessToken;
    } catch (error) {
      logger.error('Salesforce authentication failed:', error);
      throw new Error('Failed to authenticate with Salesforce');
    }
  }

  /**
   * Create a case in Salesforce for escalated questions
   * This is the core escalation function as specified in requirements
   */
  async createCase(data: {
    userQuestion: string;
    detectedCategory: string;
    confidenceScore: number;
    userEmail?: string;
    userName?: string;
    userOrganization?: string;
  }): Promise<string> {
    if (this.useMockMode) {
      return this.createMockCase(data);
    }

    try {
      const accessToken = await this.authenticate();

      // Prepare case data according to Salesforce API
      const caseData: SalesforceCase = {
        Subject: `Chatbot Escalation - ${data.detectedCategory} Query`,
        Description: this.formatCaseDescription(data),
        Origin: 'Web',
        Priority: 'Medium',
        Status: 'New',
        Type: 'Question'
      };

      logger.info('Creating Salesforce case', { 
        category: data.detectedCategory,
        confidence: data.confidenceScore 
      });

      const response = await axios.post<SalesforceResponse>(
        `${this.instanceUrl}/services/data/v58.0/sobjects/Case`,
        caseData,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        }
      );

      if (!response.data.success) {
        throw new Error(`Salesforce case creation failed: ${response.data.errors?.join(', ')}`);
      }

      const caseId = response.data.id;
      logger.info('Salesforce case created successfully', { case_id: caseId });

      return caseId;
    } catch (error) {
      logger.error('Error creating Salesforce case:', error);
      
      // Retry once as specified in requirements
      try {
        logger.info('Retrying Salesforce case creation');
        return await this.createCaseRetry(data);
      } catch (retryError) {
        logger.error('Salesforce case creation retry failed:', retryError);
        // As specified: if retry fails → log error → still confirm escalation to user
        throw new Error('Failed to create Salesforce case after retry');
      }
    }
  }

  /**
   * Create a mock case for testing/demo purposes
   */
  private async createMockCase(data: {
    userQuestion: string;
    detectedCategory: string;
    confidenceScore: number;
    userEmail?: string;
    userName?: string;
    userOrganization?: string;
  }): Promise<string> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));

    const mockCaseId = `SF-${Date.now().toString().slice(-6)}`;
    
    logger.info('🎭 Mock Salesforce case created', { 
      case_id: mockCaseId,
      category: data.detectedCategory,
      confidence: data.confidenceScore,
      question: data.userQuestion.substring(0, 50) + '...'
    });

    return mockCaseId;
  }

  /**
   * Retry case creation (called automatically on first failure)
   */
  private async createCaseRetry(data: {
    userQuestion: string;
    detectedCategory: string;
    confidenceScore: number;
    userEmail?: string;
    userName?: string;
    userOrganization?: string;
  }): Promise<string> {
    if (this.useMockMode) {
      return this.createMockCase(data);
    }

    // Force re-authentication for retry
    this.accessToken = undefined;
    this.tokenExpiry = undefined;

    const accessToken = await this.authenticate();

    const caseData: SalesforceCase = {
      Subject: `Chatbot Escalation - ${data.detectedCategory} Query (Retry)`,
      Description: this.formatCaseDescription(data),
      Origin: 'Web',
      Priority: 'Medium',
      Status: 'New',
      Type: 'Question'
    };

    const response = await axios.post<SalesforceResponse>(
      `${this.instanceUrl}/services/data/v58.0/sobjects/Case`,
      caseData,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    if (!response.data.success) {
      throw new Error(`Salesforce case creation retry failed: ${response.data.errors?.join(', ')}`);
    }

    return response.data.id;
  }

  /**
   * Format case description with all relevant information
   */
  private formatCaseDescription(data: {
    userQuestion: string;
    detectedCategory: string;
    confidenceScore: number;
    userEmail?: string;
    userName?: string;
    userOrganization?: string;
  }): string {
    let description = `CHATBOT ESCALATION\n\n`;
    description += `User Question: ${data.userQuestion}\n\n`;
    description += `Detected Category: ${data.detectedCategory}\n`;
    description += `Confidence Score: ${data.confidenceScore.toFixed(4)}\n`;
    description += `Escalation Reason: Score below threshold (${config.confidenceThreshold})\n\n`;
    
    if (data.userName) {
      description += `User Name: ${data.userName}\n`;
    }
    if (data.userEmail) {
      description += `User Email: ${data.userEmail}\n`;
    }
    if (data.userOrganization) {
      description += `Organization: ${data.userOrganization}\n`;
    }
    
    description += `\nTimestamp: ${new Date().toISOString()}\n`;
    description += `Source: MPS Support Assistant Chatbot`;
    
    if (this.useMockMode) {
      description += `\n\n[MOCK MODE - This is a test case]`;
    }

    return description;
  }

  /**
   * Get case details by ID (for admin panel)
   */
  async getCaseById(caseId: string): Promise<any> {
    if (this.useMockMode) {
      return {
        Id: caseId,
        Subject: 'Mock Case Subject',
        Status: 'New',
        Priority: 'Medium',
        CreatedDate: new Date().toISOString(),
        Description: 'Mock case description'
      };
    }

    try {
      const accessToken = await this.authenticate();

      const response = await axios.get(
        `${this.instanceUrl}/services/data/v58.0/sobjects/Case/${caseId}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
          timeout: 10000,
        }
      );

      return response.data;
    } catch (error) {
      logger.error('Error fetching Salesforce case:', { case_id: caseId, error });
      throw error;
    }
  }

  /**
   * Update case status (for admin operations)
   */
  async updateCaseStatus(caseId: string, status: string): Promise<boolean> {
    if (this.useMockMode) {
      logger.info('🎭 Mock case status update', { case_id: caseId, status });
      return true;
    }

    try {
      const accessToken = await this.authenticate();

      const response = await axios.patch(
        `${this.instanceUrl}/services/data/v58.0/sobjects/Case/${caseId}`,
        { Status: status },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      logger.info('Salesforce case status updated', { case_id: caseId, status });
      return response.status === 204;
    } catch (error) {
      logger.error('Error updating Salesforce case status:', { case_id: caseId, error });
      return false;
    }
  }

  /**
   * Health check for Salesforce connection
   */
  async healthCheck(): Promise<boolean> {
    if (this.useMockMode) {
      return true;
    }

    try {
      await this.authenticate();
      return true;
    } catch (error) {
      logger.error('Salesforce health check failed:', error);
      return false;
    }
  }

  /**
   * Get organization info (for validation)
   */
  async getOrganizationInfo(): Promise<any> {
    if (this.useMockMode) {
      return {
        Name: 'Mock Organization',
        Id: 'mock_org_id',
        IsSandbox: true
      };
    }

    try {
      const accessToken = await this.authenticate();

      const response = await axios.get(
        `${this.instanceUrl}/services/data/v58.0/sobjects/Organization`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
          timeout: 10000,
        }
      );

      return response.data;
    } catch (error) {
      logger.error('Error fetching Salesforce organization info:', error);
      throw error;
    }
  }
}

export default SalesforceService;