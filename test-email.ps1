# Test email sending script
$body = @{
    RecordType = "Inbound"
    MessageID = "test-12345"
    Date = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
    From = "test@bootsa.ai"
    Subject = "Bug: Modal component broken"
    TextBody = "The modal component is completely broken and won't open when users click it. This is affecting all users on the production site. Can younes please fix this urgent issue ASAP? Users are complaining and we need this resolved immediately."
    HtmlBody = "<p>The modal component is completely broken and won't open when users click it. This is affecting all users on the production site.</p><p>Can <strong>younes</strong> please fix this urgent issue ASAP? Users are complaining and we need this resolved immediately.</p>"
    ToFull = @(
        @{
            Email = "support@bootsa.ai"
            Name = "Support Team"
            MailboxHash = "hash123"
        }
    )
    Attachments = @()
} | ConvertTo-Json -Depth 10

try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/webhooks/postmark" -Method POST -ContentType "application/json" -Body $body
    Write-Host "Email sent successfully!" -ForegroundColor Green
    Write-Host $response
} catch {
    Write-Host "Error sending email: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host $_.Exception.Response
} 