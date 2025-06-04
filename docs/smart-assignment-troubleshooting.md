# Smart Assignment Troubleshooting Guide

## 🚨 Common Setup Issues

### **Issue 1: "Can't Find People in Project Settings"**

The location varies by JIRA version and permissions:

#### **JIRA Cloud - Multiple Locations to Try:**

1. **Project Settings → People**
   ```
   Your Project → Project Settings (⚙️) → People
   ```

2. **Project Settings → Permissions → Project roles**
   ```
   Your Project → Project Settings (⚙️) → Permissions → Project roles
   ```

3. **Direct URL (replace YOUR-PROJECT-KEY):**
   ```
   https://your-domain.atlassian.net/plugins/servlet/project-config/YOUR-PROJECT-KEY/roles
   ```

4. **Project Details → Roles**
   ```
   Your Project → Project Settings (⚙️) → Details → Project roles
   ```

#### **JIRA Server/Data Center:**
```
Administration (⚙️) → Projects → Project roles
```

#### **If Still Not Found - Permission Check:**
You need **Project Administrator** role. Ask your JIRA admin to either:
- Grant you Project Admin permissions, OR
- Set up these roles for you:
  ```
  ✅ Developers
  ✅ Senior Developers  
  ✅ Product Owners
  ✅ DevOps
  ✅ Support
  ```

### **Issue 2: Testing Role Access Without UI**

Even without UI access, you can test if smart assignment will work:

#### **Method 1: API Test via Dashboard**
```http
GET /api/dashboard/users?organizationId=YOUR_ORG_ID
```

**Expected Response (if working):**
```json
[
  {
    "accountId": "user123",
    "displayName": "John Doe",
    "emailAddress": "john.doe@company.com",
    "roles": ["Developers", "Users"]
  }
]
```

**Error Response (if broken):**
```json
{
  "error": "Failed to fetch project users: Forbidden"
}
```

#### **Method 2: Check System Config**
```http
GET /api/dashboard/config
```

Should show:
```json
{
  "features": {
    "smartAssignmentEnabled": true
  }
}
```

#### **Method 3: Test Assignment API**
```http
GET /api/dashboard/suggest-assignee?type=Bug&priority=High
```

### **Issue 3: Default JIRA Roles**

If you can't create custom roles, JIRA has default roles that work:

#### **Use These Default Role Names:**
- `Administrators` → DevOps team
- `Developers` → Development team  
- `Users` → General team members

#### **Smart Assignment Will Match:**
- "Administrator" → Infrastructure/DevOps tasks
- "Developer" → Bug fixes and features
- "User" → General tasks and support

### **Issue 4: Permission Errors in Logs**

#### **Check Server Logs for These Errors:**

**Error 1: Insufficient Permissions**
```
Error fetching project users: Forbidden (403)
```
**Solution:** JIRA admin needs to grant "Browse projects" + "Manage project" permissions

**Error 2: Invalid Project Key**
```
Error fetching project users: Not Found (404)
```
**Solution:** Verify project key in organization settings

**Error 3: Authentication Issues**
```
Error fetching project users: Unauthorized (401)
```
**Solution:** Check JIRA API token and URL in organization settings

### **Issue 5: Workload Calculation Errors**

#### **Story Points Field Missing:**
```
Warning: Story points field not found, using ticket count only
```
**Solution:** Either configure story points field or ignore (ticket count still works)

#### **Custom Field Access Denied:**
```
Error reading custom fields: Field not accessible
```
**Solution:** JIRA admin needs to grant custom field read permissions

### **Issue 6: No Users Found**

#### **Empty User List Response:**
```json
{
  "users": [],
  "count": 0
}
```

**Possible Causes:**
1. **No Active Users:** All project members are inactive
2. **Role Filter Too Restrictive:** Try without role filter
3. **Project Permissions:** Users don't have project access
4. **API Token Scope:** Token doesn't have user read permissions

**Debug Steps:**
1. Test without role filter: `GET /api/dashboard/users?activeOnly=false`
2. Check project member count in JIRA UI
3. Verify API token has user management scope

### **Issue 7: Smart Assignment Not Working**

#### **Tickets Created But Not Assigned:**

**Check These in Order:**

1. **Feature Enabled?**
   ```bash
   grep ENABLE_SMART_ASSIGNMENT .env
   # Should show: ENABLE_SMART_ASSIGNMENT=true
   ```

2. **Users Found?**
   ```http
   GET /api/dashboard/users
   # Should return array with users
   ```

3. **Scoring Too Low?**
   Look for this in logs:
   ```
   🎯 Top assignee suggestion: Jane Smith (score: 15)
   # Score < 20 = not assigned automatically
   ```

4. **AI Agent Workflow Check:**
   Look for these log entries:
   ```
   👥 Retrieved 8 team members
   📊 Analyzed workload for 8 users  
   🎯 Top assignee suggestion: Jane Smith (score: 65)
   ```

### **Issue 8: Testing Smart Assignment End-to-End**

#### **Step 1: Enable Feature**
```bash
# Add to .env
ENABLE_SMART_ASSIGNMENT=true

# Restart server
npm run start:dev
```

#### **Step 2: Verify Configuration**
```http
GET /api/dashboard/config
# Check: smartAssignmentEnabled: true
```

#### **Step 3: Test User Discovery**
```http
GET /api/dashboard/users
# Should return team members with roles
```

#### **Step 4: Test Workload Calculation**
```http
GET /api/dashboard/workloads  
# Should return workload data
```

#### **Step 5: Test Assignment Suggestion**
```http
GET /api/dashboard/suggest-assignee?type=Bug&priority=High
# Should return suggestions with scores
```

#### **Step 6: Send Test Email**
Send an email to your webhook with:
```
Subject: Test React bug - urgent fix needed
Body: The React component is crashing in production. @john.doe please look at this.
```

**Expected Result:**
- Ticket created in JIRA
- Assigned to appropriate developer
- AI trace shows assignment reasoning

### **Issue 9: Minimal Working Setup**

If you can't configure custom roles, here's the minimal setup that works:

#### **Minimal JIRA Project Requirements:**
1. **At least 2 active project members**
2. **Default "Users" role assigned to team**
3. **Project permissions allow API access**

#### **Minimal Environment:**
```bash
ENABLE_SMART_ASSIGNMENT=true
# That's it! Smart assignment will work with basic user list
```

#### **How It Works With Minimal Setup:**
- AI gets all project users
- Assigns based on workload only (no role matching)
- Still considers email mentions and technology keywords
- Falls back to ticket count instead of story points

### **Quick Fixes Summary**

| Problem | Quick Fix |
|---------|-----------|
| Can't find role UI | Try direct URL or ask admin |
| No permissions | Request Project Admin role |
| Empty user list | Check project membership |
| Assignment not working | Verify feature flag + restart |
| Low assignment scores | Check role names contain keywords |
| API errors | Verify JIRA token permissions |

---

**🚀 Success Indicators:**
- ✅ `GET /api/dashboard/users` returns team members
- ✅ `GET /api/dashboard/config` shows `smartAssignmentEnabled: true`  
- ✅ AI trace logs show assignee suggestions with scores
- ✅ New tickets automatically assigned to team members 