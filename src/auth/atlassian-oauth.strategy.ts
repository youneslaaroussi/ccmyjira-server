import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy as OAuth2Strategy } from 'passport-oauth2';
import axios from 'axios';

@Injectable()
export class AtlassianOAuthStrategy extends PassportStrategy(OAuth2Strategy, 'atlassian') {
  private readonly logger = new Logger(AtlassianOAuthStrategy.name);

  constructor(private configService: ConfigService) {
    const clientID = configService.get<string>('ATLASSIAN_CLIENT_ID');
    const clientSecret = configService.get<string>('ATLASSIAN_CLIENT_SECRET');
    const callbackURL = `${configService.get<string>('APP_URL')}/auth/atlassian/callback`;

    if (!clientID || !clientSecret) {
      throw new Error('Missing Atlassian OAuth configuration. Please set ATLASSIAN_CLIENT_ID and ATLASSIAN_CLIENT_SECRET');
    }

    super({
      authorizationURL: 'https://auth.atlassian.com/authorize',
      tokenURL: 'https://auth.atlassian.com/oauth/token',
      clientID,
      clientSecret,
      callbackURL,
      scope: 'read:me read:jira-user read:jira-work write:jira-work offline_access',
    });

    this.logger.log('✅ Atlassian OAuth strategy initialized');
  }

  /**
   * This method is called after successful OAuth authorization
   * We use the access token to fetch user information from Atlassian
   */
  async validate(accessToken: string, refreshToken: string, profile: any): Promise<any> {
    try {
      this.logger.log('🔍 Validating Atlassian OAuth user...');
      this.logger.log(`🔑 Access token received: ${accessToken.substring(0, 20)}...`);

      // Get user profile from Atlassian
      const userResponse = await axios.get('https://api.atlassian.com/me', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      });

      const userProfile = userResponse.data;
      this.logger.log(`👤 User profile retrieved: ${userProfile.email}`);

      // Get accessible resources (JIRA sites)
      let accessibleResources = [];
      try {
        const resourcesResponse = await axios.get('https://api.atlassian.com/oauth/token/accessible-resources', {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          },
        });
        accessibleResources = resourcesResponse.data;
        this.logger.log(`🏢 Found ${accessibleResources.length} accessible JIRA sites`);
      } catch (resourceError) {
        this.logger.warn('⚠️ Could not fetch accessible resources:', resourceError.response?.status);
        // Continue without resources - not critical for basic auth
      }

      return {
        atlassianUser: {
          account_id: userProfile.account_id,
          email: userProfile.email,
          name: userProfile.name,
          picture: userProfile.picture,
        },
        tokens: {
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: 3600, // Atlassian tokens typically expire in 1 hour
        },
        accessibleResources,
      };
    } catch (error) {
      this.logger.error('❌ Failed to validate Atlassian user:', error.message);
      
      if (error.response) {
        this.logger.error(`HTTP ${error.response.status}: ${error.response.statusText}`);
        this.logger.error('Response data:', JSON.stringify(error.response.data, null, 2));
        
        if (error.response.status === 403) {
          this.logger.error('🚫 403 Forbidden - This usually means:');
          this.logger.error('   1. The OAuth app needs the "read:account" scope');
          this.logger.error('   2. The user hasn\'t granted permission to access their profile');
          this.logger.error('   3. The access token is invalid or expired');
        }
      }
      
      throw new Error('Failed to fetch user information from Atlassian');
    }
  }
} 