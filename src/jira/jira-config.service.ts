import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../auth/supabase.service';
import { JiraConfiguration } from './jira.service';

@Injectable()
export class JiraConfigService {
  private readonly logger = new Logger(JiraConfigService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Resolve JIRA configuration for a user and organization
   */
  async getJiraConfig(userId: string, organizationId: string): Promise<JiraConfiguration> {
    if (!this.supabaseService.isAvailable()) {
      throw new BadRequestException('Supabase not configured - cannot resolve JIRA configuration');
    }

    try {
      // Get user data for Atlassian token
      let user = await this.supabaseService.getUserById(userId);
      if (!user) {
        throw new BadRequestException('User not found');
      }

      if (!user.atlassian_access_token) {
        throw new BadRequestException('User has no Atlassian access token');
      }

      // Debug: Log current token info
      this.logger.log(`🔍 Checking token for user ${user.email}:`);
      this.logger.log(`   Token exists: ${!!user.atlassian_access_token}`);
      this.logger.log(`   Token preview: ${user.atlassian_access_token?.substring(0, 20)}...`);
      this.logger.log(`   Expires at: ${user.atlassian_token_expires_at}`);
      this.logger.log(`   Current time: ${new Date().toISOString()}`);
      this.logger.log(`   Has refresh token: ${!!user.atlassian_refresh_token}`);

      // Check if token is expired and refresh if needed
      if (user.atlassian_token_expires_at && new Date() > new Date(user.atlassian_token_expires_at)) {
        this.logger.log(`🔄 Access token expired for user ${user.email}, attempting refresh...`);
        
        try {
          const refreshedUser = await this.supabaseService.refreshAtlassianToken(userId);
          if (refreshedUser) {
            user = refreshedUser;
            this.logger.log(`✅ Token refreshed successfully for user ${user.email}`);
            this.logger.log(`   New token preview: ${user.atlassian_access_token?.substring(0, 20)}...`);
            this.logger.log(`   New expires at: ${user.atlassian_token_expires_at}`);
          } else {
            throw new BadRequestException('Failed to refresh Atlassian access token');
          }
        } catch (refreshError) {
          this.logger.error('Failed to refresh token:', refreshError.message);
          throw new BadRequestException('Atlassian access token expired and refresh failed - please re-authenticate');
        }
      } else {
        this.logger.log(`✅ Token appears valid, proceeding with JIRA config`);
      }

      // Get organization data
      const { data: organization, error } = await this.supabaseService.client
        .from('organizations')
        .select('*')
        .eq('id', organizationId)
        .single();

      if (error || !organization) {
        throw new BadRequestException('Organization not found');
      }

      if (!organization.jira_base_url || !organization.jira_project_key) {
        throw new BadRequestException('Organization JIRA configuration is incomplete');
      }

      // Verify user has access to this organization
      const { data: membership } = await this.supabaseService.client
        .from('organization_members')
        .select('role')
        .eq('organization_id', organizationId)
        .eq('user_id', userId)
        .single();

      if (!membership) {
        throw new BadRequestException('User does not have access to this organization');
      }

      // Final check to ensure we have a valid access token
      if (!user.atlassian_access_token) {
        throw new BadRequestException('No valid Atlassian access token available');
      }

      this.logger.log(`🎯 Final JIRA config for ${user.email}:`);
      this.logger.log(`   Base URL: ${organization.jira_base_url}`);
      this.logger.log(`   Project Key: ${organization.jira_project_key}`);
      this.logger.log(`   Using token: ${user.atlassian_access_token.substring(0, 20)}...`);

      return {
        baseUrl: organization.jira_base_url,
        projectKey: organization.jira_project_key,
        cloudId: organization.jira_cloud_id,
        accessToken: user.atlassian_access_token,
        userAccountId: user.atlassian_account_id || user.id,
      };
    } catch (error) {
      this.logger.error('Failed to resolve JIRA configuration:', error);
      throw error;
    }
  }

  /**
   * Get user's default organization (first one they belong to)
   */
  async getUserDefaultOrganization(userId: string): Promise<string | null> {
    if (!this.supabaseService.isAvailable()) {
      return null;
    }

    try {
      const { data: membership } = await this.supabaseService.client
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', userId)
        .order('joined_at', { ascending: true })
        .limit(1)
        .single();

      return membership?.organization_id || null;
    } catch (error) {
      this.logger.warn('Failed to get user default organization:', error.message);
      return null;
    }
  }

  /**
   * Validate if user has access to organization
   */
  async validateUserOrganizationAccess(userId: string, organizationId: string): Promise<boolean> {
    if (!this.supabaseService.isAvailable()) {
      return false;
    }

    try {
      const { data: membership } = await this.supabaseService.client
        .from('organization_members')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('user_id', userId)
        .single();

      return !!membership;
    } catch (error) {
      return false;
    }
  }
} 