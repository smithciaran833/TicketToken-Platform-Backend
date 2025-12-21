import { Schema, model, Document, Types } from 'mongoose';

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

export type EventContentStatus = 'draft' | 'published' | 'archived';

export interface IEventContent extends Document {
  _id: Types.ObjectId;
  eventId: Types.ObjectId;
  contentType: EventContentType;
  status: EventContentStatus;
  content: any;
  displayOrder: number;
  featured: boolean;
  primaryImage: boolean;
  version: number;
  previousVersionId?: Types.ObjectId;
  publishedAt?: Date;
  archivedAt?: Date;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const eventContentSchema = new Schema<IEventContent>(
  {
    eventId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    contentType: {
      type: String,
      enum: [
        'DESCRIPTION',
        'COVER_IMAGE',
        'GALLERY',
        'VIDEO',
        'TRAILER',
        'PERFORMER_BIO',
        'LINEUP',
        'SCHEDULE',
        'FAQ',
        'SPONSOR',
        'PROMOTIONAL',
      ],
      required: true,
    },

    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'draft',
      index: true,
    },

    content: {
      // For DESCRIPTION
      description: {
        short: String,
        full: String,
        highlights: [String],
        tags: [String],
      },

      // For COVER_IMAGE, GALLERY, VIDEO, TRAILER
      media: {
        url: String,
        thumbnailUrl: String,
        type: {
          type: String,
          enum: ['image', 'video'],
        },
        caption: String,
        altText: String,
        dimensions: { width: Number, height: Number },
        duration: Number, // For videos
      },

      // For PERFORMER_BIO
      performer: {
        performerId: String,
        name: String,
        bio: String,
        image: String,
        genre: [String],
        socialMedia: {
          twitter: String,
          instagram: String,
          facebook: String,
          spotify: String,
          website: String,
        },
      },

      // For LINEUP
      lineup: [
        {
          performerId: String,
          name: String,
          role: {
            type: String,
            enum: ['headliner', 'support', 'opener', 'special_guest'],
          },
          setTime: Date,
          duration: Number,
          stage: String,
          order: Number,
        },
      ],

      // For SCHEDULE
      schedule: [
        {
          startTime: Date,
          endTime: Date,
          title: String,
          description: String,
          location: String,
          type: {
            type: String,
            enum: ['performance', 'doors_open', 'intermission', 'meet_greet', 'other'],
          },
        },
      ],

      // For FAQ
      faqs: [
        {
          question: String,
          answer: String,
          category: {
            type: String,
            enum: ['general', 'tickets', 'parking', 'accessibility', 'covid', 'other'],
          },
          order: Number,
        },
      ],

      // For SPONSOR
      sponsor: {
        name: String,
        logo: String,
        website: String,
        tier: {
          type: String,
          enum: ['title', 'platinum', 'gold', 'silver', 'bronze'],
        },
        description: String,
      },

      // For PROMOTIONAL
      promo: {
        title: String,
        description: String,
        image: String,
        ctaText: String,
        ctaLink: String,
        validFrom: Date,
        validUntil: Date,
      },
    },

    displayOrder: {
      type: Number,
      default: 0,
    },

    featured: {
      type: Boolean,
      default: false,
    },

    primaryImage: {
      type: Boolean,
      default: false,
    },

    version: {
      type: Number,
      default: 1,
    },

    previousVersionId: Schema.Types.ObjectId,

    publishedAt: Date,
    archivedAt: Date,

    createdBy: {
      type: String,
      required: true,
    },

    updatedBy: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'event_content',
  }
);

// Indexes
eventContentSchema.index({ eventId: 1, contentType: 1, status: 1 });
eventContentSchema.index({ eventId: 1, status: 1, displayOrder: 1 });
eventContentSchema.index({ contentType: 1, status: 1 });
eventContentSchema.index({ eventId: 1, 'content.media.type': 1 });
eventContentSchema.index({ featured: 1, status: 1 });
eventContentSchema.index({ 'content.lineup.setTime': 1 });
eventContentSchema.index({ archivedAt: 1 }, { expireAfterSeconds: 2592000 }); // 30 day TTL

export const EventContentModel = model<IEventContent>('EventContent', eventContentSchema);
