import { Schema, model, Document, Types } from 'mongoose';

export type MarketingContentType =
  | 'BANNER'
  | 'EMAIL_TEMPLATE'
  | 'PUSH_TEMPLATE'
  | 'SOCIAL_POST'
  | 'LANDING_PAGE'
  | 'POPUP'
  | 'ADVERTISEMENT';

export type CampaignStatus = 'draft' | 'scheduled' | 'active' | 'paused' | 'completed' | 'archived';

export interface IMarketingContent extends Document {
  _id: Types.ObjectId;
  campaignId: string;
  contentType: MarketingContentType;
  status: CampaignStatus;
  name: string;
  
  targeting: {
    audienceSegments: string[];
    demographics: {
      ageMin?: number;
      ageMax?: number;
      genders?: string[];
      locations?: string[];
    };
    behavioral: {
      purchaseHistory?: string[];
      eventPreferences?: string[];
      engagementLevel?: string;
    };
    venueIds?: string[];
    eventIds?: string[];
  };
  
  scheduling: {
    startDate: Date;
    endDate: Date;
    timezone: string;
    frequency?: string;
    daysOfWeek?: number[];
    timeSlots?: { start: string; end: string }[];
  };
  
  content: {
    subject?: string;
    headline?: string;
    body: string;
    imageUrl?: string;
    ctaText?: string;
    ctaLink?: string;
    template?: string;
    variables?: Record<string, any>;
  };
  
  abTest?: {
    enabled: boolean;
    variants: Array<{
      variantId: string;
      name: string;
      weight: number;
      content: any;
      impressions: number;
      clicks: number;
      conversions: number;
      revenue: number;
    }>;
    testDuration: number;
    winnerDeclaredAt?: Date;
    winnerVariantId?: string;
  };
  
  performance: {
    impressions: number;
    clicks: number;
    conversions: number;
    revenue: number;
    ctr: number;
    conversionRate: number;
    roi: number;
    lastUpdated: Date;
  };
  
  budget: {
    total: number;
    spent: number;
    currency: string;
    costPerImpression?: number;
    costPerClick?: number;
  };
  
  createdBy: string;
  updatedBy: string;
  publishedAt?: Date;
  pausedAt?: Date;
  completedAt?: Date;
  archivedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const marketingContentSchema = new Schema<IMarketingContent>(
  {
    campaignId: {
      type: String,
      required: true,
      index: true,
    },

    contentType: {
      type: String,
      enum: ['BANNER', 'EMAIL_TEMPLATE', 'PUSH_TEMPLATE', 'SOCIAL_POST', 'LANDING_PAGE', 'POPUP', 'ADVERTISEMENT'],
      required: true,
    },

    status: {
      type: String,
      enum: ['draft', 'scheduled', 'active', 'paused', 'completed', 'archived'],
      default: 'draft',
      index: true,
    },

    name: {
      type: String,
      required: true,
    },

    targeting: {
      audienceSegments: [String],
      demographics: {
        ageMin: Number,
        ageMax: Number,
        genders: [String],
        locations: [String],
      },
      behavioral: {
        purchaseHistory: [String],
        eventPreferences: [String],
        engagementLevel: String,
      },
      venueIds: [String],
      eventIds: [String],
    },

    scheduling: {
      startDate: {
        type: Date,
        required: true,
      },
      endDate: {
        type: Date,
        required: true,
      },
      timezone: {
        type: String,
        default: 'UTC',
      },
      frequency: String,
      daysOfWeek: [Number],
      timeSlots: [{ start: String, end: String }],
    },

    content: {
      subject: String,
      headline: String,
      body: {
        type: String,
        required: true,
      },
      imageUrl: String,
      ctaText: String,
      ctaLink: String,
      template: String,
      variables: Schema.Types.Mixed,
    },

    abTest: {
      enabled: {
        type: Boolean,
        default: false,
      },
      variants: [{
        variantId: String,
        name: String,
        weight: Number,
        content: Schema.Types.Mixed,
        impressions: { type: Number, default: 0 },
        clicks: { type: Number, default: 0 },
        conversions: { type: Number, default: 0 },
        revenue: { type: Number, default: 0 },
      }],
      testDuration: Number,
      winnerDeclaredAt: Date,
      winnerVariantId: String,
    },

    performance: {
      impressions: { type: Number, default: 0 },
      clicks: { type: Number, default: 0 },
      conversions: { type: Number, default: 0 },
      revenue: { type: Number, default: 0 },
      ctr: { type: Number, default: 0 },
      conversionRate: { type: Number, default: 0 },
      roi: { type: Number, default: 0 },
      lastUpdated: { type: Date, default: Date.now },
    },

    budget: {
      total: { type: Number, default: 0 },
      spent: { type: Number, default: 0 },
      currency: { type: String, default: 'USD' },
      costPerImpression: Number,
      costPerClick: Number,
    },

    createdBy: {
      type: String,
      required: true,
    },

    updatedBy: {
      type: String,
      required: true,
    },

    publishedAt: Date,
    pausedAt: Date,
    completedAt: Date,
    archivedAt: Date,
  },
  {
    timestamps: true,
    collection: 'marketing_content',
  }
);

// Indexes
marketingContentSchema.index({ campaignId: 1, status: 1 });
marketingContentSchema.index({ contentType: 1, status: 1 });
marketingContentSchema.index({ 'scheduling.startDate': 1, 'scheduling.endDate': 1 });
marketingContentSchema.index({ status: 1, 'scheduling.startDate': 1 });
marketingContentSchema.index({ 'targeting.venueIds': 1 });
marketingContentSchema.index({ 'targeting.eventIds': 1 });
marketingContentSchema.index({ archivedAt: 1 }, { expireAfterSeconds: 7776000 }); // 90 day TTL

export const MarketingContentModel = model<IMarketingContent>('MarketingContent', marketingContentSchema);
