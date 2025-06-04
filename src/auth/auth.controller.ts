import { 
  Controller, 
  Get, 
  Post, 
  UseGuards, 
  Req, 
  Res, 
  Logger,
  HttpException,
  HttpStatus,
  Query,
  Body,
  Put,
  Param
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody, ApiQuery } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {}

  /**
   * Initiate Atlassian OAuth flow
   */
  @Get('atlassian')
  @UseGuards(AuthGuard('atlassian'))
  @ApiOperation({ 
    summary: 'Start Atlassian OAuth',
    description: 'Redirects user to Atlassian authorization page'
  })
  @ApiResponse({ 
    status: 302, 
    description: 'Redirect to Atlassian OAuth' 
  })
  async atlassianAuth() {
    // This route is handled by Passport, no implementation needed
    // User will be redirected to Atlassian OAuth page
  }

  /**
   * Handle Atlassian OAuth callback
   */
  @Get('atlassian/callback')
  @UseGuards(AuthGuard('atlassian'))
  @ApiOperation({ 
    summary: 'Atlassian OAuth callback',
    description: 'Handles the OAuth callback from Atlassian'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Successful authentication',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        user: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            email: { type: 'string' },
            displayName: { type: 'string' },
            avatarUrl: { type: 'string' }
          }
        },
        access_token: { type: 'string' },
        organizations: { type: 'array' },
        accessibleResources: { type: 'array' }
      }
    }
  })
  async atlassianCallback(@Req() req: any, @Res() res: Response) {
    try {
      this.logger.log('🔄 Processing Atlassian OAuth callback...');

      if (!req.user) {
        throw new HttpException('Authentication failed', HttpStatus.UNAUTHORIZED);
      }

      // Process the OAuth login
      const loginResponse = await this.authService.handleOAuthLogin(req.user);

      // Get frontend URL for redirect
      const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3001';

      // Always redirect to frontend with token (removed development/production check)
      this.logger.log(`🔀 Redirecting to: ${frontendUrl}/dashboard?token=${loginResponse.access_token}`);
      return res.redirect(`${frontendUrl}/dashboard?token=${loginResponse.access_token}`);

    } catch (error) {
      this.logger.error('❌ OAuth callback failed:', error);
      
      const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3001';
      return res.redirect(`${frontendUrl}/login?error=auth_failed`);
    }
  }

  /**
   * Get current user profile
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Get current user',
    description: 'Returns the current authenticated user profile (or demo user if in demo mode)'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'User profile retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        user: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            email: { type: 'string' },
            displayName: { type: 'string' },
            avatarUrl: { type: 'string' }
          }
        },
        organizations: { type: 'array' },
        isDemo: { type: 'boolean' }
      }
    }
  })
  async getProfile(@Req() req: any) {
    try {
      const userId = req.user.id;
      const isDemo = req.isDemo || req.user.isDemo || false;
      
      const profile = await this.authService.validateUser(userId, isDemo);
      
      if (!profile) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      return {
        ...profile,
        isDemo,
      };
    } catch (error) {
      this.logger.error('❌ Failed to get user profile:', error);
      throw new HttpException('Failed to get profile', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Logout user
   */
  @Post('logout')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Log out user',
    description: 'Logs out the current user (JWT tokens are stateless, so this is mainly for client-side cleanup)'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Logout successful',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' }
      }
    }
  })
  async logout(@Req() req: any) {
    this.logger.log(`👋 User logged out: ${req.user.email}`);
    
    return {
      success: true,
      message: 'Logged out successfully'
    };
  }

  /**
   * Get authentication configuration
   */
  @Get('config')
  @ApiOperation({ 
    summary: 'Get auth configuration',
    description: 'Returns authentication system configuration and status'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Authentication configuration',
    schema: {
      type: 'object',
      properties: {
        atlassian: {
          type: 'object',
          properties: {
            configured: { type: 'boolean' },
            clientId: { type: 'string' },
            authUrl: { type: 'string' }
          }
        },
        supabase: {
          type: 'object',
          properties: {
            configured: { type: 'boolean' }
          }
        },
        jwt: {
          type: 'object',
          properties: {
            configured: { type: 'boolean' }
          }
        }
      }
    }
  })
  async getAuthConfig() {
    return this.authService.getAuthConfig();
  }

  /**
   * Test authentication system health
   */
  @Get('health')
  @ApiOperation({ 
    summary: 'Authentication health check',
    description: 'Tests the health of the authentication system components'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Authentication system health status'
  })
  async healthCheck() {
    return this.authService.testAuthSystem();
  }

  @Get('health')
  @ApiOperation({ summary: 'Check authentication system health' })
  @ApiResponse({ status: 200, description: 'Authentication system status' })
  async getAuthHealth() {
    return this.authService.getAuthHealth();
  }

  @Post('verify-domain/initiate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Initiate domain verification process' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        domain: { type: 'string', example: 'acme.com' },
        organizationId: { type: 'string', example: 'uuid' },
        email: { type: 'string', example: 'support@acme.com', description: 'Email address to send verification to' }
      },
      required: ['domain', 'organizationId', 'email']
    }
  })
  @ApiResponse({ status: 200, description: 'Domain verification email sent' })
  @ApiResponse({ status: 400, description: 'Invalid domain format or configuration error' })
  async initiateDomainVerification(
    @Body() body: { domain: string; organizationId: string; email: string },
    @Req() req: any
  ) {
    const userId = req.user.id;
    return this.authService.initiateDomainVerification(userId, body.domain, body.organizationId, body.email);
  }

  @Post('verify-domain/confirm')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify domain with verification code' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        domain: { type: 'string', example: 'acme.com' },
        verificationCode: { type: 'string', example: 'abc123...' }
      },
      required: ['domain', 'verificationCode']
    }
  })
  @ApiResponse({ status: 200, description: 'Domain verified successfully' })
  @ApiResponse({ status: 400, description: 'Invalid verification code or expired' })
  async verifyDomain(
    @Body() body: { domain: string; verificationCode: string },
    @Req() req: any
  ) {
    const userId = req.user.id;
    return this.authService.verifyDomain(body.domain, body.verificationCode, userId);
  }

  @Get('verify-domain/callback')
  @ApiOperation({ summary: 'Handle domain verification callback from email link' })
  @ApiQuery({ name: 'code', description: 'Verification code' })
  @ApiQuery({ name: 'domain', description: 'Domain to verify' })
  @ApiResponse({ status: 302, description: 'Redirect to frontend with verification result' })
  async handleDomainVerificationCallback(
    @Query('code') code: string,
    @Query('domain') domain: string,
    @Res() res: any
  ) {
    try {
      // For callback from email, we need to handle this without auth
      // This is a special case where verification happens via email link
      const result = await this.authService.verifyDomainByCode(domain, code);
      
      // Redirect to frontend with success
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
      return res.redirect(`${frontendUrl}/domain-verified?domain=${domain}&success=true`);
    } catch (error) {
      // Redirect to frontend with error
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
      return res.redirect(`${frontendUrl}/domain-verified?domain=${domain}&success=false&error=${encodeURIComponent(error.message)}`);
    }
  }

  @Get('domains/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get domain verification status for organization' })
  @ApiQuery({ name: 'organizationId', description: 'Organization ID' })
  @ApiQuery({ name: 'domain', description: 'Specific domain (optional)', required: false })
  @ApiResponse({ status: 200, description: 'Domain verification status' })
  async getDomainStatus(
    @Query('organizationId') organizationId: string,
    @Query('domain') domain?: string
  ) {
    return this.authService.getDomainStatus(organizationId, domain);
  }

  @Get('organizations/:id/verified-domain')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check if organization has a verified domain' })
  @ApiResponse({ 
    status: 200, 
    description: 'Organization verified domain status',
    schema: {
      type: 'object',
      properties: {
        hasVerifiedDomain: { type: 'boolean' },
        primaryDomain: { type: 'string', example: 'acme.com' },
        verifiedAt: { type: 'string', format: 'date-time' }
      }
    }
  })
  async getOrganizationVerifiedDomain(
    @Param('id') organizationId: string,
    @Req() req: any
  ) {
    const userId = req.user.id;
    
    // Check if user has access to this organization
    const { data: membership } = await this.authService['supabaseService'].client
      .from('organization_members')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .single();

    if (!membership) {
      throw new HttpException('Access denied to organization', HttpStatus.FORBIDDEN);
    }

    return this.authService.getOrganizationVerifiedDomain(organizationId);
  }

  /**
   * Create a new organization
   */
  @Post('organizations')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create new organization' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', example: 'Acme Corp' },
        jiraBaseUrl: { type: 'string', example: 'https://acme.atlassian.net' },
        jiraProjectKey: { type: 'string', example: 'ACME' }
      },
      required: ['name']
    }
  })
  @ApiResponse({ status: 201, description: 'Organization created successfully' })
  async createOrganization(
    @Body() body: { 
      name: string; 
      jiraBaseUrl?: string; 
      jiraProjectKey?: string; 
    },
    @Req() req: any
  ) {
    const userId = req.user.id;
    return this.authService.createOrganization(userId, body);
  }

  /**
   * Get user's organizations
   */
  @Get('organizations')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Get user organizations',
    description: 'Returns all organizations the current user belongs to (or demo organization if in demo mode)'
  })
  @ApiResponse({
    status: 200,
    description: 'Organizations retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        organizations: { type: 'array' },
        isDemo: { type: 'boolean' }
      }
    }
  })
  async getUserOrganizations(@Req() req: any) {
    try {
      const userId = req.user.id;
      const isDemo = req.isDemo || req.user.isDemo || false;
      
      const organizations = await this.authService.getUserOrganizations(userId, isDemo);
      
      return {
        success: true,
        organizations,
        isDemo,
      };
    } catch (error) {
      this.logger.error('❌ Failed to get user organizations:', error);
      throw new HttpException('Failed to get organizations', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Update organization (including JIRA configuration)
   */
  @Put('organizations/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update organization' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', example: 'Acme Corp' },
        jiraBaseUrl: { type: 'string', example: 'https://acme.atlassian.net' },
        jiraProjectKey: { type: 'string', example: 'ACME' }
      }
    }
  })
  @ApiResponse({ status: 200, description: 'Organization updated successfully' })
  async updateOrganization(
    @Param('id') id: string,
    @Body() body: { 
      name?: string; 
      jiraBaseUrl?: string; 
      jiraProjectKey?: string; 
    },
    @Req() req: any
  ) {
    const userId = req.user.id;
    return this.authService.updateOrganization(userId, id, body);
  }

  /**
   * Debug Atlassian token and accessibility
   */
  @Get('debug/atlassian')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Debug Atlassian token and access' })
  @ApiResponse({ status: 200, description: 'Atlassian access debug info' })
  async debugAtlassianAccess(@Req() req: any) {
    const userId = req.user.id;
    return this.authService.debugAtlassianAccess(userId);
  }

  /**
   * Update organization cloud ID from current token
   */
  @Post('debug/update-cloud-id/:organizationId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update organization cloud ID from accessible resources' })
  @ApiResponse({ status: 200, description: 'Cloud ID updated successfully' })
  async updateOrganizationCloudId(
    @Param('organizationId') organizationId: string,
    @Req() req: any
  ) {
    const userId = req.user.id;
    return this.authService.updateOrganizationCloudId(userId, organizationId);
  }
} 