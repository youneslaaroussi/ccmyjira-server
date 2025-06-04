# 🏢 Multi-Tenant Architecture Plan

## Overview

Transform the AI email processing system from single-tenant to multi-tenant SaaS platform with Atlassian OAuth, domain-based routing, and Supabase backend.

## 🎯 Goals

- **Multi-tenancy**: Multiple organizations using the same system
- **Domain-based routing**: `support@vidova.ai` → Vidova's JIRA board
- **Self-service setup**: Users configure their own domains and JIRA projects
- **Secure authentication**: Atlassian OAuth integration
- **Email verification**: Confirm domain ownership

---

## 📊 Database Schema (Supabase)

### **1. Users Table**
```sql
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  atlassian_account_id text UNIQUE,
  display_name text,
  avatar_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_login_at timestamptz,
  
  -- Atlassian OAuth tokens (encrypted)
  atlassian_access_token text,
  atlassian_refresh_token text,
  atlassian_token_expires_at timestamptz,
  
  -- User preferences
  timezone text DEFAULT 'UTC',
  email_notifications boolean DEFAULT true
);

-- Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only see their own data" ON users
  FOR ALL USING (auth.uid() = id);
```

### **2. Organizations Table**
```sql
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL, -- for subdomain: vidova.ccmyjira.com
  owner_id uuid REFERENCES users(id) ON DELETE CASCADE,
  
  -- JIRA Configuration
  jira_base_url text NOT NULL, -- https://vidova.atlassian.net
  jira_project_key text NOT NULL, -- VID
  jira_cloud_id text, -- From Atlassian OAuth
  
  -- Subscription & Limits
  plan_type text DEFAULT 'free', -- free, pro, enterprise
  monthly_email_limit integer DEFAULT 100,
  emails_processed_this_month integer DEFAULT 0,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Feature flags per org
  features jsonb DEFAULT '{
    "smart_assignment": false,
    "sprints_enabled": false,
    "custom_prompts": false
  }'::jsonb
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Organization members can see org data" ON organizations
  FOR ALL USING (
    id IN (
      SELECT organization_id FROM organization_members 
      WHERE user_id = auth.uid()
    )
  );
```

### **3. Organization Members Table**
```sql
CREATE TABLE organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member', -- owner, admin, member
  invited_by uuid REFERENCES users(id),
  invited_at timestamptz DEFAULT now(),
  joined_at timestamptz,
  
  UNIQUE(organization_id, user_id)
);

ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
```

### **4. Domain Configurations Table**
```sql
CREATE TABLE domain_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  domain text NOT NULL, -- vidova.ai
  
  -- Verification
  verification_status text DEFAULT 'pending', -- pending, verified, failed
  verification_token text UNIQUE NOT NULL,
  verification_email text, -- support@vidova.ai (where we send confirmation)
  verified_at timestamptz,
  verification_attempts integer DEFAULT 0,
  
  -- Email routing settings
  default_assignee text, -- JIRA user accountId
  default_issue_type text DEFAULT 'Task',
  default_priority text DEFAULT 'Medium',
  
  -- AI processing settings
  ai_enabled boolean DEFAULT true,
  custom_prompt text,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(domain, organization_id)
);

ALTER TABLE domain_configurations ENABLE ROW LEVEL SECURITY;
```

### **5. Email Processing Logs Table**
```sql
CREATE TABLE email_processing_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id),
  domain_id uuid REFERENCES domain_configurations(id),
  
  -- Email details
  from_email text NOT NULL,
  to_email text NOT NULL,
  subject text,
  message_id text UNIQUE NOT NULL,
  
  -- Processing results
  status text NOT NULL, -- processing, completed, failed
  jira_ticket_key text,
  jira_ticket_id text,
  ai_analysis jsonb,
  processing_time_ms integer,
  error_message text,
  
  created_at timestamptz DEFAULT now(),
  processed_at timestamptz
);

-- Index for fast lookups
CREATE INDEX idx_email_logs_org_date ON email_processing_logs(organization_id, created_at DESC);
CREATE INDEX idx_email_logs_domain ON email_processing_logs(domain_id);
```

---

## 🔐 Authentication Flow

### **1. Atlassian OAuth Setup**
```typescript
// OAuth configuration
const ATLASSIAN_OAUTH_CONFIG = {
  clientId: process.env.ATLASSIAN_CLIENT_ID,
  clientSecret: process.env.ATLASSIAN_CLIENT_SECRET,
  scope: [
    'read:jira-user',
    'read:jira-work',
    'write:jira-work',
    'read:account'
  ].join(' '),
  redirectUri: `${process.env.APP_URL}/auth/atlassian/callback`
};
```

### **2. Authentication Flow**
```
1. User clicks "Login with Atlassian"
2. Redirect to Atlassian OAuth
3. User authorizes our app
4. Atlassian redirects back with code
5. Exchange code for access token
6. Fetch user info from Atlassian
7. Create/update user in Supabase
8. Set JWT session
9. Redirect to dashboard
```

---

## 🌐 Domain Management System

### **Domain Verification Process**

```typescript
interface DomainSetupFlow {
  step1: "User enters domain (vidova.ai)";
  step2: "User enters verification email (support@vidova.ai)";
  step3: "System generates verification token";
  step4: "Send confirmation email to support@vidova.ai";
  step5: "User clicks verification link";
  step6: "Domain marked as verified";
  step7: "Email routing activated";
}
```

### **Email Routing Logic**
```typescript
async function routeEmail(fromEmail: string, toEmail: string) {
  // Extract domain from sender
  const senderDomain = extractDomain(fromEmail); // vidova.ai
  
  // Find verified domain configuration
  const domainConfig = await supabase
    .from('domain_configurations')
    .select(`
      *,
      organization:organizations(*)
    `)
    .eq('domain', senderDomain)
    .eq('verification_status', 'verified')
    .single();
    
  if (!domainConfig) {
    throw new Error(`Domain ${senderDomain} not configured`);
  }
  
  // Use organization's JIRA configuration
  return {
    jiraBaseUrl: domainConfig.organization.jira_base_url,
    projectKey: domainConfig.organization.jira_project_key,
    defaultAssignee: domainConfig.default_assignee
  };
}
```

---

## 🔄 Implementation Phases

### **Phase 1: Authentication & Basic Multi-tenancy**
- [ ] Supabase setup and schema creation
- [ ] Atlassian OAuth integration
- [ ] User authentication system
- [ ] Basic organization management
- [ ] JWT-based API protection

### **Phase 2: Domain Management**
- [ ] Domain configuration UI
- [ ] Email verification system
- [ ] Domain verification flow
- [ ] Email routing logic enhancement

### **Phase 3: Enhanced Features**
- [ ] Organization member management
- [ ] Usage analytics and limits
- [ ] Custom AI prompts per organization
- [ ] Billing integration (Stripe)

### **Phase 4: Advanced Features**
- [ ] DNS verification (alternative to email)
- [ ] Subdomain support (vidova.ccmyjira.com)
- [ ] API keys for direct integration
- [ ] Webhook endpoints per organization

---

## 🛠️ Technical Implementation

### **1. Environment Variables (Updated)**
```env
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Atlassian OAuth
ATLASSIAN_CLIENT_ID=your-client-id
ATLASSIAN_CLIENT_SECRET=your-client-secret

# Application
APP_URL=https://ccmyjira.com
JWT_SECRET=your-jwt-secret

# Email Service (for verification emails)
SMTP_HOST=smtp.postmarkapp.com
SMTP_PORT=587
SMTP_USER=your-postmark-token
SMTP_PASS=your-postmark-token
```

### **2. New NestJS Modules**

```typescript
// Auth Module
@Module({
  imports: [JwtModule, PassportModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    AtlassianStrategy,
    JwtStrategy,
    SupabaseService
  ]
})
export class AuthModule {}

// Organizations Module
@Module({
  controllers: [OrganizationsController],
  providers: [OrganizationsService]
})
export class OrganizationsModule {}

// Domains Module
@Module({
  controllers: [DomainsController],
  providers: [
    DomainsService,
    EmailVerificationService,
    DomainVerificationService
  ]
})
export class DomainsModule {}
```

### **3. Enhanced Email Processing**
```typescript
@Processor('email-processing')
export class EmailProcessor {
  async processEmail(job: Job<EmailData>) {
    const { fromEmail, toEmail, ...emailData } = job.data;
    
    // 1. Determine organization from sender domain
    const orgConfig = await this.routingService.findOrgByDomain(fromEmail);
    
    // 2. Use organization-specific JIRA configuration
    const jiraService = new JiraService(orgConfig.jiraConfig);
    
    // 3. Process with organization's AI settings
    const aiAgent = new AiAgentService(orgConfig.aiConfig);
    
    // 4. Log to organization's processing logs
    await this.loggingService.logProcessing(orgConfig.id, emailData);
  }
}
```

---

## 🎨 Frontend Components Needed

### **Authentication Pages**
- Login page with "Login with Atlassian" button
- OAuth callback handler
- Dashboard after login

### **Organization Setup**
- Organization creation form
- JIRA project selection (from user's accessible projects)
- Team member invitation

### **Domain Management**
- Domain configuration form
- Verification status display
- Email settings per domain

### **Analytics Dashboard**
- Email processing statistics
- JIRA ticket creation metrics
- Usage limits and billing

---

## 📧 Email Verification Templates

### **Domain Verification Email**
```html
Subject: Verify your domain for CCMyJira

Hi there!

You've configured {{ domain }} to work with CCMyJira. 

To verify you own this domain, please click the link below:
{{ verificationLink }}

This link will expire in 24 hours.

Once verified, emails from {{ domain }} will be automatically 
processed and converted to JIRA tickets in your {{ projectKey }} project.

Questions? Reply to this email.

Best regards,
The CCMyJira Team
```

---

## 🚀 Migration Strategy

### **For Existing Single-Tenant Users**
1. Create default organization
2. Migrate existing configuration
3. Set up domain based on current usage
4. Maintain backward compatibility

### **Database Migration**
```sql
-- Create default organization for existing users
INSERT INTO organizations (name, slug, jira_base_url, jira_project_key)
SELECT 'Default Organization', 'default', 
       current_setting('app.jira_base_url'),
       current_setting('app.jira_project_key');
```

---

## 💰 Pricing Strategy Considerations

### **Free Tier**
- 1 organization
- 1 domain
- 100 emails/month
- Basic AI processing

### **Pro Tier ($29/month)**
- Unlimited domains
- 1,000 emails/month
- Advanced AI features
- Priority support

### **Enterprise Tier (Custom)**
- Custom limits
- SSO integration
- Dedicated support
- On-premise deployment

---

This architecture provides a solid foundation for scaling from single-tenant to multi-tenant SaaS. Would you like me to start implementing any specific part of this plan? 