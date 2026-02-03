CREATE TABLE knowledge_base (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    primary_question TEXT NOT NULL,
    alternate_questions JSONB DEFAULT '[]'::jsonb, -- Array of alternate phrasings
    answer_text TEXT NOT NULL,
    category VARCHAR(20) NOT NULL CHECK (category IN ('DOI', 'Access', 'Hosting')),
    confidence_weight DECIMAL(3,2) NOT NULL DEFAULT 1.00 CHECK (confidence_weight >= 0.0 AND confidence_weight <= 1.0),
    status VARCHAR(10) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. User Info Table 

CREATE TABLE user_info (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    organization VARCHAR(150),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Chat Logs Table
CREATE TABLE chat_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    user_id UUID REFERENCES user_info(id), 
    user_question TEXT NOT NULL,
    matched_kb_id UUID REFERENCES knowledge_base(id),
    confidence_score DECIMAL(5,4),
    response_type VARCHAR(20) NOT NULL CHECK (response_type IN ('ANSWERED', 'ESCALATED', 'ERROR')),
    salesforce_case_id VARCHAR(50),
    user_session_id VARCHAR(100),
    response_text TEXT,
    processing_time_ms INTEGER
);

-- 4. Unanswered Questions Table
CREATE TABLE unanswered_questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_question TEXT NOT NULL,
    detected_category VARCHAR(20) CHECK (detected_category IN ('DOI', 'Access', 'Hosting', 'Unknown')),
    confidence_score DECIMAL(5,4),
    salesforce_case_id VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'converted_to_kb')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP WITH TIME ZONE,
    converted_kb_id UUID REFERENCES knowledge_base(id) -- If converted to KB entry
);

-- 5. Admin Audit Logs Table
CREATE TABLE admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_user VARCHAR(100) NOT NULL,
    action_type VARCHAR(50) NOT NULL, -- CREATE, UPDATE, DELETE, LOGIN, etc.
    resource_affected VARCHAR(100), -- Table name or resource identifier
    resource_id UUID, -- ID of affected resource
    old_values JSONB, -- Previous values for updates
    new_values JSONB, -- New values for creates/updates
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ip_address INET,
    user_agent TEXT
);


-- Indexes for Performance
CREATE INDEX idx_knowledge_base_category ON knowledge_base(category);
CREATE INDEX idx_knowledge_base_status ON knowledge_base(status);
CREATE INDEX idx_chat_logs_timestamp ON chat_logs(timestamp);
CREATE INDEX idx_chat_logs_response_type ON chat_logs(response_type);
CREATE INDEX idx_unanswered_questions_status ON unanswered_questions(status);
CREATE INDEX idx_unanswered_questions_created_at ON unanswered_questions(created_at);
CREATE INDEX idx_admin_audit_logs_timestamp ON admin_audit_logs(timestamp);
CREATE INDEX idx_admin_audit_logs_admin_user ON admin_audit_logs(admin_user);
CREATE INDEX idx_user_info_email ON user_info(email);

-- Full-text search indexes for questions
CREATE INDEX idx_knowledge_base_primary_question_fts ON knowledge_base USING gin(to_tsvector('english', primary_question));
CREATE INDEX idx_chat_logs_user_question_fts ON chat_logs USING gin(to_tsvector('english', user_question));

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_knowledge_base_updated_at 
    BEFORE UPDATE ON knowledge_base 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_info_updated_at 
    BEFORE UPDATE ON user_info 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Sample data for testing (optional)
INSERT INTO knowledge_base (primary_question, alternate_questions, answer_text, category, confidence_weight) VALUES
('How do I access my DOI?', '["Where can I find my DOI?", "DOI access help", "Cannot access DOI"]', 'To access your DOI, please log into your account dashboard and navigate to the Publications section. Your DOI will be listed next to each published item.', 'DOI', 0.95),
('What hosting options are available?', '["Hosting plans", "Available hosting", "Hosting services"]', 'We offer three hosting tiers: Basic (shared hosting), Professional (VPS), and Enterprise (dedicated servers). Each tier includes different storage, bandwidth, and support levels.', 'Hosting', 0.90),
('I cannot access my account', '["Login issues", "Account access problems", "Cannot log in"]', 'If you cannot access your account, please try resetting your password using the "Forgot Password" link. If issues persist, contact our support team.', 'Access', 0.85);

-- Grant permissions (adjust as needed for your setup)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO chatbot_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO chatbot_user;- Enterprise Support Chatbot Database Schema
-- PostgreSQL Database with 4 tables as specified

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Knowledge Base Table
