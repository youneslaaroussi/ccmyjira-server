# Payload Size Configuration for Email Attachments

## Overview

The server has been configured to handle large email payloads, particularly for processing emails with attachments through Postmark webhooks.

## Configuration Details

### Body Parser Limits

- **JSON Payload Limit**: 50MB
- **URL-encoded Payload Limit**: 50MB  
- **Raw Body Limit**: 50MB
- **Parameter Limit**: 50,000 parameters

### Why These Limits?

1. **Base64 Encoding Overhead**: Email attachments are base64 encoded, which increases size by ~33%
2. **Multiple Attachments**: Emails can contain several files (screenshots, logs, documents)
3. **HTML Content**: Rich HTML emails with embedded images can be quite large
4. **Safety Margin**: 50MB provides plenty of headroom for typical business emails

### Implementation

The configuration is applied in `src/main.ts`:

```typescript
import * as bodyParser from 'body-parser';

// Global body parser configuration
const payloadLimit = '50mb';
const bodyParserOptions = {
  limit: payloadLimit,
  parameterLimit: 50000,
};

app.use(bodyParser.json(bodyParserOptions));
app.use(bodyParser.urlencoded({ 
  ...bodyParserOptions, 
  extended: true,
  parameterLimit: 50000,
}));
app.use(bodyParser.raw({ 
  ...bodyParserOptions, 
  type: 'application/octet-stream' 
}));
```

## Error Resolution

### Previous Error
```
PayloadTooLargeError: request entity too large
expected: 450807, length: 450807, limit: 102400
```

### Solution
Increased all body parser limits from ~100KB to 50MB to accommodate:
- Email attachments (images, documents, logs)
- Base64 encoded content
- Rich HTML email content
- Multiple attachments per email

## Performance Considerations

- **Memory Usage**: Larger payloads use more memory during processing
- **Processing Time**: Larger requests take longer to parse and process
- **Network Transfer**: Larger payloads require more bandwidth

## Security Notes

- Limits are applied globally but primarily intended for webhook endpoints
- File type validation is handled at the application level
- Actual attachment size limits are enforced by JIRA (10MB per file)
- Consider implementing rate limiting for webhook endpoints in production

## Monitoring

The server logs payload configuration on startup:
```
📦 Configuring body parser with 50mb limit for email attachments
✅ Body parser configured: JSON limit=50mb, URL-encoded limit=50mb
```

## Testing

To test large payload handling:
1. Send an email with multiple attachments to the Postmark webhook
2. Monitor server logs for successful processing
3. Verify attachments are uploaded to JIRA tickets

## Troubleshooting

If you still encounter payload size errors:

1. **Check actual payload size** in logs
2. **Increase limits** if needed (consider server memory)
3. **Verify middleware order** (body parser must be before route handlers)
4. **Check proxy/load balancer limits** in production environments 