// ============================================================================
// Zava Gift Exchange - Infrastructure as Code
// ============================================================================
// Infrastructure for the Zava Gift Exchange app
// 
// Environment Strategy:
// - PR: Ephemeral resource group per PR (auto-deleted on close)
//       - Static Web App: Standard tier
//       - Cosmos DB: Serverless (pay per request)
//       - Email Service: Disabled
//
// - QA: Isolated resource group (`ZavaGiftExchange-qa`)
//       - Static Web App: Standard tier
//       - Cosmos DB: Serverless (pay per request)
//       - Email Service: Enabled (for full testing)
//       - Azure Load Testing
//
// - Prod: Production resource group (`ZavaGiftExchange`)
//       - Static Web App: Standard tier (SLA, custom domains)
//       - Cosmos DB: Serverless (unlimited scaling, pay per request)
//       - Email Service: Enabled
//
// Note: Staging environments are ENABLED to support GitHub Actions deployments.
//       When deploying via deployment token (not linked repository), the action
//       requires staging environment support to properly deploy content.
//
// Resources: Static Web App, Cosmos DB, Application Insights, Azure Communication Services
// ============================================================================

@description('Project name used for resource naming')
param projectName string = 'ZavaGiftExchange'

@description('Azure region for resources')
param location string = resourceGroup().location

@description('Environment: pr, qa, or prod')
@allowed(['pr', 'qa', 'prod'])
param environment string = 'pr'

@description('PR number for ephemeral environments (required for pr environment)')
param prNumber string = ''

@description('Static Web App SKU')
@allowed(['Free', 'Standard'])
param staticWebAppSku string = 'Standard'

@description('Enable email notifications via Azure Communication Services')
param enableEmailService bool = false

@description('Email service data location')
@allowed(['United States', 'Europe', 'UK', 'Japan', 'Australia', 'Asia Pacific'])
param emailDataLocation string = 'United States'

@description('Deployment timestamp for build tracking')
param deploymentTime string = utcNow('yyyy-MM-dd')

@description('GitHub repository URL for Static Web App')
param repositoryUrl string = ''

@description('GitHub repository branch')
param repositoryBranch string = 'main'

@description('Deployment ID for globally unique naming (e.g., user identifier from GitHub Actions)')
param deploymentId string = ''

@description('Secret token used to authenticate calls to the cleanup HTTP endpoint')
@secure()
param cleanupSecret string = ''

@description('Enable Azure Front Door for WAF and global CDN (production only)')
param enableFrontDoor bool = false

@description('Monthly budget amount in USD (0 to disable budget alerts)')
param budgetAmount int = 0

@description('Email address for budget alert notifications')
param budgetAlertEmail string = ''

// ============================================================================
// Variables
// ============================================================================

// Environment suffix for naming (pr-123, qa, prod)
var envSuffix = environment == 'pr' ? 'pr-${prNumber}' : environment

// Generate unique suffix from resource group ID + deployment ID to ensure:
// 1. Global uniqueness (resource group ID includes subscription ID)
// 2. Consistent naming across runs within the same environment
// 3. No collisions between environments or subscriptions
var uniqueSuffix = uniqueString(resourceGroup().id, deploymentId)

// Resource names with global uniqueness guarantee
// Max 24 chars for Cosmos DB, so we use shortened names
var cosmosAccountName = 'ss${uniqueSuffix}'
var staticWebAppName = '${projectName}-${envSuffix}-${uniqueSuffix}'
var communicationServiceName = 'ss-acs-${uniqueSuffix}'
var emailServiceName = 'ss-email-${uniqueSuffix}'
var logAnalyticsName = 'ss-logs-${uniqueSuffix}'
var appInsightsName = 'ss-insights-${uniqueSuffix}'
var databaseName = 'ZavaGiftExchange'
var containerName = 'games'

// Retention based on environment
// ⚠️  IMPORTANT: PerGB2018 SKU only allows specific retention values: 30, 31, 60, 90, 120, 180, 270, 365, 550, 730
// PR uses 30 days (minimum allowed, also cost-effective for ephemeral environments)
var retentionDays = environment == 'prod' ? 90 : 30
// ⚠️  NOTE: Free SKU for Log Analytics is no longer supported by Azure (deprecated as of July 1, 2022)
// All environments now use PerGB2018 which is the current standard pricing model
var logAnalyticsSku = 'PerGB2018'
// Cosmos DB free tier: Disabled by default for maximum subscription compatibility.
// Azure allows only one free tier Cosmos DB per subscription, and free tier is not
// available on all subscription types (e.g., Internal, MSDN, some Enterprise).
// To enable free tier for QA (saves ~$25/month), set enableFreeTier=true in
// infra/parameters.qa.json — but only if your subscription supports it.
var enableFreeTier = false

// Azure Load Testing resource name (QA only)
var loadTestName = 'ss-loadtest-${uniqueSuffix}'

// ============================================================================
// Log Analytics Workspace (required for Application Insights)
// ============================================================================

resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2025-02-01' = {
  name: logAnalyticsName
  location: location
  properties: {
    sku: {
      name: logAnalyticsSku
    }
    retentionInDays: retentionDays
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
  }
}

// ============================================================================
// Application Insights
// ============================================================================

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    Flow_Type: 'Bluefield'
    Request_Source: 'rest'
    WorkspaceResourceId: logAnalyticsWorkspace.id
    IngestionMode: 'LogAnalytics'
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
    RetentionInDays: retentionDays
  }
}

// ============================================================================
// Cosmos DB - Serverless
// ============================================================================
// PRICING MODEL:
// - QA (enableFreeTier=true): $0/month (free tier, one per subscription)
// - PR/Production (enableFreeTier=false): Pay-per-request pricing
//   - Typical cost: <$5/month for light development workloads
//   - PR environments are deleted when PR closes (automatic cleanup)
//
// Serverless mode: No pre-provisioned throughput, automatic scaling
// ============================================================================

resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2024-11-15' = {
  name: cosmosAccountName
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    enableFreeTier: enableFreeTier
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    capabilities: [
      { name: 'EnableServerless' }
    ]
  }
}

resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-11-15' = {
  parent: cosmosAccount
  name: databaseName
  properties: {
    resource: { id: databaseName }
  }
}

resource container 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-11-15' = {
  parent: database
  name: containerName
  properties: {
    resource: {
      id: containerName
      partitionKey: {
        paths: ['/id']
        kind: 'Hash'
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        automatic: true
        includedPaths: [{ path: '/*' }]
        excludedPaths: [
          { path: '/_etag/?' }
          { path: '/participants/[]/*' }  // Participants array is large but never queried by Cosmos SQL
          { path: '/assignments/[]/*' }   // Assignments are accessed in-memory after fetching the game
        ]
        compositeIndexes: [
          [
            { path: '/code', order: 'ascending' }
            { path: '/isArchived', order: 'ascending' }
          ]
          [
            { path: '/isArchived', order: 'ascending' }
            { path: '/date', order: 'ascending' }
          ]
        ]
      }
    }
  }
}

// ============================================================================
// Static Web App with Managed Functions
// ============================================================================
// Note: Staging environments are ENABLED to allow GitHub Actions deployments.
// When deploying from GitHub Actions without a linked repository, the action
// needs staging environment support to deploy content properly.

resource staticWebApp 'Microsoft.Web/staticSites@2024-11-01' = {
  name: staticWebAppName
  location: location
  sku: {
    name: staticWebAppSku
    tier: staticWebAppSku
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    repositoryUrl: !empty(repositoryUrl) ? repositoryUrl : null
    branch: !empty(repositoryUrl) ? repositoryBranch : null
    stagingEnvironmentPolicy: 'Enabled'
    allowConfigFileUpdates: true
    buildProperties: {
      appLocation: '/'
      apiLocation: 'api'
      outputLocation: 'dist'
    }
  }
}

// ============================================================================
// Azure Communication Services (Optional)
// ============================================================================
// Resources must be created in order: emailService → emailDomain → communicationService
// The communicationService needs linkedDomains to connect to the email domain

resource emailService 'Microsoft.Communication/emailServices@2023-04-01' = if (enableEmailService) {
  name: emailServiceName
  location: 'global'
  properties: {
    dataLocation: emailDataLocation
  }
}

resource emailDomain 'Microsoft.Communication/emailServices/domains@2023-04-01' = if (enableEmailService) {
  parent: emailService
  name: 'AzureManagedDomain'
  location: 'global'
  properties: {
    domainManagement: 'AzureManaged'
    userEngagementTracking: 'Disabled'
  }
}

resource communicationService 'Microsoft.Communication/communicationServices@2023-04-01' = if (enableEmailService) {
  name: communicationServiceName
  location: 'global'
  properties: {
    dataLocation: emailDataLocation
    linkedDomains: [
      emailDomain.id
    ]
  }
}

// ============================================================================
// App Settings Configuration
// ============================================================================

resource staticWebAppSettings 'Microsoft.Web/staticSites/config@2024-11-01' = {
  parent: staticWebApp
  name: 'appsettings'
  properties: union(
    {
      // Database configuration
      COSMOS_ENDPOINT: cosmosAccount.properties.documentEndpoint
      COSMOS_DATABASE_NAME: databaseName
      COSMOS_CONTAINER_NAME: containerName
      // Application Insights
      APPLICATIONINSIGHTS_CONNECTION_STRING: appInsights.properties.ConnectionString
      APPINSIGHTS_INSTRUMENTATIONKEY: appInsights.properties.InstrumentationKey
      // Environment info
      ENVIRONMENT: environment
      // Cleanup endpoint secret (used by GitHub Actions cron to authenticate)
      CLEANUP_SECRET: cleanupSecret
      // Build info
      BUILD_VERSION: '${envSuffix}-${uniqueSuffix}'
      BUILD_DATE: deploymentTime
      // App URL (for email links)
      // Uses the actual deployed Static Web App hostname (Azure assigns a random name)
      // For PR: Each PR gets its own SWA with a random Azure-assigned hostname
      // For staging/prod: Uses the shared resource's actual hostname
      APP_BASE_URL: 'https://${staticWebApp.properties.defaultHostname}'
    },
    {
      COSMOS_KEY: cosmosAccount.listKeys().primaryMasterKey
    },
    enableEmailService ? {
      ACS_CONNECTION_STRING: communicationService!.listKeys().primaryConnectionString
      ACS_SENDER_ADDRESS: 'noreply@${emailDomain!.properties.mailFromSenderDomain}'
    } : {}
  )
}

// ============================================================================
// Cosmos DB RBAC (for potential future Managed Identity support)
// ============================================================================
// The Static Web App's system-assigned managed identity is granted the
// Cosmos DB Built-in Data Contributor role. Currently unused (API uses key-based
// auth via COSMOS_KEY) but provisioned for future migration to keyless auth.

resource cosmosRoleAssignment 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-11-15' = {
  parent: cosmosAccount
  name: guid(cosmosAccount.id, staticWebApp.id, '00000000-0000-0000-0000-000000000002')
  properties: {
    // Cosmos DB Built-in Data Contributor role
    roleDefinitionId: '${cosmosAccount.id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002'
    principalId: staticWebApp.identity.principalId
    scope: cosmosAccount.id
  }
}

// ============================================================================
// Azure Front Door (Optional, for production WAF/CDN)
// NOTE: This currently creates only a Front Door profile + endpoint.
// Origin group, origin, route, and optional WAF policy are not yet configured.
// Enabling this parameter will provision billable Front Door resources without
// routing traffic. Complete the origin/route configuration before using in prod.
// ============================================================================

resource frontDoorProfile 'Microsoft.Cdn/profiles@2024-09-01' = if (enableFrontDoor) {
  name: 'ss-fd-${uniqueSuffix}'
  location: 'global'
  sku: {
    name: 'Standard_AzureFrontDoor'
  }
}

resource frontDoorEndpoint 'Microsoft.Cdn/profiles/afdEndpoints@2024-09-01' = if (enableFrontDoor) {
  parent: frontDoorProfile
  name: 'ss-${envSuffix}'
  location: 'global'
  properties: {
    enabledState: 'Enabled'
  }
}

// ============================================================================
// Budget Alert (Optional)
// ============================================================================

resource budget 'Microsoft.Consumption/budgets@2024-08-01' = if (budgetAmount > 0 && !empty(budgetAlertEmail)) {
  name: 'ss-budget-${envSuffix}'
  properties: {
    category: 'Cost'
    amount: budgetAmount
    timeGrain: 'Monthly'
    timePeriod: {
      startDate: '${substring(deploymentTime, 0, 7)}-01' // First day of deployment month
    }
    notifications: {
      Actual_GreaterThan_80_Percent: {
        enabled: true
        operator: 'GreaterThan'
        threshold: 80
        contactEmails: [budgetAlertEmail]
        thresholdType: 'Actual'
      }
      Forecasted_GreaterThan_100_Percent: {
        enabled: true
        operator: 'GreaterThan'
        threshold: 100
        contactEmails: [budgetAlertEmail]
        thresholdType: 'Forecasted'
      }
    }
  }
}

// ============================================================================
// Azure Load Testing (QA only)
// ============================================================================
// Provisions an Azure Load Testing resource for running JMeter-based load tests
// against the QA environment as part of the CI/CD pipeline.
// Only created in QA to validate API performance before promoting to production.
// PR environments skip load testing (ephemeral, not worth the cost).
// Production does not need its own resource (QA tests gate the promotion).
// ============================================================================

resource loadTestResource 'Microsoft.LoadTestService/loadTests@2022-12-01' = if (environment == 'qa') {
  name: loadTestName
  location: location
  tags: {
    environment: environment
    project: projectName
  }
}

// ============================================================================
// Azure SRE Agent (Production — provisioned via portal)
// ============================================================================
// Azure SRE Agent is provisioned through the portal at https://sre.azure.com
// (not via Bicep/ARM). After deploying production infrastructure, set up the
// SRE Agent manually:
//   1. Navigate to https://sre.azure.com
//   2. Create an agent in the production subscription
//   3. Connect the GitHub repository for Deep Context
//   4. Grant Reader access to the production resource group
//   5. Connect Application Insights for log/metric analysis
//
// Learn more: https://learn.microsoft.com/azure/sre-agent
// ============================================================================

// ============================================================================
// Outputs
// ============================================================================

output staticWebAppUrl string = 'https://${staticWebApp.properties.defaultHostname}'
output staticWebAppName string = staticWebApp.name
output staticWebAppId string = staticWebApp.id
output cosmosAccountName string = cosmosAccount.name
output cosmosEndpoint string = cosmosAccount.properties.documentEndpoint
output appInsightsName string = appInsights.name
output logAnalyticsWorkspaceId string = logAnalyticsWorkspace.id
output environment string = environment
output resourceGroupName string = resourceGroup().name
output loadTestResourceName string = environment == 'qa' ? loadTestResource.name : ''
