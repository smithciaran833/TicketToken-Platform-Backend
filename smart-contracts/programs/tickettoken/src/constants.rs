// Based on research findings
pub const MAX_VENUE_NAME: usize = 64;
pub const MAX_EVENT_NAME: usize = 32;
pub const MAX_DESCRIPTION: usize = 200;
pub const MAX_URI_LENGTH: usize = 64;
pub const MAX_BATCH_MINT: usize = 15;        // 95% success rate
pub const MAX_COMPUTE_UNITS: u32 = 200_000;  // Target limit
pub const TREE_CAPACITY: u32 = 16_384;        // 2^14

// Seeds
pub const PLATFORM_SEED: &[u8] = b"platform";
pub const VENUE_SEED: &[u8] = b"venue";
pub const EVENT_SEED: &[u8] = b"event";

// Financial constants
pub const MIN_TICKET_PRICE: u64 = 100_000;                // 0.0001 SOL
pub const MAX_TICKET_PRICE: u64 = 1_000_000_000_000;     // 1000 SOL
pub const PLATFORM_FEE_CAP: u16 = 1000;                   // 10% max
pub const RESALE_PRICE_CAP_MULTIPLIER: u16 = 110;        // 110% max markup

// Compressed NFT tree configuration
pub const TREE_MAX_DEPTH: u8 = 14;           // 16,384 tickets
pub const TREE_MAX_BUFFER_SIZE: u32 = 256;   // Concurrent operations
pub const TREE_CANOPY_DEPTH: u8 = 17;        // Optimized for proof size
pub const MAX_TICKET_PURCHASE: u8 = 10;

// Cross-program IDs
pub const MARKETPLACE_PROGRAM_ID: &str = "MKT2222222222222222222222222222222222222222";
