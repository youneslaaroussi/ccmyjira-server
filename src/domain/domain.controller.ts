import { Controller, Get, Param, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { DomainLookupService } from './domain-lookup.service';

@ApiTags('domain-lookup')
@Controller('domain')
export class DomainController {
  private readonly logger = new Logger(DomainController.name);

  constructor(private readonly domainLookupService: DomainLookupService) {}

  @Get('lookup/:email')
  @ApiOperation({ 
    summary: 'Lookup organization by email domain (Debug endpoint)',
    description: 'Test endpoint to verify domain-to-organization mapping is working correctly'
  })
  @ApiParam({ name: 'email', description: 'Email address to lookup', example: 'user@example.com' })
  @ApiResponse({ 
    status: 200, 
    description: 'Domain lookup result',
    schema: {
      type: 'object',
      properties: {
        found: { type: 'boolean' },
        email: { type: 'string' },
        domain: { type: 'string' },
        result: {
          type: 'object',
          properties: {
            organizationId: { type: 'string' },
            userId: { type: 'string' },
            domain: { type: 'string' },
            organization: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                jiraBaseUrl: { type: 'string' },
                jiraProjectKey: { type: 'string' }
              }
            },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                displayName: { type: 'string' }
              }
            }
          }
        }
      }
    }
  })
  async lookupByEmail(@Param('email') email: string) {
    this.logger.log(`🔍 Domain lookup test for email: ${email}`);
    
    const result = await this.domainLookupService.findOrganizationByEmailDomain(email);
    
    return {
      found: !!result,
      email,
      domain: this.extractDomain(email),
      result,
    };
  }

  @Get('verified')
  @ApiOperation({ 
    summary: 'List all verified domains (Debug endpoint)',
    description: 'Show all currently verified domains in the system'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'List of verified domains',
    schema: {
      type: 'object',
      properties: {
        count: { type: 'number' },
        domains: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              domain: { type: 'string' },
              organizationName: { type: 'string' },
              verifiedAt: { type: 'string' }
            }
          }
        }
      }
    }
  })
  async getVerifiedDomains() {
    this.logger.log('📋 Fetching all verified domains');
    
    const domains = await this.domainLookupService.getAllVerifiedDomains();
    
    return {
      count: domains.length,
      domains,
    };
  }

  @Get('check/:domain')
  @ApiOperation({ 
    summary: 'Check if domain is verified (Debug endpoint)',
    description: 'Simple check to see if a domain is verified'
  })
  @ApiParam({ name: 'domain', description: 'Domain to check', example: 'example.com' })
  @ApiResponse({ 
    status: 200, 
    description: 'Domain verification status',
    schema: {
      type: 'object',
      properties: {
        domain: { type: 'string' },
        isVerified: { type: 'boolean' }
      }
    }
  })
  async checkDomain(@Param('domain') domain: string) {
    this.logger.log(`✅ Checking verification status for domain: ${domain}`);
    
    const isVerified = await this.domainLookupService.isDomainVerified(domain);
    
    return {
      domain,
      isVerified,
    };
  }

  private extractDomain(email: string): string {
    const match = email.match(/@([^>]+)/);
    return match ? match[1].toLowerCase() : '';
  }
} 