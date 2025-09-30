// Add to each PDA account structure:

#[account]
pub struct Venue {
    // ... existing fields ...
    pub bump: u8,  // Store canonical bump
}

#[account]
pub struct Event {
    // ... existing fields ...
    pub bump: u8,  // Store canonical bump
}

// In instruction handlers, store the bump:
let (venue_pda, bump) = Pubkey::find_program_address(
    &[b"venue", venue_id.as_bytes()],
    program_id,
);
venue.bump = bump;  // Store for future validation
