import { Types } from 'mongoose';

/**
 * Base interface for all content documents
 */
export interface BaseContentDocument {
  _id: Types.ObjectId;
  status: 'draft' | 'published' | 'archived';
  version: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}

/**
 * Base content status types
 */
export type BaseContentStatus = 'draft' | 'published' | 'archived';

/**
 * Venue Content Types
 */
export type VenueContentType =
  | 'FLOOR_PLAN'
  | 'SEATING_CHART'
  | 'PHOTO'
  | 'VIDEO'
  | 'VIRTUAL_TOUR'
  | 'AMENITIES'
  | 'DIRECTIONS'
  | 'PARKING_INFO'
  | 'ACCESSIBILITY_INFO'
  | 'POLICIES'
  | 'FAQ';

export interface VenueSeatingSection {
  sectionId: string;
  name: string;
  capacity: number;
  type: 'seated' | 'standing' | 'vip' | 'accessible';
  coordinates: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  rows?: VenueSeatingRow[];
}

export interface VenueSeatingRow {
  rowId: string;
  name: string;
  seats: VenueSeatingItem[];
}

export interface VenueSeatingItem {
  seatId: string;
  number: string;
  type: 'standard' | 'accessible' | 'restricted_view' | 'premium';
  coordinates: {
    x: number;
    y: number;
  };
}

export interface VenueMediaContent {
  url: string;
  thumbnailUrl?: string;
  type: 'exterior' | 'interior' | 'stage' | 'seating' | 'amenity' | 'view_from_seat';
  caption?: string;
  altText?: string;
  dimensions?: {
    width: number;
    height: number;
  };
  sectionId?: string;
  rowId?: string;
}

export interface VenueAmenity {
  type: 'parking' | 'food' | 'bar' | 'wifi' | 'atm' | 'restrooms' | 'coat_check' | 'vip_lounge' | 'smoking_area';
  name: string;
  description?: string;
  location?: string;
  hours?: string;
  pricing?: string;
}

export interface VenueAccessibility {
  type:
    | 'wheelchair'
    | 'hearing_assistance'
    | 'visual_assistance'
    | 'service_animals'
    | 'elevator'
    | 'accessible_parking'
    | 'accessible_restrooms';
  description: string;
  location?: string;
  contactInfo?: string;
}

export interface VenueParking {
  type: 'onsite' | 'nearby' | 'street' | 'valet';
  name: string;
  address?: string;
  capacity?: number;
  pricing?: string;
  hours?: string;
  distance?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
}

export interface VenuePolicies {
  ageRestrictions?: string;
  bagPolicy?: string;
  cameraPolicy?: string;
  reentryPolicy?: string;
  smokingPolicy?: string;
  alcoholPolicy?: string;
}

export interface VenueDirections {
  byTransit?: string;
  byCar?: string;
  byFoot?: string;
  landmarks?: string;
}

export interface VenueContentData {
  sections?: VenueSeatingSection[];
  media?: VenueMediaContent;
  amenities?: VenueAmenity[];
  accessibility?: VenueAccessibility[];
  parking?: VenueParking[];
  policies?: VenuePolicies;
  directions?: VenueDirections;
}

export interface VenueContent extends BaseContentDocument {
  venueId: Types.ObjectId;
  contentType: VenueContentType;
  content: VenueContentData;
  displayOrder: number;
  featured: boolean;
  primaryImage?: boolean;
  previousVersionId?: Types.ObjectId;
  publishedAt?: Date;
  archivedAt?: Date;
}

/**
 * Event Content Types
 */
export type EventContentType =
  | 'DESCRIPTION'
  | 'COVER_IMAGE'
  | 'GALLERY'
  | 'VIDEO'
  | 'TRAILER'
  | 'PERFORMER_BIO'
  | 'LINEUP'
  | 'SCHEDULE'
  | 'FAQ'
  | 'SPONSOR'
  | 'PROMOTIONAL';

export interface EventDescription {
  short?: string;
  full?: string;
  highlights?: string[];
  ageRestriction?: string;
  language?: string;
}

export interface EventMediaContent {
  url: string;
  thumbnailUrl?: string;
  type: 'cover' | 'gallery' | 'poster' | 'banner' | 'social';
  caption?: string;
  altText?: string;
  dimensions?: {
    width: number;
    height: number;
  };
  focalPoint?: {
    x: number;
    y: number;
  };
  credit?: string;
}

export interface EventVideoContent {
  url: string;
  platform: 'youtube' | 'vimeo' | 'hosted' | 'tiktok';
  embedCode?: string;
  thumbnailUrl?: string;
  duration?: number;
  caption?: string;
}

export interface EventPerformer {
  performerId: string;
  name: string;
  role: 'headliner' | 'support' | 'opener' | 'special_guest' | 'dj' | 'host';
  bio?: string;
  photoUrl?: string;
  socialLinks?: {
    website?: string;
    instagram?: string;
    twitter?: string;
    spotify?: string;
    youtube?: string;
  };
  genres?: string[];
  setTime?: Date;
  setDuration?: number;
}

export interface EventLineupItem {
  performerId: string;
  name: string;
  role?: string;
  order: number;
  day?: Date;
  stage?: string;
  setTime?: Date;
  setDuration?: number;
}

export interface EventScheduleItem {
  time: Date;
  title: string;
  description?: string;
  location?: string;
  type: 'doors' | 'performance' | 'intermission' | 'meet_greet' | 'vip' | 'other';
}

export interface EventSponsor {
  name: string;
  level: 'presenting' | 'platinum' | 'gold' | 'silver' | 'partner';
  logoUrl?: string;
  websiteUrl?: string;
  description?: string;
}

export interface EventPromotional {
  headline?: string;
  subheadline?: string;
  ctaText?: string;
  ctaUrl?: string;
  promoCode?: string;
  validUntil?: Date;
}

export interface EventContentData {
  description?: EventDescription;
  media?: EventMediaContent;
  video?: EventVideoContent;
  performer?: EventPerformer;
  lineup?: EventLineupItem[];
  schedule?: EventScheduleItem[];
  sponsor?: EventSponsor;
  promotional?: EventPromotional;
}

export interface EventContent extends BaseContentDocument {
  eventId: Types.ObjectId;
  contentType: EventContentType;
  content: EventContentData;
  displayOrder: number;
  featured: boolean;
  previousVersionId?: Types.ObjectId;
  publishedAt?: Date;
  expiresAt?: Date;
}

/**
 * User Content Types (Reviews, Ratings, Photos, Tips)
 */
export type UserContentType = 'REVIEW' | 'RATING' | 'PHOTO' | 'VIDEO' | 'COMMENT' | 'CHECK_IN' | 'TIP';

export type UserContentTargetType = 'event' | 'venue' | 'performer' | 'ticket';

export type UserContentStatus = 'pending' | 'approved' | 'rejected' | 'flagged' | 'removed';

export interface UserReviewContent {
  title?: string;
  body?: string;
  pros?: string[];
  cons?: string[];
  recommendsTo?: string[];
  attendedDate?: Date;
  verifiedAttendee?: boolean;
}

export interface UserRatingContent {
  overall?: number;
  categories?: {
    value?: number;
    atmosphere?: number;
    sound?: number;
    sightlines?: number;
    service?: number;
    cleanliness?: number;
    accessibility?: number;
    parking?: number;
    foodAndDrink?: number;
  };
}

export interface UserMediaContent {
  url: string;
  thumbnailUrl?: string;
  caption?: string;
  takenAt?: Date;
  location?: {
    section?: string;
    row?: string;
    seat?: string;
  };
  tags?: string[];
}

export interface UserTipContent {
  category: 'parking' | 'food' | 'seating' | 'arrival' | 'accessibility' | 'other';
  title?: string;
  body: string;
}

export interface UserContentData {
  review?: UserReviewContent;
  rating?: UserRatingContent;
  media?: UserMediaContent;
  tip?: UserTipContent;
}

export interface EngagementMetrics {
  helpfulCount: number;
  notHelpfulCount: number;
  reportCount: number;
  shareCount: number;
  commentCount: number;
}

export type FlagType = 'spam' | 'offensive' | 'fake' | 'irrelevant' | 'copyright';

export interface ContentFlag {
  type: FlagType;
  reportedBy: string;
  reportedAt: Date;
}

export interface ModerationData {
  autoScore?: number;
  manualReview?: boolean;
  reviewedBy?: string;
  reviewedAt?: Date;
  rejectionReason?: string;
  flags?: ContentFlag[];
}

export interface UserContent extends BaseContentDocument {
  userId: Types.ObjectId;
  targetType: UserContentTargetType;
  targetId: Types.ObjectId;
  contentType: UserContentType;
  content: UserContentData;
  engagement: EngagementMetrics;
  moderation: ModerationData;
}

/**
 * Marketing Content Types
 */
export type MarketingContentType =
  | 'BANNER'
  | 'EMAIL_TEMPLATE'
  | 'PUSH_TEMPLATE'
  | 'SOCIAL_POST'
  | 'LANDING_PAGE'
  | 'POPUP'
  | 'ADVERTISEMENT';

export type MarketingContentStatus = 'draft' | 'scheduled' | 'active' | 'paused' | 'completed' | 'archived';

export interface TargetingConfig {
  audiences?: string[];
  locations?: string[];
  devices?: 'all' | 'mobile' | 'desktop';
  platforms?: 'all' | 'ios' | 'android' | 'web';
  languages?: string[];
}

export interface DayParting {
  dayOfWeek: number;
  startHour: number;
  endHour: number;
}

export interface SchedulingConfig {
  startDate?: Date;
  endDate?: Date;
  timezone?: string;
  dayParting?: DayParting[];
}

export interface CreativeContent {
  headline?: string;
  subheadline?: string;
  body?: string;
  ctaText?: string;
  ctaUrl?: string;
  imageUrl?: string;
  mobileImageUrl?: string;
  backgroundColor?: string;
  textColor?: string;
}

export interface EmailContent {
  subject?: string;
  preheader?: string;
  htmlBody?: string;
  textBody?: string;
  fromName?: string;
  replyTo?: string;
}

export interface PushContent {
  title: string;
  body: string;
  imageUrl?: string;
  deepLink?: string;
  actionButtons?: Array<{
    text: string;
    action: string;
  }>;
}

export interface SocialContent {
  platform: 'facebook' | 'instagram' | 'twitter' | 'tiktok';
  text?: string;
  mediaUrls?: string[];
  hashtags?: string[];
  mentions?: string[];
}

export interface ABTestVariant {
  variantId: string;
  name: string;
  weight: number;
  content: any;
}

export interface ABTestConfig {
  enabled: boolean;
  testName?: string;
  variants?: ABTestVariant[];
  winningVariant?: string;
  testEndDate?: Date;
}

export interface PerformanceMetrics {
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  ctr?: number;
  conversionRate?: number;
  costPerClick?: number;
  costPerConversion?: number;
  roas?: number;
}

export interface BudgetConfig {
  total?: number;
  spent: number;
  daily?: number;
}

export interface MarketingContentData {
  creative?: CreativeContent;
  email?: EmailContent;
  push?: PushContent;
  social?: SocialContent;
}

export interface MarketingContent {
  _id: Types.ObjectId;
  campaignId: Types.ObjectId;
  contentType: MarketingContentType;
  status: MarketingContentStatus;
  version: number;
  targeting: TargetingConfig;
  scheduling: SchedulingConfig;
  content: MarketingContentData;
  abTest: ABTestConfig;
  performance: PerformanceMetrics;
  budget: BudgetConfig;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  publishedAt?: Date;
}

/**
 * Rating Summary (for aggregations)
 */
export interface RatingSummary {
  targetType: UserContentTargetType;
  targetId: Types.ObjectId;
  averageRating: number;
  totalRatings: number;
  ratingDistribution: {
    5: number;
    4: number;
    3: number;
    2: number;
    1: number;
  };
  categoryAverages?: {
    value?: number;
    atmosphere?: number;
    sound?: number;
    sightlines?: number;
    service?: number;
    cleanliness?: number;
    accessibility?: number;
    parking?: number;
    foodAndDrink?: number;
  };
  lastUpdated: Date;
}

/**
 * Pagination and Query Options
 */
export interface PaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface QueryOptions extends PaginationOptions {
  filter?: Record<string, any>;
  populate?: string | string[];
  select?: string | string[];
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

/**
 * Connection Options
 */
export interface MongoConnectionOptions {
  maxPoolSize?: number;
  minPoolSize?: number;
  retryWrites?: boolean;
  retryReads?: boolean;
  connectTimeoutMS?: number;
  socketTimeoutMS?: number;
  serverSelectionTimeoutMS?: number;
}

/**
 * Bulk Operation Results
 */
export interface BulkOperationResult {
  success: boolean;
  insertedCount?: number;
  modifiedCount?: number;
  deletedCount?: number;
  errors?: Array<{
    index: number;
    error: string;
  }>;
}
