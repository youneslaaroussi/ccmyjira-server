/**
 * Test file demonstrating email attachment and embedded image handling
 * This shows how the system processes Postmark webhook data with attachments
 */

import { EmailProcessingInput } from '../src/ai-agent/ai-agent.service';

// Example Postmark webhook payload with attachments and embedded images
const samplePostmarkData = {
  RecordType: 'Inbound',
  MessageID: 'a8c1040e-db1c-4e18-ac79-bc5f5a992673',
  Date: '2024-01-15T10:30:00Z',
  Subject: 'Bug Report: Login page broken with screenshot',
  From: 'user@example.com',
  FromName: 'John Developer',
  To: 'support@company.com',
  TextBody: 'Hi team,\n\nThe login page is completely broken. When I click the login button, nothing happens. I\'ve attached a screenshot showing the issue.\n\nPlease fix ASAP!\n\nThanks,\nJohn',
  HtmlBody: `
    <html>
      <body>
        <p>Hi team,</p>
        <p>The login page is completely broken. When I click the login button, nothing happens.</p>
        <p>Here's what I see:</p>
        <img src="cid:screenshot001" alt="Login page screenshot" />
        <p>I've also attached the browser console log.</p>
        <p>Please fix ASAP!</p>
        <p>Thanks,<br/>John</p>
      </body>
    </html>
  `,
  Headers: [
    { Name: 'User-Agent', Value: 'Mozilla/5.0...' },
    { Name: 'X-Priority', Value: 'High' }
  ],
  Attachments: [
    {
      Name: 'login-page-screenshot.png',
      Content: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAGA...', // Base64 encoded image
      ContentType: 'image/png',
      ContentID: '<screenshot001>',
      ContentLength: 15432
    },
    {
      Name: 'console-errors.log',
      Content: 'VW5jYXVnaHQgUmVmZXJlbmNlRXJyb3I6IGxvZ2luRnVuY3Rpb24gaXMgbm90IGRlZmluZWQ...', // Base64 encoded log file
      ContentType: 'text/plain',
      ContentLength: 2048
    },
    {
      Name: 'network-trace.har',
      Content: 'eyJ2ZXJzaW9uIjoiMS4yIiwiY3JlYXRvciI6eyJuYW1lIjoiQ2hyb21lIERldlRvb2xzIi...', // Base64 encoded HAR file
      ContentType: 'application/json',
      ContentLength: 8192
    }
  ]
};

// How this gets processed into EmailProcessingInput
const emailInput: EmailProcessingInput = {
  from: samplePostmarkData.From,
  subject: samplePostmarkData.Subject,
  textBody: samplePostmarkData.TextBody,
  htmlBody: samplePostmarkData.HtmlBody,
  receivedAt: samplePostmarkData.Date,
  messageId: samplePostmarkData.MessageID,
  headers: samplePostmarkData.Headers,
  attachments: samplePostmarkData.Attachments,
  userId: 'user123',
  organizationId: 'org456'
};

/**
 * Expected behavior:
 * 
 * 1. AI Agent processes the email and detects:
 *    - Bug report type
 *    - High priority (from subject + content)
 *    - UI/Frontend technology
 *    - Screenshots and logs indicate technical issue
 * 
 * 2. Attachment processing:
 *    - login-page-screenshot.png -> Embedded image (has ContentID)
 *    - console-errors.log -> Regular attachment
 *    - network-trace.har -> Regular attachment
 * 
 * 3. HTML processing:
 *    - <img src="cid:screenshot001" /> gets replaced with [Embedded Image: login-page-screenshot.png]
 * 
 * 4. JIRA ticket creation:
 *    - Creates Bug ticket with processed description
 *    - Uploads all 3 attachments to the JIRA ticket
 *    - AI chooses appropriate assignee based on frontend expertise
 * 
 * 5. Final result:
 *    - JIRA ticket with complete context
 *    - All attachments available in JIRA
 *    - Proper categorization and assignment
 */

export { samplePostmarkData, emailInput }; 