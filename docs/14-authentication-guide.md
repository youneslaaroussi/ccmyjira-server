# 🔐 Authentication System Guide

## Overview

The authentication system uses **Atlassian OAuth** for user login and **JWT tokens** for API access. This provides secure authentication while allowing users to access their JIRA resources.

---

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend UI   │───▶│  Backend API     │───▶│   Atlassian     │
│                 │    │                  │    │   OAuth         │
└─────────────────┘    └──────────────────┘    └─────────────────┘
        │                        │                        │
        │                        ▼                        │
        │               ┌──────────────────┐              │
        │               │   Supabase DB    │              │
        │               │  (User Storage)  │              │
        │               └──────────────────┘              │
        │                                                 │
        └──────────────── JWT Token ◀────────────────────┘
```

### **Components:**
1. **AtlassianOAuthStrategy**: Handles OAuth flow with Atlassian
2. **JwtStrategy**: Validates JWT tokens for protected routes
3. **SupabaseService**: Manages user data in Supabase database
4. **AuthService**: Orchestrates authentication logic
5. **AuthController**: Provides REST API endpoints

---

## 🔄 Authentication Flow

### **Step-by-Step Process:**

```
1. User clicks "Login with Atlassian" button
   ↓
2. Frontend redirects to: GET /auth/atlassian
   ↓
3. Backend redirects to Atlassian OAuth page
   ↓
4. User authorizes the application on Atlassian
   ↓
5. Atlassian redirects to: GET /auth/atlassian/callback
   ↓
6. Backend exchanges code for access token
   ↓
7. Backend fetches user profile from Atlassian API
   ↓
8. Backend creates/updates user in Supabase
   ↓
9. Backend generates JWT token
   ↓
10. Backend returns user data + JWT token
   ↓
11. Frontend stores JWT token and redirects to dashboard
```

---

## 🛠️ Setup Instructions

### **1. Environment Configuration**

Copy `env.sample` to `.env` and fill in the required values:

```bash
# Authentication
JWT_SECRET=your-super-secure-jwt-secret-change-this
APP_URL=http://localhost:3000
FRONTEND_URL=http://localhost:3001

# Atlassian OAuth (Required)
ATLASSIAN_CLIENT_ID=your-atlassian-client-id
ATLASSIAN_CLIENT_SECRET=your-atlassian-client-secret

# Supabase (Optional - fallback mode if not configured)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...your-service-role-key
```

### **2. Create Atlassian OAuth App**

1. Go to [Atlassian Developer Console](https://developer.atlassian.com/console/myapps/)
2. Click "Create" → "OAuth 2.0 integration"
3. Fill in app details:
   - **App name**: CCMyJira
   - **Callback URL**: `http://localhost:3000/auth/atlassian/callback`
4. Configure permissions:
   - `read:jira-user`
   - `read:jira-work` 
   - `write:jira-work`
   - `read:account`
   - `offline_access` (for refresh tokens)
5. Copy `Client ID` and `Client Secret` to your `.env` file

### **3. Supabase Setup (Optional)**

If you want user persistence:

1. Create a new Supabase project
2. Run the database schema from `docs/13-multi-tenant-architecture.md`
3. Get your project URL and service role key
4. Add them to `.env`

---

## 🌐 API Endpoints

### **Authentication Routes**

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `GET` | `/auth/config` | Get auth configuration | ❌ |
| `GET` | `/auth/health` | Health check | ❌ |
| `GET` | `/auth/atlassian` | Start OAuth flow | ❌ |
| `GET` | `/auth/atlassian/callback` | OAuth callback | ❌ |
| `GET` | `/auth/me` | Get current user | ✅ |
| `POST` | `/auth/logout` | Logout user | ✅ |

### **Example Responses**

#### **GET /auth/config**
```json
{
  "atlassian": {
    "configured": true,
    "clientId": "your-client-id",
    "authUrl": "/auth/atlassian"
  },
  "supabase": {
    "configured": true
  },
  "jwt": {
    "configured": true
  }
}
```

#### **GET /auth/atlassian/callback** (Success)
```json
{
  "success": true,
  "message": "Authentication successful",
  "user": {
    "id": "user-uuid",
    "email": "john@example.com",
    "displayName": "John Doe",
    "avatarUrl": "https://avatar.url"
  },
  "access_token": "eyJ...",
  "organizations": [],
  "accessibleResources": [
    {
      "id": "cloud-id",
      "name": "My JIRA Site",
      "url": "https://mysite.atlassian.net"
    }
  ],
  "redirect": "http://localhost:3001/dashboard?token=eyJ..."
}
```

#### **GET /auth/me**
```json
{
  "user": {
    "id": "user-uuid",
    "email": "john@example.com", 
    "displayName": "John Doe",
    "avatarUrl": "https://avatar.url"
  },
  "organizations": []
}
```

---

## 🖥️ Frontend Integration

### **1. Login Button**

Create a login button that redirects to the OAuth endpoint:

```javascript
// React/Next.js example
function LoginButton() {
  const handleLogin = () => {
    window.location.href = `${process.env.NEXT_PUBLIC_API_URL}/auth/atlassian`;
  };

  return (
    <button onClick={handleLogin} className="login-btn">
      <img src="/atlassian-logo.svg" alt="Atlassian" />
      Login with Atlassian
    </button>
  );
}
```

### **2. Handle OAuth Callback**

Create a page to handle the OAuth callback:

```javascript
// pages/auth/callback.js (Next.js example)
import { useRouter } from 'next/router';
import { useEffect } from 'react';

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const { token, error } = router.query;

    if (error) {
      // Handle authentication error
      router.push('/login?error=' + error);
      return;
    }

    if (token) {
      // Store JWT token
      localStorage.setItem('auth_token', token);
      
      // Redirect to dashboard
      router.push('/dashboard');
    }
  }, [router.query]);

  return <div>Processing authentication...</div>;
}
```

### **3. Axios Interceptor for JWT**

Set up Axios to automatically include the JWT token:

```javascript
// utils/api.js
import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
});

// Add JWT token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle token expiration
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
```

### **4. React Auth Context**

Create a context for managing authentication state:

```javascript
// contexts/AuthContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../utils/api';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        setLoading(false);
        return;
      }

      const response = await api.get('/auth/me');
      setUser(response.data.user);
    } catch (error) {
      localStorage.removeItem('auth_token');
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('auth_token');
    setUser(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
```

### **5. Protected Route Component**

Create a component to protect authenticated routes:

```javascript
// components/ProtectedRoute.js
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return null;
  }

  return children;
}
```

---

## 🧪 Testing the Authentication

### **1. Test Configuration**

```bash
curl http://localhost:3000/auth/config
```

Should return configuration status showing if Atlassian OAuth is set up.

### **2. Test Health Check**

```bash
curl http://localhost:3000/auth/health
```

Should return system health including Supabase connection status.

### **3. Test OAuth Flow**

1. Open browser to: `http://localhost:3000/auth/atlassian`
2. Complete Atlassian OAuth flow
3. Check callback response for JWT token
4. Use token to access protected routes

### **4. Test Protected Route**

```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     http://localhost:3000/auth/me
```

---

## 🚨 Security Considerations

### **JWT Token Security**
- Tokens expire after 24 hours
- Store securely (httpOnly cookies in production)
- Use HTTPS in production
- Implement refresh token rotation

### **Environment Variables**
- Never commit secrets to version control
- Use different secrets for each environment
- Rotate secrets regularly

### **CORS Configuration**
- Only allow trusted domains
- Configure properly for production

---

## 🐛 Troubleshooting

### **Common Issues**

#### **"Missing Atlassian OAuth configuration"**
- Ensure `ATLASSIAN_CLIENT_ID` and `ATLASSIAN_CLIENT_SECRET` are set
- Check callback URL matches exactly

#### **"Authentication failed"**
- Check Atlassian app permissions
- Verify callback URL is accessible
- Check network/firewall issues

#### **"Supabase not configured"**
- Authentication will work in fallback mode
- Users won't persist between sessions
- Set up Supabase for full functionality

#### **"JWT_SECRET is required"**
- Generate a secure random string
- Set `JWT_SECRET` in environment variables

---

This authentication system provides a solid foundation for your multi-tenant SaaS platform! 🎉 