// Venue Content Collection - Quick Reference Guide

// === Common Queries ===

// Get all published content for a venue
db.venue_content.find({ 
    venueId: "VENUE_ID", 
    status: "PUBLISHED" 
}).sort({ "metadata.displayOrder": 1 });

// Get venue photos
db.venue_content.find({ 
    venueId: "VENUE_ID", 
    contentType: "PHOTO", 
    status: "PUBLISHED" 
});

// Search content by text
db.venue_content.find({ 
    $text: { $search: "wheelchair accessible" } 
});

// Get featured content
db.venue_content.find({ 
    "metadata.featured": true, 
    status: "PUBLISHED" 
});

// === Using Views ===

// Get venue gallery
db.venue_gallery.find({ venueId: "VENUE_ID" });

// Get venue capacity info
db.venue_capacity.findOne({ venueId: "VENUE_ID" });

// Get content needing verification
db.venue_verification.find({ venueId: "VENUE_ID" });

// === Update Operations ===

// Update content verification
db.venue_content.updateOne(
    { _id: ObjectId("...") },
    { 
        $set: { 
            "metadata.lastVerified": new Date(),
            updatedAt: new Date()
        }
    }
);

// Increment view count
db.venue_content.updateOne(
    { _id: ObjectId("...") },
    { 
        $inc: { "usage.views": 1 },
        $set: { "usage.lastViewedAt": new Date() }
    }
);

// Archive content
db.venue_content.updateMany(
    { venueId: "VENUE_ID" },
    { 
        $set: { 
            status: "ARCHIVED",
            "metadata.expiresAt": new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        }
    }
);

// === Aggregations ===

// Content statistics by type
db.venue_content.aggregate([
    { $match: { venueId: "VENUE_ID" } },
    { $group: {
        _id: "$contentType",
        count: { $sum: 1 },
        totalViews: { $sum: "$usage.views" },
        avgViews: { $avg: "$usage.views" }
    }},
    { $sort: { totalViews: -1 } }
]);

// Popular content
db.venue_content.find({ 
    venueId: "VENUE_ID",
    status: "PUBLISHED"
}).sort({ "usage.views": -1 }).limit(10);

// Content by language
db.venue_content.aggregate([
    { $match: { status: "PUBLISHED" } },
    { $group: {
        _id: "$metadata.language",
        count: { $sum: 1 }
    }}
]);
