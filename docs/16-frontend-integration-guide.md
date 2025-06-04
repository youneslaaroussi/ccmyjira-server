# Frontend Integration Guide

## 🚀 Quick Start

Your backend is **100% ready**! Here's everything you need to build the frontend.

**Backend URL:** `http://localhost:3000`
**Frontend URL:** `http://localhost:3001` (suggested)

---

## 📋 Part 1: Environment Setup

```env
# Frontend .env file
REACT_APP_API_URL=http://localhost:3000
REACT_APP_FRONTEND_URL=http://localhost:3001
```

**Required Packages:**
```bash
npm install axios react-router-dom
# Optional: @tanstack/react-query for better API management
```

---

## 🔑 Part 2: Authentication Flow

### Step 1: Login Button
```typescript
// Login page
const LoginPage = () => {
  const handleLogin = () => {
    window.location.href = `${process.env.REACT_APP_API_URL}/auth/atlassian`;
  };

  return (
    <div>
      <h1>Welcome to CCMyJIRA</h1>
      <button onClick={handleLogin}>
        Login with Atlassian
      </button>
    </div>
  );
};
```

### Step 2: OAuth Callback Handler
```typescript
// Handle callback after OAuth
// Route: /dashboard
const DashboardPage = () => {
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    
    if (token) {
      localStorage.setItem('jwt_token', token);
      // Clean URL
      window.history.replaceState({}, '', '/dashboard');
    }
  }, []);

  return <div>Dashboard content...</div>;
};
```

### Step 3: Auth Service
```typescript
// auth.service.ts
export class AuthService {
  private static baseUrl = process.env.REACT_APP_API_URL;

  static getToken() {
    return localStorage.getItem('jwt_token');
  }

  static async getCurrentUser() {
    const response = await fetch(`${this.baseUrl}/auth/me`, {
      headers: {
        'Authorization': `Bearer ${this.getToken()}`,
        'Content-Type': 'application/json'
      }
    });
    return response.json();
  }

  static async logout() {
    await fetch(`${this.baseUrl}/auth/logout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.getToken()}`
      }
    });
    localStorage.removeItem('jwt_token');
    window.location.href = '/';
  }

  static isAuthenticated() {
    return !!this.getToken();
  }
}
```

---

## 🏢 Part 3: Organization Setup

### Organization Creation Form
```typescript
const OrganizationSetup = () => {
  const [formData, setFormData] = useState({
    name: '',
    jiraBaseUrl: '',
    jiraProjectKey: '',
    domain: ''
  });

  const createOrganization = async () => {
    // Step 1: Create organization
    const orgResponse = await fetch(`${process.env.REACT_APP_API_URL}/api/organizations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AuthService.getToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: formData.name,
        jiraBaseUrl: formData.jiraBaseUrl,
        jiraProjectKey: formData.jiraProjectKey
      })
    });

    const org = await orgResponse.json();
    
    // Step 2: Move to domain verification
    setCurrentStep('domain-verification');
    setOrganizationId(org.id);
  };

  return (
    <form onSubmit={createOrganization}>
      <input placeholder="Company Name" value={formData.name} onChange={...} />
      <input placeholder="https://company.atlassian.net" value={formData.jiraBaseUrl} onChange={...} />
      <input placeholder="PROJECT" value={formData.jiraProjectKey} onChange={...} />
      <button type="submit">Create Organization</button>
    </form>
  );
};
```

---

## 📧 Part 4: Domain Verification

### Domain Verification Component
```typescript
const DomainVerification = ({ organizationId }) => {
  const [domain, setDomain] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | sent | verified
  const [verificationCode, setVerificationCode] = useState('');

  const sendVerificationEmail = async () => {
    setStatus('sending');
    try {
      await fetch(`${process.env.REACT_APP_API_URL}/auth/verify-domain/initiate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${AuthService.getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ domain, organizationId })
      });
      setStatus('sent');
    } catch (error) {
      alert('Failed to send verification email');
      setStatus('idle');
    }
  };

  const verifyCode = async () => {
    try {
      await fetch(`${process.env.REACT_APP_API_URL}/auth/verify-domain/confirm`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${AuthService.getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ domain, verificationCode })
      });
      setStatus('verified');
      // Redirect to dashboard
      setTimeout(() => window.location.href = '/dashboard', 2000);
    } catch (error) {
      alert('Invalid verification code');
    }
  };

  return (
    <div>
      {status === 'idle' && (
        <div>
          <h3>Verify Domain Ownership</h3>
          <input 
            placeholder="yourdomain.com"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
          />
          <button onClick={sendVerificationEmail}>
            Send Verification Email
          </button>
        </div>
      )}

      {status === 'sent' && (
        <div>
          <h3>📧 Check Your Email</h3>
          <p>We sent a verification email to <strong>admin@{domain}</strong></p>
          
          <div>
            <h4>Option 1: Click the link in your email</h4>
            <p>Check your inbox and click the verification link</p>
          </div>
          
          <div>
            <h4>Option 2: Enter code manually</h4>
            <input 
              placeholder="Enter verification code"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
            />
            <button onClick={verifyCode}>Verify Code</button>
          </div>
        </div>
      )}

      {status === 'verified' && (
        <div>
          <h3>✅ Domain Verified!</h3>
          <p>Redirecting to dashboard...</p>
        </div>
      )}
    </div>
  );
};
```

### Email Callback Page
```typescript
// Route: /domain-verified
const DomainVerifiedPage = () => {
  const searchParams = new URLSearchParams(window.location.search);
  const success = searchParams.get('success') === 'true';
  const domain = searchParams.get('domain');
  const error = searchParams.get('error');

  useEffect(() => {
    if (success) {
      setTimeout(() => window.location.href = '/dashboard', 3000);
    }
  }, [success]);

  return (
    <div>
      {success ? (
        <div>
          <h2>✅ Domain Verified!</h2>
          <p>Domain <strong>{domain}</strong> verified successfully.</p>
          <p>Redirecting to dashboard...</p>
        </div>
      ) : (
        <div>
          <h2>❌ Verification Failed</h2>
          <p>Error: {error}</p>
          <button onClick={() => window.location.href = '/setup'}>
            Try Again
          </button>
        </div>
      )}
    </div>
  );
};
```

---

## 🔒 Part 5: Protected Routes

```typescript
// ProtectedRoute component
const ProtectedRoute = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!AuthService.isAuthenticated()) {
      window.location.href = '/';
      return;
    }

    AuthService.getCurrentUser()
      .then(setUser)
      .catch(() => {
        localStorage.removeItem('jwt_token');
        window.location.href = '/';
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div>Loading...</div>;
  if (!user) return null;

  return children;
};

// Usage in App.js
<Route path="/dashboard" element={
  <ProtectedRoute>
    <Dashboard />
  </ProtectedRoute>
} />
```

---

## 📊 Part 6: Dashboard Integration

### Dashboard Service
```typescript
export class DashboardService {
  private static baseUrl = process.env.REACT_APP_API_URL;

  static async getStats() {
    const response = await fetch(`${this.baseUrl}/api/dashboard/stats`, {
      headers: {
        'Authorization': `Bearer ${AuthService.getToken()}`
      }
    });
    return response.json();
  }

  static async getTickets() {
    const response = await fetch(`${this.baseUrl}/api/dashboard/tickets`, {
      headers: {
        'Authorization': `Bearer ${AuthService.getToken()}`
      }
    });
    return response.json();
  }

  static async getUsers() {
    const response = await fetch(`${this.baseUrl}/api/dashboard/users`, {
      headers: {
        'Authorization': `Bearer ${AuthService.getToken()}`
      }
    });
    return response.json();
  }
}
```

### Simple Dashboard Component
```typescript
const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [tickets, setTickets] = useState([]);

  useEffect(() => {
    Promise.all([
      DashboardService.getStats(),
      DashboardService.getTickets()
    ]).then(([statsData, ticketsData]) => {
      setStats(statsData);
      setTickets(ticketsData);
    });
  }, []);

  return (
    <div>
      <h1>Dashboard</h1>
      
      {stats && (
        <div>
          <h3>Statistics</h3>
          <p>Total Tickets: {stats.totalTickets}</p>
          <p>Processed Today: {stats.processedToday}</p>
        </div>
      )}

      <div>
        <h3>Recent Tickets</h3>
        {tickets.map(ticket => (
          <div key={ticket.key}>
            <strong>{ticket.key}</strong>: {ticket.summary}
            <br />
            Assigned to: {ticket.assignee || 'Unassigned'}
          </div>
        ))}
      </div>
    </div>
  );
};
```

---

## 📱 Part 7: Complete App Structure

```typescript
// App.js
import { BrowserRouter, Routes, Route } from 'react-router-dom';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/setup" element={
          <ProtectedRoute>
            <OrganizationSetup />
          </ProtectedRoute>
        } />
        <Route path="/domain-verified" element={<DomainVerifiedPage />} />
      </Routes>
    </BrowserRouter>
  );
}
```

---

## 🔗 Part 8: All API Endpoints

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/auth/atlassian` | GET | ❌ | Start OAuth |
| `/auth/me` | GET | ✅ | Get user profile |
| `/auth/verify-domain/initiate` | POST | ✅ | Send verification email |
| `/auth/verify-domain/confirm` | POST | ✅ | Verify with code |
| `/auth/verify-domain/callback` | GET | ❌ | Email link handler |
| `/auth/domains/status` | GET | ✅ | Check domain status |
| `/api/dashboard/stats` | GET | ✅ | Dashboard stats |
| `/api/dashboard/tickets` | GET | ✅ | Ticket list |
| `/api/dashboard/users` | GET | ✅ | User list |
| `/api/dashboard/health` | GET | ❌ | System health |

---

## ✅ Part 9: Testing Checklist

### 1. Authentication Flow
- [ ] Login button redirects to Atlassian
- [ ] OAuth callback extracts token
- [ ] Protected routes work with JWT
- [ ] Logout clears token

### 2. Organization Setup
- [ ] Form creates organization
- [ ] Validation works for JIRA URLs
- [ ] Moves to domain verification

### 3. Domain Verification
- [ ] Email sends successfully
- [ ] Manual code input works
- [ ] Email link redirects properly
- [ ] Domain status updates

### 4. Dashboard
- [ ] Stats load correctly
- [ ] Tickets display properly
- [ ] All API calls work with auth

---

## 🚀 Part 10: Deployment Notes

### Build Command
```bash
npm run build
```

### Environment Variables (Production)
```env
REACT_APP_API_URL=https://your-api-domain.com
REACT_APP_FRONTEND_URL=https://your-frontend-domain.com
```

### CORS Already Configured
The backend supports these origins:
- `http://localhost:3000`
- `http://localhost:3001`
- `https://ccmyjira.com`
- And 14 other development URLs

---

## 🎯 Success Criteria

Your frontend is complete when:
1. ✅ User can login with Atlassian OAuth
2. ✅ Organization setup works end-to-end
3. ✅ Domain verification works via email + manual code
4. ✅ Dashboard loads with real data
5. ✅ All protected routes require authentication
6. ✅ Logout works properly

**The backend is 100% functional - just build the UI! 🚀** 