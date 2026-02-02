# Enterprise Support Chatbot API Documentation

## Overview

This API provides endpoints for the Enterprise Support Chatbot system, implementing deterministic, retrieval-based responses with Salesforce escalation.

## Base URL
```
http://localhost:3000
```

## Authentication

Admin endpoints require JWT authentication. Include the token in the Authorization header:
```
Authorization: Bearer <jwt_token>
```

---

## Public Endpoints

### Chat API

#### POST /api/chat
Process a user question and return appropriate response.

**Request Body:**
```json
{
  "user_question": "How do I access my DOI?",
  "user_session_id": "optional-session-id"
}
```

**Response (Answered):**
```json
{
  "response_type": "ANSWERED",
  "answer": "You are in good hands! I can help you with it\n\nTo access your DOI, please log into your account dashboard...",
  "confidence_score": 0.85
}
```

**Response (Escalated):**
```json
{
  "response_type": "ESCALATED",
  "message": "Thanks for your question. I wasn't able to confidently answer this, but I've raised a support ticket for you. Salesforce case no: SF-12345. Our team will get back to you shortly.",
  "case_id": "SF-12345"
}
```

**Response (Error):**
```json
{
  "response_type": "ERROR",
  "message": "Sorry, something went wrong on our end. Your request has been escalated to our support team."
}
```

#### GET /api/chat/health
Check chat service health status.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "services": {
    "matching_engine": {
      "embedding_service": true,
      "knowledge_base": true,
      "threshold": 0.7
    },
    "salesforce": true
  }
}
```

#### GET /api/chat/initial-message
Get the initial greeting message.

**Query Parameters:**
- `name` (optional): User's name for personalization

**Response:**
```json
{
  "message": "Hi there, I'm the MPS Support Assistant. I can help with DOI, Access, Hosting-related queries...",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

---

## Admin Endpoints

### Authentication

#### POST /admin/auth/login
Admin login to get JWT token.

**Request Body:**
```json
{
  "email": "admin@example.com",
  "password": "admin123"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "email": "admin@example.com",
    "role": "super_admin",
    "last_login": "2024-01-01T12:00:00.000Z"
  }
}
```

#### POST /admin/auth/logout
Admin logout (for logging purposes).

#### GET /admin/auth/me
Get current admin user information.

### Dashboard

#### GET /admin/dashboard
Get main dashboard statistics.

**Response:**
```json
{
  "total_questions": 1250,
  "answered_percentage": 78.5,
  "escalated_percentage": 19.2,
  "error_percentage": 2.3,
  "avg_confidence_score": 0.8234,
  "avg_processing_time": 245,
  "top_categories": [
    {"category": "DOI", "count": 450},
    {"category": "Access", "count": 320},
    {"category": "Hosting", "count": 280}
  ],
  "recent_escalations": [...],
  "knowledge_base": {
    "total_entries": 45,
    "by_category": [...]
  },
  "unanswered_questions": {
    "total": 240,
    "open": 45,
    "resolved": 180,
    "converted_to_kb": 15
  }
}
```

### Knowledge Base Management

#### GET /admin/kb
Get all knowledge base entries with pagination.

**Query Parameters:**
- `page` (default: 1): Page number
- `limit` (default: 20): Items per page
- `category`: Filter by category (DOI, Access, Hosting)
- `status`: Filter by status (active, inactive)
- `search`: Search query

#### GET /admin/kb/:id
Get a specific knowledge base entry.

#### POST /admin/kb
Create a new knowledge base entry.

**Request Body:**
```json
{
  "primary_question": "How do I reset my password?",
  "alternate_questions": ["Reset password", "Change password", "Forgot password"],
  "answer_text": "To reset your password, click the 'Forgot Password' link...",
  "category": "Access",
  "confidence_weight": 0.90
}
```

#### PUT /admin/kb/:id
Update a knowledge base entry.

#### DELETE /admin/kb/:id
Delete (soft delete) a knowledge base entry.

### Unanswered Questions

#### GET /admin/unanswered
Get all unanswered questions with pagination.

**Query Parameters:**
- `page`, `limit`: Pagination
- `status`: Filter by status (open, resolved, converted_to_kb)
- `category`: Filter by category

#### POST /admin/unanswered/:id/convert-to-kb
Convert an unanswered question to a knowledge base entry.

**Request Body:**
```json
{
  "primary_question": "How do I update my profile?",
  "alternate_questions": ["Update profile", "Change profile"],
  "answer_text": "To update your profile, go to Account Settings...",
  "category": "Access",
  "confidence_weight": 0.85
}
```

#### POST /admin/unanswered/:id/resolve
Mark an unanswered question as resolved.

### Chat Logs

#### GET /admin/chat-logs
Get all chat logs with pagination and filtering.

**Query Parameters:**
- `page`, `limit`: Pagination
- `response_type`: Filter by type (ANSWERED, ESCALATED, ERROR)
- `start_date`, `end_date`: Date range filter

#### GET /admin/chat-logs/export
Export chat logs as CSV.

---

## Error Responses

All endpoints return consistent error responses:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "timestamp": "2024-01-01T12:00:00.000Z",
    "path": "/api/chat",
    "details": [
      {
        "field": "user_question",
        "message": "Question is required"
      }
    ]
  }
}
```

### Error Codes
- `VALIDATION_ERROR` (400): Request validation failed
- `UNAUTHORIZED` (401): Authentication required
- `FORBIDDEN` (403): Insufficient permissions
- `NOT_FOUND` (404): Resource not found
- `CONFLICT` (409): Resource conflict
- `RATE_LIMIT_EXCEEDED` (429): Too many requests
- `INTERNAL_ERROR` (500): Server error
- `SERVICE_UNAVAILABLE` (503): External service unavailable

---

## Rate Limits

- **Chat API**: 30 requests per minute per IP
- **Admin API**: 100 requests per 15 minutes per IP
- **Login API**: 5 attempts per 15 minutes per IP

---

## Static Response Messages

The system uses predefined static messages as specified:

1. **Initial**: "Hi {name}, I'm the MPS Support Assistant. I can help with DOI, Access, Hosting-related queries and other tech queries by generating context understood technical responses. In other cases, I can help raise a salesforce support ticket. How can I help you today?"

2. **Confidence Response**: "You are in good hands! I can help you with it"

3. **Escalation**: "Thanks for your question. I wasn't able to confidently answer this, but I've raised a support ticket for you. Salesforce case no: {case_id}. Our team will get back to you shortly."

4. **Error**: "Sorry, something went wrong on our end. Your request has been escalated to our support team."

---

## Configuration

### Environment Variables

Required variables:
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- `JWT_SECRET`
- `SALESFORCE_INSTANCE_URL`, `SALESFORCE_CLIENT_ID`, etc.
- `CONFIDENCE_THRESHOLD` (default: 0.7)

### Confidence Threshold

The system uses a configurable confidence threshold (default: 0.7) to determine whether to answer or escalate:

- **Score ≥ threshold**: ANSWER with KB entry
- **Score < threshold**: ESCALATE to Salesforce

### Confidence Calculation

```
Final Confidence Score = similarity_score × confidence_weight
```

Where:
- `similarity_score`: Cosine similarity between user question and KB question embeddings (0-1)
- `confidence_weight`: Per-entry weight factor (0-1) set by admins