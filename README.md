# Enterprise AI Support Chatbot

## Overview
Enterprise-grade AI-powered support chatbot for deterministic, retrieval-based customer support with strict escalation rules.

## Architecture
- **Presentation Layer**: Web Chat UI (floating widget) + Admin Panel
- **Backend Layer**: Central API service with RBAC
- **AI Layer**: Query normalization + Matching engine + Confidence scoring
- **Data Layer**: PostgreSQL with 4 tables
- **External Systems**: Salesforce Case Management + Embedding service

## Key Features
- Non-conversational (one question → one response)
- High-confidence KB matching or escalation to Salesforce
- No hallucinations or generative answers
- Complete admin panel for KB management
- Floating chat widget integration

## Tech Stack
- Backend: Node.js + Express + TypeScript
- Database: PostgreSQL
- Frontend: React + TypeScript
- Embedding: OpenAI/Sentence-Transformers API
- External: Salesforce REST API

## Database Schema
- `knowledge_base` - Q&A entries with confidence weights
- `chat_logs` - All user interactions and responses
- `unanswered_questions` - Escalated queries for KB conversion
- `admin_audit_logs` - Admin action tracking

## Confidence Threshold
Configurable via environment variable (default: 0.7)
- Score ≥ threshold → ANSWER
- Score < threshold → ESCALATE

## Static Response Messages
- Initial: "Hi {name}, I'm the MPS Support Assistant..."
- Escalation: "Thanks for your question. I wasn't able to confidently answer this..."
- Error: "Sorry, something went wrong on our end..."