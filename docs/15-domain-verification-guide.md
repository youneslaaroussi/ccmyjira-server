# Domain Verification Guide

## Overview

The domain verification system ensures that organizations can only receive emails from domains they actually own. This prevents unauthorized email routing and maintains security in the multi-tenant environment.

## Architecture

### Flow Overview
1. **User Input**: Organization admin enters their domain (e.g., `acme.com`)
2. **Email Dispatch**: System sends verification email to `admin@{domain}`
3. **Email Verification**: Admin clicks link or enters code to verify ownership
4. **Domain Activation**: Domain is marked as verified and can receive emails

### Security Features
- ✅ **24-hour expiration** for verification codes
- ✅ **Email-based ownership proof** via `admin@domain`
- ✅ **Secure random tokens** (64-character hex)
- ✅ **Domain format validation** with regex
- ✅ **Event logging** for audit trails

## API Endpoints

### 1. Initiate Domain Verification

```http
POST /auth/verify-domain/initiate
Authorization: Bearer {jwt_token}
Content-Type: application/json

{
  "domain": "acme.com",
  "organizationId": "uuid-here"
}
```

**Response:**
```json
{
  "message": "Domain verification email sent",
  "domain": "acme.com",
  "expiresAt": "2025-06-04T18:45:00.000Z"
}
```

### 2. Manual Code Verification

```http
POST /auth/verify-domain/confirm
Authorization: Bearer {jwt_token}
Content-Type: application/json

{
  "domain": "acme.com",
  "verificationCode": "abc123..."
}
```

**Response:**
```json
{
  "message": "Domain verified successfully",
  "domain": "acme.com",
  "verifiedAt": "2025-06-03T18:45:00.000Z",
  "organizationId": "uuid-here"
}
```

### 3. Email Link Verification (No Auth Required)

```http
GET /auth/verify-domain/callback?code=abc123...&domain=acme.com
```

**Response:**
- Redirects to frontend with verification result
- Success: `{frontend_url}/domain-verified?domain=acme.com&success=true`
- Error: `{frontend_url}/domain-verified?domain=acme.com&success=false&error=message`

### 4. Check Domain Status

```http
GET /auth/domains/status?organizationId=uuid&domain=acme.com
Authorization: Bearer {jwt_token}
```

**Response:**
```json
[
  {
    "domain": "acme.com",
    "isVerified": true,
    "verifiedAt": "2025-06-03T18:45:00.000Z",
    "codeExpiresAt": null,
    "jiraBaseUrl": "https://acme.atlassian.net",
    "jiraProjectKey": "PROJ",
    "createdAt": "2025-06-03T18:00:00.000Z"
  }
]
```

## Email Template

### Postmark Integration

The system sends HTML and text verification emails via Postmark API:

**Subject:** `Verify domain ownership for {domain}`
**To:** `admin@{domain}`
**From:** `noreply@ccmyjira.com` (configurable)

**Email Content:**
- 🔐 Professional branded design
- ✅ Click-to-verify button
- 📋 Manual code input option
- ⏰ 24-hour expiration notice
- 📞 Contact information

## Environment Variables

Add these to your `.env` file:

```env
# Postmark Configuration
POSTMARK_API_TOKEN=your_postmark_token_here
FROM_EMAIL=noreply@ccmyjira.com

# Frontend URL for redirects
FRONTEND_URL=http://localhost:3001
```

## Database Schema

### Domain Configurations Table

```sql
CREATE TABLE domain_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  domain VARCHAR(255) NOT NULL,
  verification_code VARCHAR(255),
  verification_code_expires_at TIMESTAMPTZ,
  is_verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMPTZ,
  jira_base_url VARCHAR(255),
  jira_project_key VARCHAR(50),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(organization_id, domain)
);
```

### Event Logging

```sql
CREATE TABLE email_processing_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  event_type VARCHAR(50) NOT NULL,
  email_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Frontend Integration

### 1. Domain Setup Form

```typescript
// Domain verification component
function DomainVerification({ organizationId }: { organizationId: string }) {
  const [domain, setDomain] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'verified'>('idle');
  
  const initiateDomainVerification = async () => {
    setStatus('loading');
    try {
      const response = await fetch('/auth/verify-domain/initiate', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('jwt_token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ domain, organizationId })
      });
      
      if (response.ok) {
        setStatus('sent');
        // Show success message and email check instructions
      }
    } catch (error) {
      console.error('Domain verification failed:', error);
    }
  };

  return (
    <div className="domain-verification">
      <h3>Verify Domain Ownership</h3>
      <input 
        type="text" 
        placeholder="acme.com"
        value={domain}
        onChange={(e) => setDomain(e.target.value)}
      />
      <button onClick={initiateDomainVerification} disabled={status === 'loading'}>
        {status === 'loading' ? 'Sending...' : 'Send Verification Email'}
      </button>
      
      {status === 'sent' && (
        <div className="email-sent-notice">
          ✅ Verification email sent to admin@{domain}
          <p>Check your email and click the verification link, or enter the code below:</p>
          <ManualCodeInput domain={domain} onVerified={() => setStatus('verified')} />
        </div>
      )}
    </div>
  );
}
```

### 2. Manual Code Input

```typescript
function ManualCodeInput({ domain, onVerified }: { domain: string; onVerified: () => void }) {
  const [code, setCode] = useState('');
  
  const verifyCode = async () => {
    try {
      const response = await fetch('/auth/verify-domain/confirm', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('jwt_token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ domain, verificationCode: code })
      });
      
      if (response.ok) {
        onVerified();
      }
    } catch (error) {
      console.error('Code verification failed:', error);
    }
  };

  return (
    <div className="manual-code-input">
      <input 
        type="text" 
        placeholder="Enter verification code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <button onClick={verifyCode}>Verify Code</button>
    </div>
  );
}
```

### 3. Email Callback Handler

```typescript
// Route: /domain-verified
function DomainVerifiedPage() {
  const searchParams = new URLSearchParams(window.location.search);
  const success = searchParams.get('success') === 'true';
  const domain = searchParams.get('domain');
  const error = searchParams.get('error');

  if (success) {
    return (
      <div className="verification-success">
        ✅ Domain {domain} verified successfully!
        <Link to="/dashboard">Go to Dashboard</Link>
      </div>
    );
  } else {
    return (
      <div className="verification-error">
        ❌ Verification failed: {error}
        <Link to="/setup">Try Again</Link>
      </div>
    );
  }
}
```

### 4. Domain Status Display

```typescript
function DomainStatusList({ organizationId }: { organizationId: string }) {
  const [domains, setDomains] = useState([]);
  
  useEffect(() => {
    fetch(`/auth/domains/status?organizationId=${organizationId}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('jwt_token')}`
      }
    })
    .then(res => res.json())
    .then(setDomains);
  }, [organizationId]);

  return (
    <div className="domain-status-list">
      <h3>Configured Domains</h3>
      {domains.map(domain => (
        <div key={domain.domain} className="domain-item">
          <span className="domain-name">{domain.domain}</span>
          <span className={`status ${domain.isVerified ? 'verified' : 'pending'}`}>
            {domain.isVerified ? '✅ Verified' : '⏳ Pending'}
          </span>
          {domain.verifiedAt && (
            <span className="verified-date">
              Verified: {new Date(domain.verifiedAt).toLocaleDateString()}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
```

## Testing

### Manual Testing Steps

1. **Start Server**: `npm start`
2. **Login**: Authenticate via Atlassian OAuth
3. **Add Domain**: POST to `/auth/verify-domain/initiate`
4. **Check Email**: Look for verification email at `admin@yourdomain.com`
5. **Verify**: Either click link or POST code to `/auth/verify-domain/confirm`
6. **Confirm**: GET `/auth/domains/status` should show `isVerified: true`

### API Testing

```bash
# 1. Initiate verification
curl -X POST "http://localhost:3000/auth/verify-domain/initiate" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"domain": "test.com", "organizationId": "uuid"}'

# 2. Check status
curl -X GET "http://localhost:3000/auth/domains/status?organizationId=uuid" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# 3. Manual verification
curl -X POST "http://localhost:3000/auth/verify-domain/confirm" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"domain": "test.com", "verificationCode": "abc123..."}'
```

## Error Handling

### Common Error Scenarios

| Error | Cause | Solution |
|-------|-------|----------|
| `Invalid domain format` | Malformed domain string | Use valid domain format (e.g., `example.com`) |
| `Email service not configured` | Missing POSTMARK_API_TOKEN | Add Postmark API token to environment |
| `Verification code has expired` | Code older than 24 hours | Request new verification |
| `Invalid verification code` | Wrong/mistyped code | Check email for correct code |
| `Failed to send verification email` | Postmark API error | Check Postmark configuration and domain |

### Frontend Error Handling

```typescript
const handleDomainVerification = async (domain: string) => {
  try {
    const response = await fetch('/auth/verify-domain/initiate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ domain, organizationId })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Verification failed');
    }

    const result = await response.json();
    showSuccess(`Verification email sent to admin@${domain}`);
    
  } catch (error) {
    if (error.message.includes('Invalid domain format')) {
      showError('Please enter a valid domain name (e.g., example.com)');
    } else if (error.message.includes('Email service not configured')) {
      showError('Email service is temporarily unavailable. Please contact support.');
    } else {
      showError(`Verification failed: ${error.message}`);
    }
  }
};
```

## Security Considerations

### Best Practices

1. **Domain Validation**: Always validate domain format before processing
2. **Rate Limiting**: Implement rate limiting on verification endpoints
3. **Email Security**: Use SPF/DKIM records for email authentication
4. **Code Expiration**: Enforce 24-hour expiration for security
5. **Audit Logging**: Log all verification attempts for security monitoring

### Monitoring

Monitor these metrics:
- ✅ **Verification Success Rate**: Track successful vs failed verifications
- ⏱️ **Time to Verification**: Average time from send to verify
- 🚨 **Failed Attempts**: Monitor for abuse or configuration issues
- 📧 **Email Delivery**: Track Postmark delivery rates

## Troubleshooting

### Common Issues

1. **Email Not Received**
   - Check spam folder
   - Verify domain has MX records
   - Check Postmark delivery logs

2. **Link Not Working**
   - Verify FRONTEND_URL environment variable
   - Check for expired codes
   - Ensure proper URL encoding

3. **Domain Already Exists**
   - Use upsert operation to handle duplicates
   - Allow re-verification of existing domains

4. **Permission Errors**
   - Ensure user belongs to organization
   - Check JWT token validity
   - Verify organization membership

This completes the domain verification system! 🎉 