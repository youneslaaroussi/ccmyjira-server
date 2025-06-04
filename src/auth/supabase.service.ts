import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import axios from 'axios';

export interface User {
  id: string;
  email: string;
  atlassian_account_id?: string;
  display_name?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
  last_login_at?: string;
  atlassian_access_token?: string;
  atlassian_refresh_token?: string;
  atlassian_token_expires_at?: string;
  timezone?: string;
  email_notifications?: boolean;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  jira_base_url: string;
  jira_project_key: string;
  jira_cloud_id?: string;
  plan_type: string;
  monthly_email_limit: number;
  emails_processed_this_month: number;
  created_at: string;
  updated_at: string;
  features: {
    smart_assignment: boolean;
    sprints_enabled: boolean;
    custom_prompts: boolean;
  };
}

@Injectable()
export class SupabaseService {
  private readonly logger = new Logger(SupabaseService.name);
  private supabase: SupabaseClient;

  constructor(private configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      this.logger.warn('⚠️  Supabase configuration missing. Some features will be limited.');
      return;
    }

    this.supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    this.logger.log('✅ Supabase service initialized');
  }

  /**
   * Check if Supabase is configured and available
   */
  isAvailable(): boolean {
    return !!this.supabase;
  }

  /**
   * Get the Supabase client instance
   */
  get client(): SupabaseClient {
    if (!this.isAvailable()) {
      throw new Error('Supabase not configured');
    }
    return this.supabase;
  }

  /**
   * Create or update user from Atlassian OAuth data
   */
  async upsertUser(atlassianUser: any, tokens: any): Promise<User> {
    if (!this.isAvailable()) {
      throw new Error('Supabase not configured');
    }

    const userData = {
      email: atlassianUser.email,
      atlassian_account_id: atlassianUser.account_id,
      display_name: atlassianUser.name,
      avatar_url: atlassianUser.picture,
      updated_at: new Date().toISOString(),
      last_login_at: new Date().toISOString(),
      atlassian_access_token: tokens.access_token,
      atlassian_refresh_token: tokens.refresh_token,
      atlassian_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    };

    const { data, error } = await this.supabase
      .from('users')
      .upsert(userData, {
        onConflict: 'atlassian_account_id'
      })
      .select()
      .single();

    if (error) {
      this.logger.error('Failed to upsert user:', error);
      throw new Error(`Failed to save user: ${error.message}`);
    }

    this.logger.log(`✅ User upserted: ${data.email}`);
    return data;
  }

  /**
   * Get user by Atlassian account ID
   */
  async getUserByAtlassianId(accountId: string): Promise<User | null> {
    if (!this.isAvailable()) {
      return null;
    }

    const { data, error } = await this.supabase
      .from('users')
      .select('*')
      .eq('atlassian_account_id', accountId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // User not found
      }
      this.logger.error('Failed to get user:', error);
      throw new Error(`Failed to get user: ${error.message}`);
    }

    return data;
  }

  /**
   * Get user by ID
   */
  async getUserById(id: string): Promise<User | null> {
    if (!this.isAvailable()) {
      return null;
    }

    const { data, error } = await this.supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      this.logger.error('Failed to get user by ID:', error);
      return null;
    }

    return data;
  }

  /**
   * Get user's organizations
   */
  async getUserOrganizations(userId: string): Promise<Organization[]> {
    if (!this.isAvailable()) {
      return [];
    }

    const { data, error } = await this.supabase
      .from('organization_members')
      .select('organizations(*)')
      .eq('user_id', userId);

    if (error) {
      this.logger.error('Failed to get user organizations:', error);
      return [];
    }

    if (!data) {
      return [];
    }

    return data.map((item: any) => item.organizations).filter(Boolean) as Organization[];
  }

  /**
   * Create a new organization
   */
  async createOrganization(
    name: string,
    slug: string,
    ownerId: string,
    jiraBaseUrl: string,
    projectKey: string,
    cloudId?: string
  ): Promise<Organization> {
    if (!this.isAvailable()) {
      throw new Error('Supabase not configured');
    }

    const orgData = {
      name,
      slug,
      owner_id: ownerId,
      jira_base_url: jiraBaseUrl,
      jira_project_key: projectKey,
      jira_cloud_id: cloudId,
    };

    // Create organization
    const { data: org, error: orgError } = await this.supabase
      .from('organizations')
      .insert(orgData)
      .select()
      .single();

    if (orgError) {
      this.logger.error('Failed to create organization:', orgError);
      throw new Error(`Failed to create organization: ${orgError.message}`);
    }

    // Add owner as member
    const { error: memberError } = await this.supabase
      .from('organization_members')
      .insert({
        organization_id: org.id,
        user_id: ownerId,
        role: 'owner',
        joined_at: new Date().toISOString()
      });

    if (memberError) {
      this.logger.error('Failed to add owner as member:', memberError);
      // Continue anyway, we have the org created
    }

    this.logger.log(`✅ Organization created: ${name}`);
    return org;
  }

  /**
   * Update user's last login time
   */
  async updateLastLogin(userId: string): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }

    const { error } = await this.supabase
      .from('users')
      .update({
        last_login_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (error) {
      this.logger.error('Failed to update last login:', error);
    }
  }

  /**
   * Test Supabase connection
   */
  async testConnection(): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('count')
        .limit(1);

      return !error;
    } catch (error) {
      this.logger.error('Supabase connection test failed:', error);
      return false;
    }
  }

  /**
   * Refresh Atlassian access token using refresh token
   */
  async refreshAtlassianToken(userId: string): Promise<User | null> {
    if (!this.isAvailable()) {
      throw new Error('Supabase not configured');
    }

    try {
      // Get current user with refresh token
      const user = await this.getUserById(userId);
      if (!user || !user.atlassian_refresh_token) {
        throw new Error('User not found or no refresh token available');
      }

      this.logger.log(`🔄 Refreshing Atlassian token for user: ${user.email}`);

      // Call Atlassian token refresh endpoint
      const response = await axios.post('https://auth.atlassian.com/oauth/token', {
        grant_type: 'refresh_token',
        client_id: this.configService.get<string>('ATLASSIAN_CLIENT_ID'),
        client_secret: this.configService.get<string>('ATLASSIAN_CLIENT_SECRET'),
        refresh_token: user.atlassian_refresh_token,
      }, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const { access_token, refresh_token, expires_in } = response.data;

      // Update user with new tokens
      const updatedUserData = {
        atlassian_access_token: access_token,
        atlassian_refresh_token: refresh_token || user.atlassian_refresh_token, // Some providers don't return new refresh token
        atlassian_token_expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data: updatedUser, error } = await this.supabase
        .from('users')
        .update(updatedUserData)
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        this.logger.error('Failed to update user with refreshed token:', error);
        throw new Error(`Failed to update user: ${error.message}`);
      }

      this.logger.log(`✅ Token refreshed successfully for user: ${user.email}`);
      return updatedUser;

    } catch (error) {
      this.logger.error('Failed to refresh Atlassian token:', error.response?.data || error.message);
      
      if (error.response?.status === 400) {
        this.logger.error('🚫 Refresh token is invalid or expired - user needs to re-authenticate');
      }
      
      throw error;
    }
  }
} 