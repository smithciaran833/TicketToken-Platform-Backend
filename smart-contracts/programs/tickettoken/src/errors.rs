use anchor_lang::prelude::*;

#[error_code]
pub enum TicketTokenError {
    // Tree/Compression errors
    #[msg("Invalid tree depth")]
    InvalidTreeDepth,
    #[msg("Invalid buffer size")]
    InvalidBufferSize,
    #[msg("Invalid canopy depth")]
    InvalidCanopyDepth,
    #[msg("Clock error")]
    ClockError,
    
    // Platform errors
    #[msg("Fee too high")]
    FeeTooHigh,
    #[msg("Invalid treasury address")]
    InvalidTreasury,
    #[msg("Unauthorized")]
    Unauthorized,
    
    // Venue errors
    #[msg("Venue ID too long")]
    VenueIdTooLong,
    #[msg("Venue name too long")]
    VenueNameTooLong,
    #[msg("Invalid venue ID")]
    InvalidVenueId,
    #[msg("Venue not verified")]
    VenueNotVerified,
    #[msg("Venue inactive")]
    VenueInactive,
    #[msg("Already verified")]
    AlreadyVerified,
    #[msg("Unauthorized venue")]
    UnauthorizedVenue,
    
    // Event errors
    #[msg("Invalid event venue")]
    InvalidEventVenue,
    #[msg("Invalid capacity")]
    InvalidCapacity,
    #[msg("Invalid event name")]
    InvalidEventName,
    #[msg("Description too long")]
    DescriptionTooLong,
    #[msg("Event already started")]
    EventAlreadyStarted,
    #[msg("Start time too soon")]
    StartTimeTooSoon,
    #[msg("End before start")]
    EndBeforeStart,
    #[msg("Event too long")]
    EventTooLong,
    
    // Ticket/Purchase errors
    #[msg("Invalid quantity")]
    InvalidQuantity,
    #[msg("Insufficient tickets")]
    InsufficientTickets,
    
    // Price errors
    #[msg("URI too long")]
    UriTooLong,
    #[msg("Price too low")]
    PriceTooLow,
    #[msg("Price too high")]
    PriceTooHigh,
    #[msg("Price exceeds maximum")]
    PriceExceedsMax,
    
    // Marketplace errors
    #[msg("Resale not allowed")]
    ResaleNotAllowed,
    #[msg("Invalid expiry")]
    InvalidExpiry,
    
    // Math/Validation errors
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Invalid characters")]
    InvalidCharacters,
    #[msg("Refund window too long")]
    RefundWindowTooLong,
    
    // Reentrancy
    #[msg("Reentrancy locked")]
    ReentrancyLocked,
    
    // Royalty/Ticket errors (Week 1 additions)
    #[msg("Invalid royalty percentage - total must not exceed 100%")]
    InvalidRoyaltyPercentage,
    
    #[msg("Ticket has already been used")]
    TicketAlreadyUsed,
    
    #[msg("Invalid ticket for this event")]
    InvalidTicket,
    
    #[msg("Ticket transfer not allowed for this event")]
    TransferNotAllowed,
    
    #[msg("Owner ID exceeds maximum length")]
    OwnerIdTooLong,
}
