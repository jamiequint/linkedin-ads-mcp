// Core entity types
export interface AdAccount {
  id: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  currency: string;
  test?: boolean;
  servingStatuses?: string[];
  notifiedOnCampaignOptimizationTips?: boolean;
  notifiedOnCreativeApproval?: boolean;
  notifiedOnCreativeRejection?: boolean;
  notifiedOnEndOfCampaign?: boolean;
  reference?: string;
  totalBudget?: BudgetAmount;
  type?: string;
  productType?: "MARKETING_SOLUTIONS" | "TALENT_SOLUTIONS" | "LINKEDIN_ON_LINKEDIN";
  originatingCustomer?: string;
}

export interface CampaignGroup {
  id: string;
  account: string;
  name: string;
  status: "ACTIVE" | "ARCHIVED" | "CANCELED" | "DRAFT" | "PAUSED";
  backfilled?: boolean;
  runSchedule?: RunSchedule;
  totalBudget?: BudgetAmount;
  allowedCampaignTypes?: string[];
  billingReference?: string;
  billingParentReference?: string;
  beneficiaryReference?: { company?: string; organization?: string };
  buyingType?: "AUCTION" | "RESERVATION";
}

export interface Campaign {
  id: string;
  account: string;
  campaignGroup: string;
  name: string;
  status: "ACTIVE" | "PAUSED" | "ARCHIVED" | "COMPLETED" | "CANCELED" | "DRAFT" | "PENDING_DELETION";
  type: string;
  costType: "CPM" | "CPC";
  objectiveType: string;
  optimizationTargetType?: string;
  dailyBudget?: BudgetAmount;
  totalBudget?: BudgetAmount;
  unitCost?: BudgetAmount;
  runSchedule?: RunSchedule;
  targetingCriteria?: TargetingCriteria;
  format: string;
  offsiteDeliveryEnabled?: boolean;
  creativeSelection?: string;
  locale?: string;
  storyDeliveryEnabled?: boolean;
}

export interface TargetingCriteria {
  include?: TargetingFacet[];
  exclude?: TargetingFacet[];
}

export interface TargetingFacet {
  type: string;
  values: string[];
}

export interface AdCreative {
  id: string;
  account: string;
  campaign: string;
  status: "ACTIVE" | "PAUSED";
  type: string;
  variables?: AdCreativeVariables;
  review?: {
    reviewStatus: string;
  };
  changeAuditStamps?: {
    created: { time: number };
    lastModified: { time: number };
  };
  content?: {
    reference?: string;
    textAd?: { text?: string };
    standardUpdateAd?: { reference: string; contentAuthor?: string };
    videoAd?: {
      reference: string;
      contentAuthor?: string;
      preRollMetadata?: Record<string, unknown>;
    };
  };
  metadata?: {
    adFormat?: string;
    adHeadline?: string;
    adIntroductionText?: string;
    adLine?: string;
    landingPage?: string;
    assetURL?: string;
  };
  name?: string;
}

export interface AdCreativeVariables {
  clickUri?: string;
  thumbnailImage?: string;
  textAdImage?: string;
  directSponsoredContent?: string;
}

// Analytics / Reporting
export interface AnalyticsRequest {
  q: "analytics";
  pivot: string;
  timeGranularity?: string;
  dateRange?: DateRange;
  campaigns?: string[];
  campaignGroups?: string[];
  accounts?: string[];
  fields?: string[];
}

export interface AnalyticsRow {
  pivotValues: string[];
  dateRange?: DateRange;
  externalWebsiteConversions?: number;
  externalWebsitePostClickConversions?: number;
  externalWebsitePostViewConversions?: number;
  costInLocalCurrency?: string;
  costInUsd?: string;
  impressions?: number;
  clicks?: number;
  conversions?: number;
  pivot?: string;
  conversionValueInLocalCurrency?: string;
  leads?: number;
  videoCompletions?: number;
  videoViews?: number;
  videoFirstQuartileCompletions?: number;
  videoMidpointCompletions?: number;
  videoThirdQuartileCompletions?: number;
  videoStarts?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  follows?: number;
  totalEngagements?: number;
  approximateUniqueImpressions?: number;
  validationWarnings?: string[];
  averageDwellTime?: number;
  audiencePenetration?: number;
  approximateMemberReach?: number;
  oneClickLeads?: number;
  oneClickLeadFormOpens?: number;
  qualifiedLeads?: number;
  reactions?: number;
  landingPageClicks?: number;
}

export interface AnalyticsResponse {
  elements: AnalyticsRow[];
  paging?: {
    start: number;
    count: number;
    links?: Array<{ type: string; rel: string; href: string }>;
  };
}

// Budget & scheduling
export interface BudgetAmount {
  amount: string;
  currencyCode: string;
}

export interface RunSchedule {
  start: number;
  end?: number;
}

export interface DateRange {
  start: { year: number; month: number; day: number };
  end: { year: number; month: number; day: number };
}

export interface Paging {
  start: number;
  count: number;
  links?: string[];
}

// API Response wrapper
export interface LinkedInApiResponse<T> {
  elements: T[];
  paging?: {
    count: number;
    start: number;
    total?: number;
    links?: Array<{ rel: string; href: string }>;
  };
}

// Demographics
export type DemographicPivot =
  | "MEMBER_JOB_FUNCTION"
  | "MEMBER_SENIORITY"
  | "MEMBER_INDUSTRY"
  | "MEMBER_COMPANY_SIZE"
  | "MEMBER_JOB_TITLE"
  | "MEMBER_COMPANY"
  | "MEMBER_COUNTRY"
  | "MEMBER_COUNTRY_V2"
  | "MEMBER_REGION"
  | "MEMBER_REGION_V2";

export type EntityPivot = "ACCOUNT" | "CAMPAIGN_GROUP" | "CAMPAIGN" | "CREATIVE" | "CONVERSION";

export type TimeGranularity = "ALL" | "DAILY" | "MONTHLY" | "YEARLY";

// Conversions
export interface Conversion {
  id: string;
  name: string;
  account: string;
  type: string;
  enabled: boolean;
  postClickAttributionWindowSize: number;
  viewThroughAttributionWindowSize: number;
  attributionType: string;
  conversionMethod?: string;
}

// Lead Gen
export interface LeadGenForm {
  id: string;
  name: string;
  account: string;
  status: "DRAFT" | "SUBMITTED" | "PUBLISHED" | "ARCHIVED";
  headline: string;
  description?: string;
  thankYouMessage: string;
  landingPageUrl?: string;
  questions?: LeadGenFormQuestion[];
}

export interface LeadGenFormQuestion {
  questionId: number;
  questionType: string;
  questionText: string;
  required: boolean;
  predefinedField?: string;
}

// Audiences
export interface SavedAudience {
  id: string;
  name: string;
  account: string;
  type: "USER" | "COMPANY" | "USER_LIST_UPLOAD" | "COMPANY_LIST_UPLOAD";
  sourcePlatform: "DIRECT_API" | "AGENCY_API" | "PARTNER_API" | "LIST_UPLOAD";
  sourceSegmentId?: string;
  description?: string;
  inputCount?: number;
  destinations?: Array<{
    destination?: string;
    destinationSegmentId?: string;
    status?: string;
    created?: number;
    lastModified?: number;
  }>;
  status?: "ACTIVE" | "EXPIRED" | "PROCESSING" | "FAILED";
  memberCount?: number;
  matchRate?: number;
  created?: number;
  createdAt?: number;
  lastModified: number;
}

// Standard metrics returned by tools
export interface StandardMetrics {
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  frequency: number | null;
  engagements: number;
  engagementRate: number | null;
  ctr: number | null;
  cpm: number | null;
  cpc: number | null;
  conversions: number;
  conversionRate: number | null;
  costPerConversion: number | null;
  audiencePenetration: number | null;
  averageDwellTime: number | null;
}
