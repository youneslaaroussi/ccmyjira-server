import * as React from 'react';
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Heading,
  Text,
  Button,
  Hr,
  Preview,
  Tailwind,
  Link,
} from '@react-email/components';

interface DomainVerificationEmailProps {
  domain: string;
  verificationCode: string;
  verificationUrl: string;
  email: string;
}

export function DomainVerificationEmail({
  domain,
  verificationCode,
  verificationUrl,
  email,
}: DomainVerificationEmailProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>Verify domain ownership for {domain} - CCMyJIRA</Preview>
      <Tailwind>
        <Body className="bg-gray-50 font-sans">
          <Container className="mx-auto py-8 px-4 max-w-2xl">
            {/* Header */}
            <Section className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 mb-6">
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
                  <span className="text-2xl flex items-center justify-center h-full">🔐</span>
                </div>
                <Heading className="text-2xl font-bold text-gray-900 m-0">
                  Domain Verification Required
                </Heading>
              </div>

              <Text className="text-gray-700 text-base leading-6 mb-4">
                Hello,
              </Text>

              <Text className="text-gray-700 text-base leading-6 mb-6">
                You need to verify ownership of the domain{' '}
                <strong className="text-gray-900">{domain}</strong> to complete your CCMyJIRA setup.
                This ensures that only authorized users can configure email routing for your organization.
              </Text>

              {/* Verification Code Box */}
              <Section className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center mb-6">
                <Text className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-2">
                  Verification Code
                </Text>
                <div className="bg-white border border-gray-300 rounded-md px-4 py-3 text-lg font-mono text-gray-900 inline-block">
                  {verificationCode}
                </div>
              </Section>

              {/* Action Buttons */}
              <Section className="text-center mb-6">
                <Text className="text-gray-700 text-base mb-4">
                  <strong>Option 1:</strong> Click the button below to verify automatically:
                </Text>
                
                <Button
                  href={verificationUrl}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg text-base no-underline inline-block transition-colors"
                >
                  ✅ Verify Domain
                </Button>
              </Section>

              <Hr className="border-gray-200 my-6" />

              <Section>
                <Text className="text-gray-700 text-base mb-4">
                  <strong>Option 2:</strong> Enter the verification code manually in your CCMyJIRA dashboard.
                </Text>
                
                <Text className="text-sm text-gray-600 leading-5">
                  If the button above doesn't work, you can copy and paste this link into your browser:
                </Text>
                <Text className="text-sm text-blue-600 break-all">
                  <Link href={verificationUrl} className="text-blue-600 underline">
                    {verificationUrl}
                  </Link>
                </Text>
              </Section>
            </Section>

            {/* Footer */}
            <Section className="bg-white rounded-lg border border-gray-200 p-6">
              <Text className="text-sm text-gray-600 leading-5 mb-3">
                <strong>⏰ Important:</strong> This verification link expires in 24 hours for security reasons.
              </Text>
              
              <Text className="text-sm text-gray-600 leading-5 mb-3">
                If you didn't request this verification, please ignore this email. Your domain will remain unverified.
              </Text>

              <Hr className="border-gray-200 my-4" />

              <div className="text-center">
                <Text className="text-xs text-gray-500 m-0">
                  CCMyJIRA - Smart JIRA Ticket Assignment
                </Text>
                <Text className="text-xs text-gray-400 m-0">
                  Powered by AI • Secured by Atlassian OAuth
                </Text>
              </div>
            </Section>

            {/* Legal Footer */}
            <Section className="text-center mt-6">
              <Text className="text-xs text-gray-400 leading-4">
                This email was sent to {email} because a domain verification was requested for your organization.
                <br />
                If you have questions, please contact our support team.
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
} 