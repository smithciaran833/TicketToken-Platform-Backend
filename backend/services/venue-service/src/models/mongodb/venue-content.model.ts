import { Schema, model, Document, Types } from 'mongoose';

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

export type VenueContentStatus = 'draft' | 'published' | 'archived';

export interface IVenueContent extends Document {
  _id: Types.ObjectId;
  tenantId: string;
  venueId: string; // FIXED: UUID string from PostgreSQL, not ObjectId
  contentType: VenueContentType;
  status: VenueContentStatus;
  content: any;
  displayOrder: number;
  featured: boolean;
  primaryImage: boolean;
  publishedAt?: Date;
  archivedAt?: Date;
  deletedAt?: Date;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const venueContentSchema = new Schema<IVenueContent>(
  {
    tenantId: {
      type: String,
      required: true,
      index: true,
    },

    venueId: {
      type: String, // FIXED: Store as string (PostgreSQL UUID)
      required: true,
      index: true,
    },

    contentType: {
      type: String,
      enum: [
        'FLOOR_PLAN',
        'SEATING_CHART',
        'PHOTO',
        'VIDEO',
        'VIRTUAL_TOUR',
        'AMENITIES',
        'DIRECTIONS',
        'PARKING_INFO',
        'ACCESSIBILITY_INFO',
        'POLICIES',
        'FAQ',
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
      sections: [
        {
          sectionId: String,
          name: String,
          capacity: Number,
          type: {
            type: String,
            enum: ['seated', 'standing', 'vip', 'accessible'],
          },
          coordinates: {
            x: Number,
            y: Number,
            width: Number,
            height: Number,
          },
          rows: [
            {
              rowId: String,
              name: String,
              seats: [
                {
                  seatId: String,
                  number: String,
                  type: {
                    type: String,
                    enum: ['standard', 'accessible', 'restricted_view', 'premium'],
                  },
                  coordinates: { x: Number, y: Number },
                },
              ],
            },
          ],
        },
      ],

      media: {
        url: String,
        thumbnailUrl: String,
        type: {
          type: String,
          enum: ['exterior', 'interior', 'stage', 'seating', 'amenity', 'view_from_seat'],
        },
        caption: String,
        altText: String,
        dimensions: { width: Number, height: Number },
        sectionId: String,
        rowId: String,
      },

      amenities: [
        {
          type: {
            type: String,
            enum: [
              'parking',
              'food',
              'bar',
              'wifi',
              'atm',
              'restrooms',
              'coat_check',
              'vip_lounge',
              'smoking_area',
            ],
          },
          name: String,
          description: String,
          location: String,
          hours: String,
          pricing: String,
        },
      ],

      accessibility: [
        {
          type: {
            type: String,
            enum: [
              'wheelchair',
              'hearing_assistance',
              'visual_assistance',
              'service_animals',
              'elevator',
              'accessible_parking',
              'accessible_restrooms',
            ],
          },
          description: String,
          location: String,
          contactInfo: String,
        },
      ],

      parking: [
        {
          type: {
            type: String,
            enum: ['onsite', 'nearby', 'street', 'valet'],
          },
          name: String,
          address: String,
          capacity: Number,
          pricing: String,
          hours: String,
          distance: String,
          coordinates: { lat: Number, lng: Number },
        },
      ],

      policies: {
        ageRestrictions: String,
        bagPolicy: String,
        cameraPolicy: String,
        reentryPolicy: String,
        smokingPolicy: String,
        alcoholPolicy: String,
      },

      directions: {
        byTransit: String,
        byCar: String,
        byFoot: String,
        landmarks: String,
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

    publishedAt: Date,
    archivedAt: Date,

    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },

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
    collection: 'venue_content',
  }
);

venueContentSchema.index({ tenantId: 1, venueId: 1, contentType: 1, status: 1 });
venueContentSchema.index({ tenantId: 1, venueId: 1, status: 1, displayOrder: 1 });
venueContentSchema.index({ tenantId: 1, contentType: 1, status: 1 });
venueContentSchema.index({ tenantId: 1, venueId: 1, 'content.media.type': 1 });
venueContentSchema.index({ tenantId: 1, featured: 1, status: 1 });

export const VenueContentModel = model<IVenueContent>('VenueContent', venueContentSchema);
