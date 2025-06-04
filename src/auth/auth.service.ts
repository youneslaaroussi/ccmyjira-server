import { Injectable, Logger, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { SupabaseService, User } from './supabase.service';
import { JwtPayload } from './jwt.strategy';
import { EmailService } from '../emails/email.service';
import * as crypto from 'crypto';

export interface LoginResponse {
  user: {
    id: string;
    email: string;
    displayName: string;
    avatarUrl?: string;
  };
  access_token: string;
  organizations: any[];
  accessibleResources: any[];
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private supabaseService: SupabaseService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private emailService: EmailService,
  ) {}

  /**
   * Handle successful OAuth login
   */
  async handleOAuthLogin(oauthData: any): Promise<LoginResponse> {
    const { atlassianUser, tokens, accessibleResources } = oauthData;
    
    this.logger.log(`🔐 Processing OAuth login for: ${atlassianUser.email}`);

    try {
      // Create or update user in database
      let user: User;
      if (this.supabaseService.isAvailable()) {
        user = await this.supabaseService.upsertUser(atlassianUser, tokens);
      } else {
        // Fallback for when Supabase is not configured
        user = {
          id: atlassianUser.account_id,
          email: atlassianUser.email,
          display_name: atlassianUser.name,
          avatar_url: atlassianUser.picture,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          atlassian_account_id: atlassianUser.account_id,
        };
        this.logger.warn('⚠️  Using fallback user data (Supabase not configured)');
      }

      // Get user's organizations
      const organizations = await this.supabaseService.getUserOrganizations(user.id);

      // If user has organizations, update their JIRA cloud ID from accessible resources
      if (organizations && organizations.length > 0 && accessibleResources?.length > 0) {
        const primaryResource = accessibleResources[0];
        
        for (const org of organizations) {
          if (org.jira_base_url && !org.jira_cloud_id) {
            // Check if this org's JIRA URL matches any accessible resource
            const matchingResource = accessibleResources.find(resource => 
              org.jira_base_url === resource.url
            );
            
            if (matchingResource) {
              this.logger.log(`🔗 Updating cloud ID for organization ${org.name}: ${matchingResource.id}`);
              
              // Update organization with cloud ID
              await this.supabaseService.client
                .from('organizations')
                .update({ jira_cloud_id: matchingResource.id })
                .eq('id', org.id);
            }
          }
        }
      }

      // Generate JWT token
      const payload: JwtPayload = {
        sub: user.id,
        email: user.email,
        iat: Math.floor(Date.now() / 1000),
      };

      const access_token = this.jwtService.sign(payload);

      this.logger.log(`✅ Login successful for: ${user.email}`);

      return {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.display_name || user.email,
          avatarUrl: user.avatar_url,
        },
        access_token,
        organizations,
        accessibleResources,
      };
    } catch (error) {
      this.logger.error('❌ OAuth login failed:', error);
      throw new Error('Authentication failed');
    }
  }

  /**
   * Validate and refresh user session
   */
  async validateUser(userId: string, isDemo: boolean = false) {
    this.logger.log(`🔍 Validating user session: ${userId} (demo: ${isDemo})`);

    // Return demo user profile if in demo mode
    if (isDemo) {
      return this.getDemoUserProfile();
    }

    const user = await this.supabaseService.getUserById(userId);
    if (!user) {
      this.logger.warn(`❌ User not found: ${userId}`);
      return null;
    }

    const organizations = await this.supabaseService.getUserOrganizations(user.id);

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name || user.email,
        avatarUrl: user.avatar_url,
      },
      organizations,
    };
  }

  /**
   * Get demo user profile
   */
  private getDemoUserProfile() {
    const demoUser = {
      id: this.configService.get('DEMO_USER_ID') || 'demo-user-12345',
      email: this.configService.get('DEMO_USER_EMAIL') || 'demo@ccmyjira.com',
      displayName: this.configService.get('DEMO_USER_NAME') || 'Demo User',
      avatarUrl: null,
    };

    const demoOrganization = {
      id: this.configService.get('DEMO_ORGANIZATION_ID') || 'demo-org-12345',
      name: 'Demo Organization',
      jira_base_url: this.configService.get('DEMO_JIRA_BASE_URL') || 'https://demo-ccmyjira.atlassian.net',
      jira_project_key: this.configService.get('DEMO_JIRA_PROJECT_KEY') || 'DEMO',
      jira_cloud_id: this.configService.get('DEMO_JIRA_CLOUD_ID'),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    return {
      user: demoUser,
      organizations: [demoOrganization],
    };
  }

  /**
   * Generate new JWT token for user
   */
  generateToken(user: User): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      iat: Math.floor(Date.now() / 1000),
    };

    return this.jwtService.sign(payload);
  }

  /**
   * Get authentication status and configuration
   */
  getAuthConfig() {
    const isAtlassianConfigured = !!(
      this.configService.get('ATLASSIAN_CLIENT_ID') &&
      this.configService.get('ATLASSIAN_CLIENT_SECRET')
    );

    const isSupabaseConfigured = this.supabaseService.isAvailable();

    return {
      atlassian: {
        configured: isAtlassianConfigured,
        clientId: this.configService.get('ATLASSIAN_CLIENT_ID'),
        authUrl: isAtlassianConfigured ? '/auth/atlassian' : null,
      },
      supabase: {
        configured: isSupabaseConfigured,
      },
      jwt: {
        configured: !!this.configService.get('JWT_SECRET'),
      },
    };
  }

  /**
   * Test authentication system health
   */
  async testAuthSystem() {
    const config = this.getAuthConfig();
    const supabaseTest = await this.supabaseService.testConnection();

    return {
      status: 'ok',
      config,
      supabase: {
        connected: supabaseTest,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Initiate domain verification process
   */
  async initiateDomainVerification(userId: string, domain: string, organizationId: string, email: string) {
    // Validate domain format
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
    if (!domainRegex.test(domain)) {
      throw new BadRequestException('Invalid domain format');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new BadRequestException('Invalid email format');
    }

    // Verify email belongs to the domain being verified
    const emailDomain = email.split('@')[1].toLowerCase();
    if (emailDomain !== domain.toLowerCase()) {
      throw new BadRequestException('Verification email must belong to the domain being verified');
    }

    // Generate verification code
    const verificationCode = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Store verification request in database
    const { data, error } = await this.supabaseService.client
      .from('domain_configurations')
      .upsert({
        organization_id: organizationId,
        domain: domain.toLowerCase(),
        verification_token: verificationCode,
        verification_status: 'pending',
        verification_email: email.toLowerCase(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'organization_id,domain'
      })
      .select()
      .single();

    if (error) {
      throw new BadRequestException(`Failed to initiate domain verification: ${error.message}`);
    }

    // Send verification email
    await this.sendDomainVerificationEmail(domain, verificationCode, email);

    return {
      message: 'Domain verification email sent',
      domain,
      email,
      expiresAt: expiresAt.toISOString()
    };
  }

  /**
   * Send domain verification email via Postmark
   */
  private async sendDomainVerificationEmail(domain: string, verificationCode: string, email: string) {
    const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3001'}/auth/verify-domain/callback?code=${verificationCode}&domain=${domain}`;

    try {
      await this.emailService.sendDomainVerificationEmail(domain, verificationCode, verificationUrl, email);
      this.logger.log(`📧 Domain verification email sent to ${email}`);
    } catch (error) {
      this.logger.error('Failed to send verification email:', error.message);
      throw new BadRequestException('Failed to send verification email');
    }
  }

  /**
   * Verify domain with verification code
   */
  async verifyDomain(domain: string, verificationCode: string, userId: string) {
    // Find pending verification
    const { data: domainConfig, error } = await this.supabaseService.client
      .from('domain_configurations')
      .select('*')
      .eq('domain', domain.toLowerCase())
      .eq('verification_token', verificationCode)
      .single();

    if (error || !domainConfig) {
      throw new BadRequestException('Invalid verification code or domain');
    }

    // Check if code is expired (24 hours from creation)
    const createdAt = new Date(domainConfig.created_at);
    const expiresAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);
    if (new Date() > expiresAt) {
      throw new BadRequestException('Verification code has expired');
    }

    // Mark domain as verified
    const { data: updatedConfig, error: updateError } = await this.supabaseService.client
      .from('domain_configurations')
      .update({
        verification_status: 'verified',
        verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', domainConfig.id)
      .select()
      .single();

    if (updateError) {
      throw new BadRequestException(`Failed to verify domain: ${updateError.message}`);
    }

    // Log verification event
    await this.supabaseService.client
      .from('email_processing_logs')
      .insert({
        organization_id: domainConfig.organization_id,
        event_type: 'domain_verified',
        email_data: { domain, verified_by: userId },
        created_at: new Date().toISOString()
      });

    return {
      message: 'Domain verified successfully',
      domain,
      verifiedAt: updatedConfig.verified_at,
      organizationId: domainConfig.organization_id
    };
  }

  /**
   * Get domain verification status
   */
  async getDomainStatus(organizationId: string, domain?: string) {
    let query = this.supabaseService.client
      .from('domain_configurations')
      .select('*')
      .eq('organization_id', organizationId);

    if (domain) {
      query = query.eq('domain', domain.toLowerCase());
    }

    const { data: domains, error } = await query;

    if (error) {
      throw new BadRequestException(`Failed to get domain status: ${error.message}`);
    }

    return domains.map(domain => ({
      domain: domain.domain,
      isVerified: domain.verification_status === 'verified',
      verifiedAt: domain.verified_at,
      verificationStatus: domain.verification_status,
      verificationEmail: domain.verification_email,
      jiraBaseUrl: domain.jira_base_url,
      jiraProjectKey: domain.jira_project_key,
      createdAt: domain.created_at
    }));
  }

  /**
   * Verify domain by code (for email callback - no auth required)
   */
  async verifyDomainByCode(domain: string, verificationCode: string) {
    // Find pending verification
    const { data: domainConfig, error } = await this.supabaseService.client
      .from('domain_configurations')
      .select('*')
      .eq('domain', domain.toLowerCase())
      .eq('verification_token', verificationCode)
      .single();

    if (error || !domainConfig) {
      throw new BadRequestException('Invalid verification code or domain');
    }

    // Check if code is expired (24 hours from creation)
    const createdAt = new Date(domainConfig.created_at);
    const expiresAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);
    if (new Date() > expiresAt) {
      throw new BadRequestException('Verification code has expired');
    }

    // Mark domain as verified
    const { data: updatedConfig, error: updateError } = await this.supabaseService.client
      .from('domain_configurations')
      .update({
        verification_status: 'verified',
        verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', domainConfig.id)
      .select()
      .single();

    if (updateError) {
      throw new BadRequestException(`Failed to verify domain: ${updateError.message}`);
    }

    // Log verification event
    await this.supabaseService.client
      .from('email_processing_logs')
      .insert({
        organization_id: domainConfig.organization_id,
        event_type: 'domain_verified_email',
        email_data: { domain, verified_via: 'email_callback' },
        created_at: new Date().toISOString()
      });

    return {
      message: 'Domain verified successfully via email',
      domain,
      verifiedAt: updatedConfig.verified_at,
      organizationId: domainConfig.organization_id
    };
  }

  /**
   * Get authentication system health status
   */
  async getAuthHealth() {
    try {
      const config = this.getAuthConfig();
      const supabaseStatus = await this.supabaseService.testConnection();
      
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        components: {
          atlassian: config.atlassian.configured,
          supabase: config.supabase.configured && supabaseStatus,
          jwt: config.jwt.configured
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }

  /**
   * Debug Atlassian token and access
   */
  async debugAtlassianAccess(userId: string) {
    try {
      const user = await this.supabaseService.getUserById(userId);
      if (!user || !user.atlassian_access_token) {
        return { error: 'No Atlassian token found' };
      }

      const axios = require('axios');
      const token = user.atlassian_access_token;

      this.logger.log(`🔍 Testing Atlassian token for user: ${user.email}`);

      // Test 1: Basic profile access
      let profileTest = { success: false, error: null, data: null };
      try {
        const profileResponse = await axios.get('https://api.atlassian.com/me', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        profileTest = { success: true, error: null, data: profileResponse.data };
      } catch (error) {
        profileTest = { success: false, error: error.message, data: null };
      }

      // Test 2: Accessible resources
      let resourcesTest = { success: false, error: null, data: null };
      try {
        const resourcesResponse = await axios.get('https://api.atlassian.com/oauth/token/accessible-resources', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        resourcesTest = { success: true, error: null, data: resourcesResponse.data };
      } catch (error) {
        resourcesTest = { success: false, error: error.message, data: null };
      }

      // Test 3: Direct JIRA API test for the specific site
      let jiraTest = { success: false, error: null, data: null };
      try {
        const jiraResponse = await axios.get('https://deepshotinc.atlassian.net/rest/api/3/myself', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        jiraTest = { success: true, error: null, data: jiraResponse.data };
      } catch (error) {
        jiraTest = { success: false, error: error.message, data: error.response?.data || null };
      }

      // Test 4: Project access
      let projectTest = { success: false, error: null, data: null };
      try {
        const projectResponse = await axios.get('https://deepshotinc.atlassian.net/rest/api/3/project/BTS', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        projectTest = { success: true, error: null, data: projectResponse.data };
      } catch (error) {
        projectTest = { success: false, error: error.message, data: error.response?.data || null };
      }

      return {
        userId,
        userEmail: user.email,
        tokenInfo: {
          hasToken: !!user.atlassian_access_token,
          hasRefreshToken: !!user.atlassian_refresh_token,
          expiresAt: user.atlassian_token_expires_at,
          tokenPreview: token.substring(0, 20) + '...',
        },
        tests: {
          atlassianProfile: profileTest,
          accessibleResources: resourcesTest,
          jiraDirectAccess: jiraTest,
          projectAccess: projectTest,
        }
      };

    } catch (error) {
      this.logger.error('Failed to debug Atlassian access:', error);
      return { error: error.message };
    }
  }

  /**
   * Create a new organization
   */
  async createOrganization(userId: string, orgData: {
    name: string;
    jiraBaseUrl?: string;
    jiraProjectKey?: string;
  }) {
    this.logger.log(`🏢 Creating organization: ${orgData.name} for user: ${userId}`);

    try {
      // Check if user exists
      const user = await this.supabaseService.getUserById(userId);
      if (!user) {
        throw new BadRequestException('User not found');
      }

      // Create organization
      const { data: organization, error: orgError } = await this.supabaseService.client
        .from('organizations')
        .insert({
          name: orgData.name,
          slug: orgData.name.toLowerCase().replace(/[^a-z0-9]/g, '-'), // Generate slug from name
          owner_id: userId,
          jira_base_url: orgData.jiraBaseUrl || null,
          jira_project_key: orgData.jiraProjectKey || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (orgError) {
        this.logger.error('Failed to create organization:', orgError);
        throw new BadRequestException('Failed to create organization');
      }

      // Add user as organization member (owner)
      const { error: memberError } = await this.supabaseService.client
        .from('organization_members')
        .insert({
          organization_id: organization.id,
          user_id: userId,
          role: 'owner',
          joined_at: new Date().toISOString()
        });

      if (memberError) {
        this.logger.error('Failed to add organization member:', memberError);
        throw new BadRequestException('Failed to add organization member');
      }

      this.logger.log(`✅ Organization created successfully: ${organization.id}`);

      return {
        ...organization,
        role: 'owner'
      };
    } catch (error) {
      this.logger.error('❌ Failed to create organization:', error);
      throw error;
    }
  }

  /**
   * Get user's organizations
   */
  async getUserOrganizations(userId: string, isDemo: boolean = false) {
    if (isDemo) {
      return this.getDemoUserProfile().organizations;
    }

    if (!this.supabaseService.isAvailable()) {
      return [];
    }

    return await this.supabaseService.getUserOrganizations(userId);
  }

  /**
   * Update organization (including JIRA configuration)
   */
  async updateOrganization(userId: string, organizationId: string, updates: {
    name?: string;
    jiraBaseUrl?: string;
    jiraProjectKey?: string;
  }) {
    this.logger.log(`🔄 Updating organization: ${organizationId} by user: ${userId}`);

    try {
      // Check if user has permission to update this organization
      const { data: membership } = await this.supabaseService.client
        .from('organization_members')
        .select('role')
        .eq('organization_id', organizationId)
        .eq('user_id', userId)
        .single();

      if (!membership || !['owner', 'admin'].includes(membership.role)) {
        throw new BadRequestException('Insufficient permissions to update organization');
      }

      // Update organization
      const updateData: any = {
        updated_at: new Date().toISOString()
      };

      if (updates.name) updateData.name = updates.name;
      if (updates.jiraBaseUrl !== undefined) updateData.jira_base_url = updates.jiraBaseUrl;
      if (updates.jiraProjectKey !== undefined) updateData.jira_project_key = updates.jiraProjectKey;

      const { data: organization, error } = await this.supabaseService.client
        .from('organizations')
        .update(updateData)
        .eq('id', organizationId)
        .select()
        .single();

      if (error) {
        this.logger.error('Failed to update organization:', error);
        throw new BadRequestException('Failed to update organization');
      }

      this.logger.log(`✅ Organization updated successfully: ${organizationId}`);

      return organization;
    } catch (error) {
      this.logger.error('❌ Failed to update organization:', error);
      throw error;
    }
  }

  /**
   * Check if organization has a verified domain and get the primary one
   */
  async getOrganizationVerifiedDomain(organizationId: string): Promise<{
    hasVerifiedDomain: boolean;
    primaryDomain?: string;
    verifiedAt?: string;
  }> {
    try {
      const { data: domains, error } = await this.supabaseService.client
        .from('domain_configurations')
        .select('domain, verification_status, verified_at')
        .eq('organization_id', organizationId)
        .eq('verification_status', 'verified')
        .order('verified_at', { ascending: true }) // Get the first verified domain
        .limit(1);

      if (error) {
        this.logger.error('Failed to get verified domain:', error);
        return { hasVerifiedDomain: false };
      }

      if (!domains || domains.length === 0) {
        return { hasVerifiedDomain: false };
      }

      const primaryDomain = domains[0];
      return {
        hasVerifiedDomain: true,
        primaryDomain: primaryDomain.domain,
        verifiedAt: primaryDomain.verified_at
      };
    } catch (error) {
      this.logger.error('❌ Failed to check organization verified domain:', error);
      return { hasVerifiedDomain: false };
    }
  }

  /**
   * Update organization cloud ID from current token accessible resources
   */
  async updateOrganizationCloudId(userId: string, organizationId: string) {
    try {
      const user = await this.supabaseService.getUserById(userId);
      if (!user || !user.atlassian_access_token) {
        return { error: 'No Atlassian token found' };
      }

      // Verify user has access to this organization
      const hasAccess = await this.supabaseService.client
        .from('organization_members')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('user_id', userId)
        .single();

      if (!hasAccess.data) {
        return { error: 'User does not have access to this organization' };
      }

      // Get organization details
      const { data: organization } = await this.supabaseService.client
        .from('organizations')
        .select('*')
        .eq('id', organizationId)
        .single();

      if (!organization) {
        return { error: 'Organization not found' };
      }

      const axios = require('axios');
      const token = user.atlassian_access_token;

      // Get accessible resources
      const resourcesResponse = await axios.get('https://api.atlassian.com/oauth/token/accessible-resources', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const accessibleResources = resourcesResponse.data;

      // Find matching resource for this organization
      const matchingResource = accessibleResources.find(resource => 
        organization.jira_base_url === resource.url
      );

      if (!matchingResource) {
        return { 
          error: 'No matching JIRA site found in accessible resources',
          organizationUrl: organization.jira_base_url,
          accessibleResources: accessibleResources.map(r => r.url)
        };
      }

      // Update organization with cloud ID
      const { data: updatedOrg, error: updateError } = await this.supabaseService.client
        .from('organizations')
        .update({ jira_cloud_id: matchingResource.id })
        .eq('id', organizationId)
        .select()
        .single();

      if (updateError) {
        return { error: `Failed to update organization: ${updateError.message}` };
      }

      this.logger.log(`🔗 Updated cloud ID for organization ${organization.name}: ${matchingResource.id}`);

      return {
        success: true,
        organizationId,
        organizationName: organization.name,
        cloudId: matchingResource.id,
        siteUrl: matchingResource.url,
        updatedOrganization: updatedOrg
      };

    } catch (error) {
      this.logger.error('Failed to update organization cloud ID:', error);
      return { error: error.message };
    }
  }
} 