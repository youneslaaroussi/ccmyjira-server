import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../auth/supabase.service';

export interface DomainLookupResult {
  organizationId: string;
  userId: string;
  domain: string;
  organization: {
    id: string;
    name: string;
    jiraBaseUrl: string;
    jiraProjectKey: string;
    jiraCloudId?: string;
  };
  user: {
    id: string;
    email: string;
    displayName: string;
  };
}

@Injectable()
export class DomainLookupService {
  private readonly logger = new Logger(DomainLookupService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Extract domain from email address
   */
  private extractDomain(email: string): string {
    const match = email.match(/@([^>]+)/);
    return match ? match[1].toLowerCase() : '';
  }

  /**
   * Find organization and user context for an email domain
   */
  async findOrganizationByEmailDomain(
    fromEmail: string,
  ): Promise<DomainLookupResult | null> {
    if (!this.supabaseService.isAvailable()) {
      this.logger.warn('Supabase not available - cannot perform domain lookup');
      return null;
    }

    const domain = this.extractDomain(fromEmail);
    if (!domain) {
      this.logger.warn(`Invalid email format: ${fromEmail}`);
      return null;
    }

    this.logger.log(`🔍 Looking up organization for domain: ${domain}`);

    try {
      // Look up verified domain configuration
      const { data: domainConfig, error: domainError } = await this.supabaseService.client
        .from('domain_configurations')
        .select(`
          *,
          organization:organizations!inner(
            id,
            name,
            jira_base_url,
            jira_project_key,
            jira_cloud_id,
            owner_id
          )
        `)
        .eq('domain', domain)
        .eq('verification_status', 'verified')
        .single();

      if (domainError || !domainConfig) {
        this.logger.warn(`No verified domain configuration found for: ${domain}`);
        return null;
      }

      const organization = domainConfig.organization;

      // Get organization owner details (primary user for this organization)
      const { data: ownerUser, error: userError } = await this.supabaseService.client
        .from('users')
        .select('id, email, display_name')
        .eq('id', organization.owner_id)
        .single();

      if (userError || !ownerUser) {
        this.logger.error(`Failed to get organization owner for org ${organization.id}:`, userError);
        return null;
      }

      const result: DomainLookupResult = {
        organizationId: organization.id,
        userId: ownerUser.id,
        domain,
        organization: {
          id: organization.id,
          name: organization.name,
          jiraBaseUrl: organization.jira_base_url,
          jiraProjectKey: organization.jira_project_key,
          jiraCloudId: organization.jira_cloud_id,
        },
        user: {
          id: ownerUser.id,
          email: ownerUser.email,
          displayName: ownerUser.display_name || ownerUser.email,
        },
      };

      this.logger.log(
        `✅ Domain lookup successful: ${domain} → Org: ${organization.name} (${organization.id}), User: ${ownerUser.email} (${ownerUser.id})`,
      );

      return result;
    } catch (error) {
      this.logger.error(`Error looking up domain ${domain}:`, error);
      return null;
    }
  }

  /**
   * Check if a domain is configured and verified
   */
  async isDomainVerified(domain: string): Promise<boolean> {
    if (!this.supabaseService.isAvailable()) {
      return false;
    }

    try {
      const { data: domainConfig } = await this.supabaseService.client
        .from('domain_configurations')
        .select('verification_status')
        .eq('domain', domain.toLowerCase())
        .eq('verification_status', 'verified')
        .single();

      return !!domainConfig;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get all verified domains (for debugging/admin purposes)
   */
  async getAllVerifiedDomains(): Promise<
    Array<{
      domain: string;
      organizationName: string;
      verifiedAt: string;
    }>
  > {
    if (!this.supabaseService.isAvailable()) {
      return [];
    }

    try {
      const { data: domains, error } = await this.supabaseService.client
        .from('domain_configurations')
        .select(`
          domain,
          verified_at,
          organization:organizations!inner(name)
        `)
        .eq('verification_status', 'verified')
        .order('verified_at', { ascending: false });

      if (error || !domains) {
        this.logger.error('Failed to get verified domains:', error);
        return [];
      }

      return domains.map((d: any) => ({
        domain: d.domain,
        organizationName: d.organization.name,
        verifiedAt: d.verified_at,
      }));
    } catch (error) {
      this.logger.error('Error getting verified domains:', error);
      return [];
    }
  }
} 