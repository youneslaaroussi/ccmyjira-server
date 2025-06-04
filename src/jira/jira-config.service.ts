import { Injectable, Logger, BadRequestException, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';
import { SupabaseService } from '../auth/supabase.service';
import { DemoService } from '../common/services/demo.service';
import { JiraConfiguration } from './jira.service';

@Injectable()
export class JiraConfigService {
  private readonly logger = new Logger(JiraConfigService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly demoService: DemoService,
    @Inject(REQUEST) private readonly request: Request,
  ) {}

  /**
   * Resolve JIRA configuration for a user and organization (with demo mode support)
   */
  async getJiraConfig(userId: string, organizationId: string): Promise<JiraConfiguration> {
    // Log the state of req.isDemo as seen by JiraConfigService
    this.logger.log(`[JiraConfigService] getJiraConfig called for user: ${userId}, org: ${organizationId}. req.isDemo = ${this.request.isDemo}`);

    // Check if this is a demo request
    if (this.request.isDemo) {
      this.logger.log('[JiraConfigService] 🎭 Demo mode detected by req.isDemo - returning demo JIRA configuration');
      
      if (!this.demoService.isDemoConfigured()) {
        throw new BadRequestException('Demo mode is not properly configured');
      }
      
      const demoConfig = this.demoService.getDemoJiraConfig();
      this.logger.log(`🎯 Demo JIRA config:`);
      this.logger.log(`   Base URL: ${demoConfig.baseUrl}`);
      this.logger.log(`   Project Key: ${demoConfig.projectKey}`);
      this.logger.log(`   Cloud ID: ${demoConfig.cloudId}`);
      this.logger.log(`   User Account ID: ${demoConfig.userAccountId}`);
      
      const resultConfig = {
        ...demoConfig,
        isDemo: true, // Explicitly set isDemo for demo configurations
      };
      this.logger.log(`[JiraConfigService] Returning Demo JiraConfiguration: isDemo=${resultConfig.isDemo}, token=${resultConfig.accessToken.substring(0,10)}...`);
      return resultConfig;
    }

    // Regular user authentication flow
    this.logger.log('[JiraConfigService] Non-demo path detected. Proceeding with regular user JIRA configuration.');
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

      const resultConfig = {
        baseUrl: organization.jira_base_url,
        projectKey: organization.jira_project_key,
        cloudId: organization.jira_cloud_id,
        accessToken: user.atlassian_access_token,
        userAccountId: user.atlassian_account_id || user.id,
        isDemo: false, // Explicitly set isDemo to false for regular configurations
      };
      this.logger.log(`[JiraConfigService] Returning Regular JiraConfiguration: isDemo=${resultConfig.isDemo}, token=${resultConfig.accessToken.substring(0,10)}...`);
      return resultConfig;
    } catch (error) {
      this.logger.error('Failed to resolve JIRA configuration:', error);
      throw error;
    }
  }

  /**
   * Get user's default organization (first one they belong to)
   */
  async getUserDefaultOrganization(userId: string): Promise<string | null> {
    // In demo mode, return demo organization ID
    if (this.request.isDemo) {
      return this.demoService.getDemoUser().organizationId;
    }

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
    // In demo mode, always allow access to demo organization
    if (this.request.isDemo) {
      const demoOrgId = this.demoService.getDemoUser().organizationId;
      return organizationId === demoOrgId;
    }

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