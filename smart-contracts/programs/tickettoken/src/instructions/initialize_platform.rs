use anchor_lang::prelude::*;
use crate::state::Platform;
use crate::errors::TicketTokenError;
use crate::constants::*;

#[derive(Accounts)]
pub struct InitializePlatform<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    
    #[account(
        init,
        payer = owner,
        space = Platform::SIZE,
        seeds = [PLATFORM_SEED],
        bump
    )]
    pub platform: Account<'info, Platform>,
    
    pub system_program: Program<'info, System>,
}

pub fn initialize_platform(
    ctx: Context<InitializePlatform>,
    fee_bps: u16,
    treasury: Pubkey,
) -> Result<()> {
    // Validation Rules
    require!(
        fee_bps <= PLATFORM_FEE_CAP, // Max 10% platform fee
        TicketTokenError::FeeTooHigh
    );
    require!(
        treasury != Pubkey::default(),
        TicketTokenError::InvalidTreasury
    );
    
    // Initialize platform account
    let platform = &mut ctx.accounts.platform;
    platform.owner = ctx.accounts.owner.key();
    platform.fee_bps = fee_bps;
    platform.treasury = treasury;
    platform.paused = false;
    platform.bump = ctx.bumps.platform; // Store bump seed!
    platform.total_venues = 0;
    
    emit!(PlatformInitialized {
        owner: platform.owner,
        fee_bps,
        treasury,
        timestamp: Clock::get()?.unix_timestamp,
    });
    
    msg!("Platform initialized with fee: {}bps", fee_bps);
    
    Ok(())
}

#[event]
pub struct PlatformInitialized {
    pub owner: Pubkey,
    pub fee_bps: u16,
    pub treasury: Pubkey,
    pub timestamp: i64,
}
