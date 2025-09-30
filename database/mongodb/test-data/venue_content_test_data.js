// Test data for venue_content collection
print("=== Creating Test Venue Content Data ===");

// Connect to the database
db = db.getSiblingDB('tickettoken');

// Clear any existing test venue data
db.venue_content.deleteMany({ venueId: /^TEST_VENUE_/ });

// Test venues
const testVenues = [
    { id: "TEST_VENUE_001", name: "Madison Square Garden" },
    { id: "TEST_VENUE_002", name: "Barclays Center" },
    { id: "TEST_VENUE_003", name: "MetLife Stadium" }
];

let insertCount = 0;
let errorCount = 0;

// Create various content types for each venue
testVenues.forEach(venue => {
    try {
        // 1. DESCRIPTION
        db.venue_content.insertOne({
            venueId: venue.id,
            contentType: "DESCRIPTION",
            status: "PUBLISHED",
            title: `About ${venue.name}`,
            description: `Overview and history of ${venue.name}`,
            content: {
                text: `${venue.name} is a world-class entertainment venue.`,
                richText: `<h1>${venue.name}</h1><p>A premier destination for sports and entertainment.</p>`
            },
            metadata: {
                language: "en",
                tags: ["venue", "overview", "history"],
                displayOrder: NumberInt(1),
                featured: true,
                lastVerified: new Date()
            },
            usage: {
                views: NumberLong(Math.floor(Math.random() * 10000).toString()),
                downloads: NumberLong("0"),
                lastViewedAt: new Date()
            },
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: "system",
            updatedBy: "system"
        });
        insertCount++;
    } catch (e) {
        print(`Error inserting DESCRIPTION for ${venue.name}: ${e.message}`);
        errorCount++;
    }

    // 2. PHOTO
    for (let i = 1; i <= 3; i++) {
        try {
            db.venue_content.insertOne({
                venueId: venue.id,
                contentType: "PHOTO",
                status: "PUBLISHED",
                title: `${venue.name} Photo ${i}`,
                description: `Professional photo of ${venue.name}`,
                content: {
                    fileUrl: `/images/venues/${venue.id}/photo_${i}.jpg`,
                    thumbnailUrl: `/images/venues/${venue.id}/thumb_${i}.jpg`,
                    mimeType: "image/jpeg",
                    fileSize: NumberLong((1024 * 1024 * (1 + Math.floor(Math.random() * 4))).toString()),
                    dimensions: {
                        width: NumberInt(1920),
                        height: NumberInt(1080)
                    }
                },
                metadata: {
                    tags: ["photo", "gallery", "exterior"],
                    displayOrder: NumberInt(i),
                    featured: (i === 1),
                    lastVerified: new Date()
                },
                usage: {
                    views: NumberLong(Math.floor(Math.random() * 5000).toString()),
                    downloads: NumberLong(Math.floor(Math.random() * 100).toString()),
                    lastViewedAt: new Date()
                },
                createdAt: new Date(),
                updatedAt: new Date(),
                createdBy: "system",
                updatedBy: "system"
            });
            insertCount++;
        } catch (e) {
            print(`Error inserting PHOTO ${i} for ${venue.name}: ${e.message}`);
            errorCount++;
        }
    }

    // 3. FLOOR_PLAN
    try {
        db.venue_content.insertOne({
            venueId: venue.id,
            contentType: "FLOOR_PLAN",
            status: "PUBLISHED",
            title: `${venue.name} Floor Plan`,
            description: `Detailed floor plan of ${venue.name}`,
            content: {
                fileUrl: `/images/venues/${venue.id}/floor_plan.pdf`,
                thumbnailUrl: `/images/venues/${venue.id}/floor_plan_thumb.jpg`,
                mimeType: "application/pdf",
                fileSize: NumberLong((1024 * 1024 * 2.5).toString())
            },
            metadata: {
                tags: ["floor plan", "layout", "map"],
                displayOrder: NumberInt(1),
                featured: true,
                lastVerified: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000)
            },
            usage: {
                views: NumberLong(Math.floor(Math.random() * 3000).toString()),
                downloads: NumberLong(Math.floor(Math.random() * 500).toString()),
                lastViewedAt: new Date()
            },
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: "system",
            updatedBy: "system"
        });
        insertCount++;
    } catch (e) {
        print(`Error inserting FLOOR_PLAN for ${venue.name}: ${e.message}`);
        errorCount++;
    }

    // 4. SEATING_CHART
    try {
        db.venue_content.insertOne({
            venueId: venue.id,
            contentType: "SEATING_CHART",
            status: "PUBLISHED",
            title: `${venue.name} Seating Chart`,
            description: `Interactive seating chart for ${venue.name}`,
            content: {
                fileUrl: `/images/venues/${venue.id}/seating_chart.svg`,
                thumbnailUrl: `/images/venues/${venue.id}/seating_thumb.jpg`,
                mimeType: "image/svg+xml",
                seatingData: {
                    totalCapacity: NumberInt(20000 + Math.floor(Math.random() * 10000)),
                    sections: [
                        {
                            sectionId: "SEC_100",
                            name: "Lower Bowl",
                            capacity: NumberInt(8000),
                            rows: NumberInt(20),
                            seatsPerRow: NumberInt(40)
                        },
                        {
                            sectionId: "SEC_200",
                            name: "Upper Bowl",
                            capacity: NumberInt(12000),
                            rows: NumberInt(30),
                            seatsPerRow: NumberInt(40)
                        },
                        {
                            sectionId: "SEC_300",
                            name: "Suite Level",
                            capacity: NumberInt(2000),
                            rows: NumberInt(10),
                            seatsPerRow: NumberInt(20)
                        }
                    ],
                    accessibleSeats: NumberInt(200),
                    vipSeats: NumberInt(500)
                }
            },
            metadata: {
                tags: ["seating", "capacity", "chart"],
                displayOrder: NumberInt(1),
                featured: true,
                lastVerified: new Date()
            },
            usage: {
                views: NumberLong(Math.floor(Math.random() * 8000).toString()),
                downloads: NumberLong(Math.floor(Math.random() * 200).toString()),
                lastViewedAt: new Date()
            },
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: "system",
            updatedBy: "system"
        });
        insertCount++;
    } catch (e) {
        print(`Error inserting SEATING_CHART for ${venue.name}: ${e.message}`);
        errorCount++;
    }

    // 5. AMENITIES
    try {
        db.venue_content.insertOne({
            venueId: venue.id,
            contentType: "AMENITIES",
            status: "PUBLISHED",
            title: `${venue.name} Amenities`,
            description: `Available amenities at ${venue.name}`,
            content: {
                amenityList: [
                    {
                        name: "Parking",
                        description: "On-site parking available",
                        icon: "parking",
                        available: true
                    },
                    {
                        name: "Concessions",
                        description: "Multiple food and beverage options",
                        icon: "restaurant",
                        available: true
                    },
                    {
                        name: "WiFi",
                        description: "Free WiFi throughout the venue",
                        icon: "wifi",
                        available: true
                    },
                    {
                        name: "Wheelchair Access",
                        description: "Full wheelchair accessibility",
                        icon: "accessible",
                        available: true
                    },
                    {
                        name: "ATM",
                        description: "ATMs located on each level",
                        icon: "atm",
                        available: true
                    }
                ]
            },
            metadata: {
                tags: ["amenities", "facilities", "services"],
                displayOrder: NumberInt(1),
                lastVerified: new Date()
            },
            usage: {
                views: NumberLong(Math.floor(Math.random() * 2000).toString()),
                downloads: NumberLong("0"),
                lastViewedAt: new Date()
            },
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: "system",
            updatedBy: "system"
        });
        insertCount++;
    } catch (e) {
        print(`Error inserting AMENITIES for ${venue.name}: ${e.message}`);
        errorCount++;
    }

    // 6. VIRTUAL_TOUR
    try {
        db.venue_content.insertOne({
            venueId: venue.id,
            contentType: "VIRTUAL_TOUR",
            status: "PUBLISHED",
            title: `${venue.name} Virtual Tour`,
            description: `360° virtual tour of ${venue.name}`,
            content: {
                tourData: {
                    tourUrl: `https://virtualtour.example.com/${venue.id}`,
                    provider: "Matterport",
                    embedCode: `<iframe src="https://virtualtour.example.com/embed/${venue.id}"></iframe>`
                }
            },
            metadata: {
                tags: ["virtual tour", "360", "interactive"],
                displayOrder: NumberInt(1),
                featured: true,
                lastVerified: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
            },
            usage: {
                views: NumberLong(Math.floor(Math.random() * 4000).toString()),
                downloads: NumberLong("0"),
                lastViewedAt: new Date()
            },
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: "system",
            updatedBy: "system"
        });
        insertCount++;
    } catch (e) {
        print(`Error inserting VIRTUAL_TOUR for ${venue.name}: ${e.message}`);
        errorCount++;
    }

    // 7. PARKING_MAP
    try {
        db.venue_content.insertOne({
            venueId: venue.id,
            contentType: "PARKING_MAP",
            status: "PUBLISHED",
            title: `${venue.name} Parking Map`,
            description: `Parking facilities map for ${venue.name}`,
            content: {
                fileUrl: `/images/venues/${venue.id}/parking_map.pdf`,
                thumbnailUrl: `/images/venues/${venue.id}/parking_thumb.jpg`,
                mimeType: "application/pdf",
                fileSize: NumberLong((1024 * 512).toString())
            },
            metadata: {
                tags: ["parking", "map", "directions"],
                displayOrder: NumberInt(1),
                lastVerified: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000)
            },
            usage: {
                views: NumberLong(Math.floor(Math.random() * 1500).toString()),
                downloads: NumberLong(Math.floor(Math.random() * 300).toString()),
                lastViewedAt: new Date()
            },
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: "system",
            updatedBy: "system"
        });
        insertCount++;
    } catch (e) {
        print(`Error inserting PARKING_MAP for ${venue.name}: ${e.message}`);
        errorCount++;
    }

    // 8. CONTACT
    try {
        db.venue_content.insertOne({
            venueId: venue.id,
            contentType: "CONTACT",
            status: "PUBLISHED",
            title: `${venue.name} Contact Information`,
            description: `Contact details for ${venue.name}`,
            content: {
                contactInfo: {
                    phone: "+1 (212) 555-" + Math.floor(1000 + Math.random() * 9000),
                    email: `info@${venue.id.toLowerCase()}.com`,
                    website: `https://www.${venue.id.toLowerCase()}.com`,
                    address: {
                        street: "123 Main Street",
                        city: "New York",
                        state: "NY",
                        zipCode: "10001",
                        country: "USA"
                    }
                }
            },
            metadata: {
                tags: ["contact", "info", "address"],
                displayOrder: NumberInt(1),
                lastVerified: new Date()
            },
            usage: {
                views: NumberLong(Math.floor(Math.random() * 1000).toString()),
                downloads: NumberLong("0"),
                lastViewedAt: new Date()
            },
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: "system",
            updatedBy: "system"
        });
        insertCount++;
    } catch (e) {
        print(`Error inserting CONTACT for ${venue.name}: ${e.message}`);
        errorCount++;
    }
});

// Add a draft content for testing
try {
    db.venue_content.insertOne({
        venueId: "TEST_VENUE_001",
        contentType: "RULES",
        status: "DRAFT",
        title: "Venue Rules and Regulations",
        description: "Draft rules document",
        content: {
            text: "Draft content for venue rules..."
        },
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: "system",
        updatedBy: "system"
    });
    insertCount++;
} catch (e) {
    print(`Error inserting RULES draft: ${e.message}`);
    errorCount++;
}

// Summary
const summary = db.venue_content.aggregate([
    { $match: { venueId: /^TEST_VENUE_/ } },
    { $group: {
        _id: "$contentType",
        count: { $sum: 1 },
        statuses: { $addToSet: "$status" }
    }},
    { $sort: { _id: 1 } }
]).toArray();

print("\n✓ Test data creation completed!");
print(`  Successful inserts: ${insertCount}`);
print(`  Failed inserts: ${errorCount}`);
print("\nContent Summary:");
summary.forEach(s => {
    print(`  ${s._id}: ${s.count} documents (${s.statuses.join(", ")})`);
});

const totalDocs = db.venue_content.countDocuments({ venueId: /^TEST_VENUE_/ });
print(`\nTotal test documents created: ${totalDocs}`);

// Test the views
print("\nTesting views:");
print(`  venue_gallery: ${db.venue_gallery.countDocuments({})} docs`);
print(`  venue_capacity: ${db.venue_capacity.countDocuments({})} docs`);
print(`  venue_verification: ${db.venue_verification.countDocuments({})} docs`);
