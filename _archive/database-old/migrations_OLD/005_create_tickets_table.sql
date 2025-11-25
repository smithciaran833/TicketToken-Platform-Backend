-- Patch: ensure is_transferable column exists on tables used by partial indexes
DO $patch$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='tickets') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public'
                     AND table_name='tickets'
                     AND column_name='is_transferable') THEN
      EXECUTE 'ALTER TABLE public.tickets ADD COLUMN is_transferable BOOLEAN DEFAULT TRUE';


    END IF;


  END IF;


END
$patch$;



-- Patch: ensure is_valid column exists on tables used by partial indexes
DO $patch$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='tickets') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public'
                     AND table_name='tickets'
                     AND column_name='is_valid') THEN
      EXECUTE 'ALTER TABLE public.tickets ADD COLUMN is_valid BOOLEAN DEFAULT TRUE';


    END IF;


  END IF;


END
$patch$;



DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='tickets') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public'
                     AND table_name='tickets'
                     AND column_name='mint_address') THEN
      EXECUTE 'ALTER TABLE public.tickets ADD COLUMN mint_address TEXT';


    END IF;


  END IF;


END
$$;



DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='ticket_refunds') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public'
                     AND table_name='ticket_refunds'
                     AND column_name='status') THEN
      EXECUTE 'ALTER TABLE public.ticket_refunds ADD COLUMN status TEXT NOT NULL DEFAULT ''active''';


    END IF;


  END IF;


  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='ticket_transactions') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public'
                     AND table_name='ticket_transactions'
                     AND column_name='status') THEN
      EXECUTE 'ALTER TABLE public.ticket_transactions ADD COLUMN status TEXT NOT NULL DEFAULT ''active''';


    END IF;


  END IF;


  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='ticket_transfers') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public'
                     AND table_name='ticket_transfers'
                     AND column_name='status') THEN
      EXECUTE 'ALTER TABLE public.ticket_transfers ADD COLUMN status TEXT NOT NULL DEFAULT ''active''';


    END IF;


  END IF;


  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='tickets') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public'
                     AND table_name='tickets'
                     AND column_name='status') THEN
      EXECUTE 'ALTER TABLE public.tickets ADD COLUMN status TEXT NOT NULL DEFAULT ''active''';


    END IF;


  END IF;


END
$$;



DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='tickets') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public'
                     AND table_name='tickets'
                     AND column_name='ticket_type_id') THEN
      EXECUTE 'ALTER TABLE public.tickets ADD COLUMN ticket_type_id UUID';


    END IF;


  END IF;


END
$$;



DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='tickets') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public'
                     AND table_name='tickets'
                     AND column_name='owner_id') THEN
      EXECUTE 'ALTER TABLE public.tickets ADD COLUMN owner_id UUID';


    END IF;


  END IF;


END
$$;



DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='ticket_types') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public'
                     AND table_name='ticket_types'
                     AND column_name='event_id') THEN
      EXECUTE 'ALTER TABLE public.ticket_types ADD COLUMN event_id UUID';


    END IF;


  END IF;


  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='tickets') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public'
                     AND table_name='tickets'
                     AND column_name='event_id') THEN
      EXECUTE 'ALTER TABLE public.tickets ADD COLUMN event_id UUID';


    END IF;


  END IF;


END
$$;



DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='blockchain_transactions'
  ) THEN
    CREATE TABLE public.blockchain_transactions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tx_hash TEXT,
      status TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );


  END IF;



  ALTER TABLE public.blockchain_transactions ADD COLUMN IF NOT EXISTS id UUID;


END
$$;



DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='blockchain_transactions'
  ) THEN
    CREATE TABLE public.blockchain_transactions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tx_hash TEXT,
      status TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );


  END IF;



  ALTER TABLE public.blockchain_transactions ADD COLUMN IF NOT EXISTS id UUID;


END
$$;



-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";



-- Migration: Create Tickets and Related Tables
-- Version: 005
-- Description: Creates tickets table and all related ticket management tables
-- Estimated execution time: < 3 seconds
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";




-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";



-- UP Migration
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";






-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";



-- Create ticket_types table
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";



CREATE TABLE IF NOT EXISTS public.ticket_types (
   -- Primary key
   id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,
   
   -- Event relationship
   event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
   pricing_id UUID REFERENCES public.event_pricing(id) ON DELETE SET NULL,
   capacity_id UUID REFERENCES public.event_capacity(id) ON DELETE SET NULL,
   
   -- Type information
   name VARCHAR(200) NOT NULL,
   description TEXT,
   category VARCHAR(50), -- VIP, General, Student, etc.
   
   -- NFT configuration
   is_nft_enabled BOOLEAN DEFAULT TRUE,
   collection_address VARCHAR(44),
   nft_metadata_template JSONB DEFAULT '{}',
   
   -- Ticket limits
   max_per_customer INTEGER DEFAULT 4,
   max_per_order INTEGER DEFAULT 10,
   total_supply INTEGER NOT NULL,
   current_supply INTEGER DEFAULT 0,
   
   -- Transfer rules
   is_transferable BOOLEAN DEFAULT TRUE,
   transfer_fee_percentage NUMERIC(5, 2) DEFAULT 0,
   transfer_allowed_after TIMESTAMP WITH TIME ZONE,
   transfer_blocked_before_hours INTEGER DEFAULT 0,
   
   -- Refund rules
   is_refundable BOOLEAN DEFAULT TRUE,
   refund_percentage NUMERIC(5, 2) DEFAULT 100,
   refund_deadline_hours INTEGER DEFAULT 24,
   
   -- Redemption rules
   max_redemptions_per_ticket INTEGER DEFAULT 1,
   redemption_start_offset_minutes INTEGER DEFAULT -30, -- 30 min before event
   redemption_end_offset_minutes INTEGER DEFAULT 120, -- 2 hours after start
   
   -- Display settings
   display_order INTEGER DEFAULT 0,
   color_code VARCHAR(7),
   icon_url TEXT,
   
   -- Status
   is_active BOOLEAN DEFAULT TRUE,
   is_visible BOOLEAN DEFAULT TRUE,
   
   -- Metadata
   benefits TEXT[], -- Array of benefits for this ticket type
   restrictions TEXT[], -- Array of restrictions
   metadata JSONB DEFAULT '{}',
   
   -- Audit fields
   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   
   -- Constraints
   CONSTRAINT unique_ticket_type_name UNIQUE(event_id, name),
   CONSTRAINT valid_supply CHECK (current_supply >= 0 AND current_supply <= total_supply)
);



-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";



-- Create tickets table
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";



CREATE TABLE IF NOT EXISTS public.tickets (
   -- Primary key
   id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,
   
   -- Relationships
   event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE RESTRICT,
   ticket_type_id UUID NOT NULL REFERENCES public.ticket_types(id) ON DELETE RESTRICT,
   owner_id UUID NOT NULL REFERENCES public.users(id),
   original_purchaser_id UUID NOT NULL REFERENCES public.users(id),
   
   -- Ticket identification
   ticket_number VARCHAR(20) UNIQUE NOT NULL, -- Human-readable number
   ticket_code UUID DEFAULT uuid_generate_v1() UNIQUE NOT NULL, -- Secure code for validation
   barcode VARCHAR(100) UNIQUE, -- Optional barcode
   
   -- NFT data
   is_nft BOOLEAN DEFAULT FALSE,
   mint_address VARCHAR(44) UNIQUE,
   mint_transaction_id UUID REFERENCES public.blockchain_transactions(id),
   token_account VARCHAR(44),
   metadata_uri TEXT,
   
   -- Seat information (if applicable)
   section VARCHAR(50),
   row VARCHAR(10),
   seat VARCHAR(10),
   
   -- Pricing
   face_value NUMERIC(10, 2) NOT NULL,
   purchase_price NUMERIC(10, 2) NOT NULL,
   service_fees NUMERIC(10, 2) DEFAULT 0,
   taxes NUMERIC(10, 2) DEFAULT 0,
   
   -- Status
   status ticket_status NOT NULL DEFAULT 'DRAFT',
   is_valid BOOLEAN DEFAULT TRUE,
   invalidation_reason TEXT,
   
   -- QR Code data
   qr_code_data TEXT, -- Encrypted QR code content
   qr_code_url TEXT, -- URL to QR code image
   qr_code_generated_at TIMESTAMP WITH TIME ZONE,
   
   -- Transfer tracking
   transfer_count INTEGER DEFAULT 0,
   is_transferable BOOLEAN DEFAULT TRUE,
   transfer_locked_until TIMESTAMP WITH TIME ZONE,
   
   -- Redemption tracking
   redemption_count INTEGER DEFAULT 0,
   first_redeemed_at TIMESTAMP WITH TIME ZONE,
   last_redeemed_at TIMESTAMP WITH TIME ZONE,
   
   -- Purchase information
   purchased_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   payment_method VARCHAR(50),
   order_id UUID, -- Reference to orders table (future)
   
   -- Metadata
   custom_fields JSONB DEFAULT '{}',
   tags TEXT[],
   
   -- Audit fields
   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   
   -- Constraints
   CONSTRAINT valid_ticket_status CHECK (status IN (
       'DRAFT', 'MINTING', 'ACTIVE', 'LISTED', 'TRANSFERRED',
       'REDEEMED', 'EXPIRED', 'CANCELLED', 'BURNED'
   ))
);



-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";



-- Create ticket_transactions table
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";



CREATE TABLE IF NOT EXISTS public.ticket_transactions (
   -- Primary key
   id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,
   
   -- References
   ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
   blockchain_transaction_id UUID REFERENCES public.blockchain_transactions(id),
   
   -- Transaction details
   transaction_type VARCHAR(50) NOT NULL,
   from_user_id UUID REFERENCES public.users(id),
   to_user_id UUID REFERENCES public.users(id),
   
   -- Financial details
   amount NUMERIC(10, 2),
   currency VARCHAR(3) DEFAULT 'USD',
   fee_amount NUMERIC(10, 2) DEFAULT 0,
   
   -- Status
   status VARCHAR(20) DEFAULT 'PENDING',
   error_message TEXT,
   
   -- Blockchain data
   transaction_signature VARCHAR(88),
   block_number BIGINT,
   
   -- Metadata
   ip_address INET,
   user_agent TEXT,
   metadata JSONB DEFAULT '{}',
   
   -- Audit fields
   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   completed_at TIMESTAMP WITH TIME ZONE,
   
   -- Constraints
   CONSTRAINT valid_transaction_type CHECK (transaction_type IN (
       'PURCHASE', 'TRANSFER', 'LIST', 'DELIST', 'SALE',
       'REDEEM', 'REFUND', 'BURN', 'MINT'
   )),
   CONSTRAINT valid_transaction_status CHECK (status IN (
       'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'
   ))
);



-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";



-- Create ticket_transfers table
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";



CREATE TABLE IF NOT EXISTS public.ticket_transfers (
   -- Primary key
   id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,
   
   -- References
   ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
   transaction_id UUID REFERENCES public.ticket_transactions(id),
   
   -- Transfer parties
   from_user_id UUID NOT NULL REFERENCES public.users(id),
   to_user_id UUID NOT NULL REFERENCES public.users(id),
   to_email VARCHAR(255), -- For inviting new users
   to_phone VARCHAR(20), -- Alternative contact
   
   -- Transfer details
   transfer_method VARCHAR(50) DEFAULT 'DIRECT', -- DIRECT, EMAIL, SMS, MARKETPLACE
   transfer_price NUMERIC(10, 2), -- If sold
   transfer_fee NUMERIC(10, 2) DEFAULT 0,
   
   -- Status
   status VARCHAR(20) DEFAULT 'PENDING',
   acceptance_code VARCHAR(20), -- Code for recipient to accept
   accepted_at TIMESTAMP WITH TIME ZONE,
   expires_at TIMESTAMP WITH TIME ZONE,
   
   -- Restrictions
   is_gift BOOLEAN DEFAULT FALSE,
   message TEXT, -- Gift message
   
   -- Metadata
   initiated_via VARCHAR(50), -- WEB, MOBILE, API
   metadata JSONB DEFAULT '{}',
   
   -- Audit fields
   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   
   -- Constraints
   CONSTRAINT valid_transfer_status CHECK (status IN (
       'PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED', 'COMPLETED'
   )),
   CONSTRAINT different_users CHECK (from_user_id != to_user_id)
);



-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";



-- Create ticket_redemptions table
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";



CREATE TABLE IF NOT EXISTS public.ticket_redemptions (
   -- Primary key
   id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,
   
   -- References
   ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
   event_schedule_id UUID REFERENCES public.event_schedules(id),
   
   -- Redemption details
   redeemed_by_user_id UUID REFERENCES public.users(id),
   redeemed_by_staff_id UUID REFERENCES public.users(id),
   redemption_method VARCHAR(50) DEFAULT 'QR_CODE', -- QR_CODE, BARCODE, MANUAL, NFC
   
   -- Location data
   redemption_gate VARCHAR(50),
   redemption_location JSONB, -- GPS coordinates
   device_id VARCHAR(100),
   
   -- Validation
   validation_code VARCHAR(100), -- Code used for redemption
   is_valid BOOLEAN DEFAULT TRUE,
   validation_errors TEXT[],
   
   -- Metadata
   seat_assigned VARCHAR(50), -- If general admission
   special_instructions TEXT,
   metadata JSONB DEFAULT '{}',
   
   -- Audit fields
   redeemed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   
   -- Constraints
   CONSTRAINT valid_redemption_method CHECK (redemption_method IN (
       'QR_CODE', 'BARCODE', 'MANUAL', 'NFC', 'FACIAL', 'OTHER'
   ))
);



-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";



-- Create ticket_refunds table
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";



CREATE TABLE IF NOT EXISTS public.ticket_refunds (
   -- Primary key
   id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,
   
   -- References
   ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
   transaction_id UUID REFERENCES public.ticket_transactions(id),
   
   -- Refund details
   requested_by_user_id UUID NOT NULL REFERENCES public.users(id),
   approved_by_user_id UUID REFERENCES public.users(id),
   
   -- Financial details
   original_amount NUMERIC(10, 2) NOT NULL,
   refund_amount NUMERIC(10, 2) NOT NULL,
   refund_fee NUMERIC(10, 2) DEFAULT 0,
   refund_percentage NUMERIC(5, 2),
   
   -- Reason and status
   reason VARCHAR(100) NOT NULL,
   reason_details TEXT,
   status VARCHAR(20) DEFAULT 'REQUESTED',
   
   -- Processing
   processed_at TIMESTAMP WITH TIME ZONE,
   payment_method VARCHAR(50),
   transaction_reference VARCHAR(100),
   
   -- Metadata
   supporting_documents JSONB DEFAULT '[]',
   admin_notes TEXT,
   
   -- Audit fields
   requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   
   -- Constraints
   CONSTRAINT valid_refund_status CHECK (status IN (
       'REQUESTED', 'REVIEWING', 'APPROVED', 'PROCESSING',
       'COMPLETED', 'REJECTED', 'CANCELLED'
   )),
   CONSTRAINT valid_refund_amount CHECK (refund_amount >= 0 AND refund_amount <= original_amount)
);



-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";



-- Create ticket_metadata table
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";



CREATE TABLE IF NOT EXISTS public.ticket_metadata (
   -- Primary key
   id UUID DEFAULT uuid_generate_v1() PRIMARY KEY,
   ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
   
   -- NFT Metadata (following Metaplex standard)
   name VARCHAR(200),
   symbol VARCHAR(10),
   description TEXT,
   image TEXT,
   animation_url TEXT,
   external_url TEXT,
   
   -- Attributes
   attributes JSONB DEFAULT '[]', -- Array of trait_type/value pairs
   properties JSONB DEFAULT '{}', -- Additional properties
   
   -- Collection info
   collection JSONB, -- {name, family}
   
   -- Utility and uses
   uses JSONB, -- {use_method, remaining, total}
   
   -- Royalties
   seller_fee_basis_points INTEGER DEFAULT 250, -- 2.5%
   creators JSONB DEFAULT '[]', -- Array of {address, share}
   
   -- Enhanced metadata
   event_details JSONB, -- Cached event info
   venue_details JSONB, -- Cached venue info
   perks JSONB DEFAULT '[]', -- Special perks for this ticket
   
   -- Media
   media_assets JSONB DEFAULT '[]', -- Additional images/videos
   
   -- Verification
   authenticity_hash VARCHAR(64), -- SHA-256 of critical data
   
   -- Audit fields
   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   
   -- Constraints
   CONSTRAINT unique_ticket_metadata UNIQUE(ticket_id)
);



-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";



-- Indexes
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";




-- Ticket types indexes
CREATE INDEX IF NOT EXISTS idx_ticket_types_event_id ON public.ticket_types(event_id);


CREATE INDEX IF NOT EXISTS idx_ticket_types_active ON public.ticket_types(is_active) WHERE is_active = TRUE;



-- Tickets indexes
CREATE INDEX IF NOT EXISTS idx_tickets_event_id ON public.tickets(event_id);


CREATE INDEX IF NOT EXISTS idx_tickets_owner_id ON public.tickets(owner_id);


CREATE INDEX IF NOT EXISTS idx_tickets_ticket_type_id ON public.tickets(ticket_type_id);


CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.tickets(status);


CREATE INDEX IF NOT EXISTS idx_tickets_mint_address ON public.tickets(mint_address) WHERE mint_address IS NOT NULL;


CREATE INDEX IF NOT EXISTS idx_tickets_active ON public.tickets(status, is_valid) 
   WHERE status = 'ACTIVE' AND is_valid = TRUE;


ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS transfer_locked_until TIMESTAMPTZ;


CREATE INDEX IF NOT EXISTS idx_tickets_transferable ON public.tickets(is_transferable, transfer_locked_until) 
   WHERE is_transferable = TRUE;



-- Ticket transactions indexes
CREATE INDEX IF NOT EXISTS idx_ticket_transactions_ticket_id ON public.ticket_transactions(ticket_id);


CREATE INDEX IF NOT EXISTS idx_ticket_transactions_type ON public.ticket_transactions(transaction_type);


CREATE INDEX IF NOT EXISTS idx_ticket_transactions_status ON public.ticket_transactions(status);


CREATE INDEX IF NOT EXISTS idx_ticket_transactions_created_at ON public.ticket_transactions(created_at);



-- Ticket transfers indexes
CREATE INDEX IF NOT EXISTS idx_ticket_transfers_ticket_id ON public.ticket_transfers(ticket_id);


CREATE INDEX IF NOT EXISTS idx_ticket_transfers_from_user ON public.ticket_transfers(from_user_id);


CREATE INDEX IF NOT EXISTS idx_ticket_transfers_to_user ON public.ticket_transfers(to_user_id);


CREATE INDEX IF NOT EXISTS idx_ticket_transfers_status ON public.ticket_transfers(status);


CREATE INDEX IF NOT EXISTS idx_ticket_transfers_pending ON public.ticket_transfers(status, expires_at) 
   WHERE status = 'PENDING';



-- Ticket redemptions indexes
CREATE INDEX IF NOT EXISTS idx_ticket_redemptions_ticket_id ON public.ticket_redemptions(ticket_id);


CREATE INDEX IF NOT EXISTS idx_ticket_redemptions_event_schedule ON public.ticket_redemptions(event_schedule_id);


CREATE INDEX IF NOT EXISTS idx_ticket_redemptions_redeemed_at ON public.ticket_redemptions(redeemed_at);



-- Ticket refunds indexes
CREATE INDEX IF NOT EXISTS idx_ticket_refunds_ticket_id ON public.ticket_refunds(ticket_id);


CREATE INDEX IF NOT EXISTS idx_ticket_refunds_status ON public.ticket_refunds(status);


CREATE INDEX IF NOT EXISTS idx_ticket_refunds_requested_by ON public.ticket_refunds(requested_by_user_id);



-- Ticket metadata indexes
CREATE INDEX IF NOT EXISTS idx_ticket_metadata_ticket_id ON public.ticket_metadata(ticket_id);



-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";



-- Triggers
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";




-- Update timestamp triggers
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS original_purchaser_id UUID;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tickets_original_purchaser') THEN
  ALTER TABLE public.tickets ADD CONSTRAINT fk_tickets_original_purchaser FOREIGN KEY (original_purchaser_id) REFERENCES public.users(id);

END IF;
 END$$;

CREATE INDEX IF NOT EXISTS idx_tickets_original_purchaser ON public.tickets(original_purchaser_id);

CREATE TRIGGER trigger_update_ticket_types_timestamp
   BEFORE UPDATE ON public.ticket_types
   FOR EACH ROW
   EXECUTE FUNCTION update_updated_at_column();



ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS original_purchaser_id UUID;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tickets_original_purchaser') THEN
  ALTER TABLE public.tickets ADD CONSTRAINT fk_tickets_original_purchaser FOREIGN KEY (original_purchaser_id) REFERENCES public.users(id);

END IF;
 END$$;

CREATE INDEX IF NOT EXISTS idx_tickets_original_purchaser ON public.tickets(original_purchaser_id);

CREATE TRIGGER trigger_update_tickets_timestamp
   BEFORE UPDATE ON public.tickets
   FOR EACH ROW
   EXECUTE FUNCTION update_updated_at_column();



ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS original_purchaser_id UUID;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tickets_original_purchaser') THEN
  ALTER TABLE public.tickets ADD CONSTRAINT fk_tickets_original_purchaser FOREIGN KEY (original_purchaser_id) REFERENCES public.users(id);

END IF;
 END$$;

CREATE INDEX IF NOT EXISTS idx_tickets_original_purchaser ON public.tickets(original_purchaser_id);

CREATE TRIGGER trigger_update_ticket_transfers_timestamp
   BEFORE UPDATE ON public.ticket_transfers
   FOR EACH ROW
   EXECUTE FUNCTION update_updated_at_column();



ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS original_purchaser_id UUID;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tickets_original_purchaser') THEN
  ALTER TABLE public.tickets ADD CONSTRAINT fk_tickets_original_purchaser FOREIGN KEY (original_purchaser_id) REFERENCES public.users(id);

END IF;
 END$$;

CREATE INDEX IF NOT EXISTS idx_tickets_original_purchaser ON public.tickets(original_purchaser_id);

CREATE TRIGGER trigger_update_ticket_refunds_timestamp
   BEFORE UPDATE ON public.ticket_refunds
   FOR EACH ROW
   EXECUTE FUNCTION update_updated_at_column();



ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS original_purchaser_id UUID;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tickets_original_purchaser') THEN
  ALTER TABLE public.tickets ADD CONSTRAINT fk_tickets_original_purchaser FOREIGN KEY (original_purchaser_id) REFERENCES public.users(id);

END IF;
 END$$;

CREATE INDEX IF NOT EXISTS idx_tickets_original_purchaser ON public.tickets(original_purchaser_id);

CREATE TRIGGER trigger_update_ticket_metadata_timestamp
   BEFORE UPDATE ON public.ticket_metadata
   FOR EACH ROW
   EXECUTE FUNCTION update_updated_at_column();



-- Generate ticket number trigger
CREATE OR REPLACE FUNCTION generate_ticket_number()
RETURNS TRIGGER AS $$
DECLARE
   event_code VARCHAR(4);


   sequence_num INTEGER;


BEGIN
   -- Get event code (first 4 chars of event slug)
   SELECT UPPER(SUBSTR(slug, 1, 4)) INTO event_code
   FROM public.events WHERE id = NEW.event_id;


   
   -- Get next sequence number for this event
   SELECT COUNT(*) + 1 INTO sequence_num
   FROM public.tickets WHERE event_id = NEW.event_id;


   
   -- Generate ticket number: EVNT-000001
   NEW.ticket_number := event_code || '-' || LPAD(sequence_num::TEXT, 6, '0');


   
   RETURN NEW;


END;


$$ LANGUAGE plpgsql;



ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS ticket_code UUID;

ALTER TABLE public.tickets ALTER COLUMN ticket_code SET DEFAULT uuid_generate_v1();

CREATE UNIQUE INDEX IF NOT EXISTS uq_tickets_ticket_code_idx ON public.tickets(ticket_code) WHERE ticket_code IS NOT NULL;

CREATE TRIGGER trigger_generate_ticket_number
   BEFORE INSERT ON public.tickets
   FOR EACH ROW
   WHEN (NEW.ticket_number IS NULL)
   EXECUTE FUNCTION generate_ticket_number();



-- Update ticket type supply trigger
CREATE OR REPLACE FUNCTION update_ticket_type_supply()
RETURNS TRIGGER AS $$
BEGIN
   IF TG_OP = 'INSERT' THEN
       UPDATE public.ticket_types 
       SET current_supply = current_supply + 1
       WHERE id = NEW.ticket_type_id;


   ELSIF TG_OP = 'DELETE' THEN
       UPDATE public.ticket_types 
       SET current_supply = current_supply - 1
       WHERE id = OLD.ticket_type_id;


   END IF;


   RETURN NULL;


END;


$$ LANGUAGE plpgsql;



ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS original_purchaser_id UUID;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tickets_original_purchaser') THEN
  ALTER TABLE public.tickets ADD CONSTRAINT fk_tickets_original_purchaser FOREIGN KEY (original_purchaser_id) REFERENCES public.users(id);

END IF;
 END$$;

CREATE INDEX IF NOT EXISTS idx_tickets_original_purchaser ON public.tickets(original_purchaser_id);

CREATE TRIGGER trigger_update_ticket_supply
   AFTER INSERT OR DELETE ON public.tickets
   FOR EACH ROW
   EXECUTE FUNCTION update_ticket_type_supply();



-- Create ticket metadata automatically
CREATE OR REPLACE FUNCTION create_ticket_metadata()
RETURNS TRIGGER AS $$
BEGIN
   INSERT INTO public.ticket_metadata (ticket_id)
   VALUES (NEW.id)
   ON CONFLICT (ticket_id) DO NOTHING;


   RETURN NEW;


END;


$$ LANGUAGE plpgsql;



CREATE TRIGGER trigger_create_ticket_metadata
   AFTER INSERT ON public.tickets
   FOR EACH ROW
   EXECUTE FUNCTION create_ticket_metadata();



-- Update ticket status on redemption
CREATE OR REPLACE FUNCTION update_ticket_on_redemption()
RETURNS TRIGGER AS $$
BEGIN
   -- Update redemption count
   UPDATE public.tickets
   SET 
       redemption_count = redemption_count + 1,
       first_redeemed_at = COALESCE(first_redeemed_at, NEW.redeemed_at),
       last_redeemed_at = NEW.redeemed_at,
       status = CASE 
           WHEN redemption_count + 1 >= (
               SELECT max_redemptions_per_ticket 
               FROM public.ticket_types 
               WHERE id = tickets.ticket_type_id
           ) THEN 'REDEEMED'
           ELSE status
       END
   WHERE id = NEW.ticket_id;


   
   RETURN NEW;


END;


$$ LANGUAGE plpgsql;



ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS original_purchaser_id UUID;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tickets_original_purchaser') THEN
  ALTER TABLE public.tickets ADD CONSTRAINT fk_tickets_original_purchaser FOREIGN KEY (original_purchaser_id) REFERENCES public.users(id);

END IF;
 END$$;

CREATE INDEX IF NOT EXISTS idx_tickets_original_purchaser ON public.tickets(original_purchaser_id);

CREATE TRIGGER trigger_update_ticket_on_redemption
   AFTER INSERT ON public.ticket_redemptions
   FOR EACH ROW
   EXECUTE FUNCTION update_ticket_on_redemption();



-- Generate QR code data
CREATE OR REPLACE FUNCTION generate_qr_code_data()
RETURNS TRIGGER AS $$
DECLARE
   qr_data JSONB;


BEGIN
   -- Create QR code data
   qr_data := jsonb_build_object(
       'ticket_id', NEW.id,
       'ticket_code', NEW.ticket_code,
       'event_id', NEW.event_id,
       'owner_id', NEW.owner_id,
       'valid', NEW.is_valid
   );


   
   -- Encrypt the data (in production, use proper encryption)
   NEW.qr_code_data := encode(qr_data::text::bytea, 'base64');


   NEW.qr_code_generated_at := CURRENT_TIMESTAMP;


   
   RETURN NEW;


END;


$$ LANGUAGE plpgsql;



CREATE TRIGGER trigger_generate_qr_code
   BEFORE INSERT OR UPDATE OF ticket_code ON public.tickets
   FOR EACH ROW
   EXECUTE FUNCTION generate_qr_code_data();



-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";



-- Functions
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";




-- Function to validate ticket for redemption
CREATE OR REPLACE FUNCTION validate_ticket_redemption(
   p_ticket_id UUID,
   p_event_schedule_id UUID DEFAULT NULL
) RETURNS TABLE (
   is_valid BOOLEAN,
   error_message TEXT
) AS $$
DECLARE
   v_ticket RECORD;


   v_ticket_type RECORD;


   v_event RECORD;


   v_schedule RECORD;


BEGIN
   -- Get ticket details
   SELECT t.*, tt.max_redemptions_per_ticket
   INTO v_ticket
   FROM public.tickets t
   JOIN public.ticket_types tt ON t.ticket_type_id = tt.id
   WHERE t.id = p_ticket_id;


   
   IF NOT FOUND THEN
       RETURN QUERY SELECT FALSE, 'Ticket not found';


       RETURN;


   END IF;


   
   -- Check ticket status
   IF v_ticket.status NOT IN ('ACTIVE', 'TRANSFERRED') THEN
       RETURN QUERY SELECT FALSE, 'Ticket status is ' || v_ticket.status;


       RETURN;


   END IF;


   
   -- Check if ticket is valid
   IF NOT v_ticket.is_valid THEN
       RETURN QUERY SELECT FALSE, 'Ticket has been invalidated: ' || COALESCE(v_ticket.invalidation_reason, 'Unknown reason');


       RETURN;


   END IF;


   
   -- Check redemption limit
   IF v_ticket.redemption_count >= v_ticket.max_redemptions_per_ticket THEN
       RETURN QUERY SELECT FALSE, 'Ticket has reached maximum redemptions';


       RETURN;


   END IF;


   
   -- All checks passed
   RETURN QUERY SELECT TRUE, NULL::TEXT;


END;


$$ LANGUAGE plpgsql;



-- Function to transfer ticket
CREATE OR REPLACE FUNCTION transfer_ticket(
   p_ticket_id UUID,
   p_from_user_id UUID,
   p_to_user_id UUID,
   p_transfer_price NUMERIC DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
   v_transfer_id UUID;


   v_transaction_id UUID;


BEGIN
   -- Validate transfer is allowed
   IF NOT EXISTS (
       SELECT 1 FROM public.tickets 
       WHERE id = p_ticket_id 
       AND owner_id = p_from_user_id 
       AND is_transferable = TRUE
       AND (transfer_locked_until IS NULL OR transfer_locked_until < CURRENT_TIMESTAMP)
   ) THEN
       RAISE EXCEPTION 'Transfer not allowed for this ticket';


   END IF;


   
   -- Create transaction record
   INSERT INTO public.ticket_transactions (
       ticket_id, transaction_type, from_user_id, to_user_id, amount, status
   ) VALUES (
       p_ticket_id, 'TRANSFER', p_from_user_id, p_to_user_id, p_transfer_price, 'PROCESSING'
   ) RETURNING id INTO v_transaction_id;


   
   -- Create transfer record
   INSERT INTO public.ticket_transfers (
       ticket_id, transaction_id, from_user_id, to_user_id, 
       transfer_price, status
   ) VALUES (
       p_ticket_id, v_transaction_id, p_from_user_id, p_to_user_id,
       p_transfer_price, 'PENDING'
   ) RETURNING id INTO v_transfer_id;


   
   -- Update ticket owner and status
   UPDATE public.tickets
   SET 
       owner_id = p_to_user_id,
       transfer_count = transfer_count + 1,
       status = 'TRANSFERRED',
       updated_at = CURRENT_TIMESTAMP
   WHERE id = p_ticket_id;


   
   -- Complete transaction
   UPDATE public.ticket_transactions
   SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP
   WHERE id = v_transaction_id;


   
   -- Complete transfer
   UPDATE public.ticket_transfers
   SET status = 'COMPLETED', accepted_at = CURRENT_TIMESTAMP
   WHERE id = v_transfer_id;


   
   RETURN v_transfer_id;


END;


$$ LANGUAGE plpgsql;



-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";



-- Row Level Security
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";




-- Enable RLS on all tables
ALTER TABLE public.ticket_types ENABLE ROW LEVEL SECURITY;


ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;


ALTER TABLE public.ticket_transactions ENABLE ROW LEVEL SECURITY;


ALTER TABLE public.ticket_transfers ENABLE ROW LEVEL SECURITY;


ALTER TABLE public.ticket_redemptions ENABLE ROW LEVEL SECURITY;


ALTER TABLE public.ticket_refunds ENABLE ROW LEVEL SECURITY;


ALTER TABLE public.ticket_metadata ENABLE ROW LEVEL SECURITY;



-- Ticket policies
CREATE POLICY tickets_select_own ON public.tickets
   FOR SELECT
   USING (owner_id = auth.user_id() OR original_purchaser_id = auth.user_id());



CREATE POLICY tickets_update_own ON public.tickets
   FOR UPDATE
   USING (owner_id = auth.user_id());



-- Ticket transactions visible to involved parties
CREATE POLICY ticket_transactions_select ON public.ticket_transactions
   FOR SELECT
   USING (
       from_user_id = auth.user_id() OR 
       to_user_id = auth.user_id() OR
       EXISTS (
           SELECT 1 FROM public.tickets 
           WHERE tickets.id = ticket_transactions.ticket_id 
           AND tickets.owner_id = auth.user_id()
       )
   );



-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";



-- Grants
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";




GRANT SELECT, INSERT, UPDATE ON public.ticket_types TO tickettoken_app;


GRANT SELECT, INSERT, UPDATE ON public.tickets TO tickettoken_app;


GRANT SELECT, INSERT, UPDATE ON public.ticket_transactions TO tickettoken_app;


GRANT SELECT, INSERT, UPDATE ON public.ticket_transfers TO tickettoken_app;


GRANT SELECT, INSERT ON public.ticket_redemptions TO tickettoken_app;


GRANT SELECT, INSERT, UPDATE ON public.ticket_refunds TO tickettoken_app;


GRANT SELECT, INSERT, UPDATE ON public.ticket_metadata TO tickettoken_app;


GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO tickettoken_app;



-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";



-- Migration Tracking
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";




INSERT INTO public.schema_migrations (version, name) 
VALUES (5, '005_create_tickets_table.sql')
ON CONFLICT (version) DO NOTHING;



-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";



-- Validation Queries
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";




DO $$
DECLARE
   table_count INTEGER;


   index_count INTEGER;


   trigger_count INTEGER;


BEGIN
   -- Count tables created
   SELECT COUNT(*) INTO table_count
   FROM information_schema.tables
   WHERE table_schema = 'public' 
   AND table_name IN ('ticket_types', 'tickets', 'ticket_transactions', 
                      'ticket_transfers', 'ticket_redemptions', 'ticket_refunds', 
                      'ticket_metadata');


   
   -- Count indexes created
   SELECT COUNT(*) INTO index_count
   FROM pg_indexes
   WHERE schemaname = 'public'
   AND tablename IN ('ticket_types', 'tickets', 'ticket_transactions', 
                     'ticket_transfers', 'ticket_redemptions', 'ticket_refunds', 
                     'ticket_metadata');


   
   -- Count triggers
   SELECT COUNT(*) INTO trigger_count
   FROM information_schema.triggers
   WHERE trigger_schema = 'public'
   AND event_object_table IN ('ticket_types', 'tickets', 'ticket_transfers', 
                              'ticket_redemptions', 'ticket_refunds', 'ticket_metadata');


   
   RAISE NOTICE 'Tickets migration completed: % tables, % indexes, % triggers', 
       table_count, index_count, trigger_count;


END $$;






-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";



-- DOWN Migration (Commented Out)
-- =============================================

-- Ensure UUID extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";



/*



-- Drop RLS policies
DROP POLICY IF EXISTS tickets_select_own ON public.tickets;


DROP POLICY IF EXISTS tickets_update_own ON public.tickets;


DROP POLICY IF EXISTS ticket_transactions_select ON public.ticket_transactions;



-- Drop functions
DROP FUNCTION IF EXISTS transfer_ticket(UUID, UUID, UUID, NUMERIC);


DROP FUNCTION IF EXISTS validate_ticket_redemption(UUID, UUID);


DROP FUNCTION IF EXISTS generate_qr_code_data();


DROP FUNCTION IF EXISTS update_ticket_on_redemption();


DROP FUNCTION IF EXISTS create_ticket_metadata();


DROP FUNCTION IF EXISTS update_ticket_type_supply();


DROP FUNCTION IF EXISTS generate_ticket_number();



-- Drop tables in correct order
DROP TABLE IF EXISTS public.ticket_metadata CASCADE;


DROP TABLE IF EXISTS public.ticket_refunds CASCADE;


DROP TABLE IF EXISTS public.ticket_redemptions CASCADE;


DROP TABLE IF EXISTS public.ticket_transfers CASCADE;


DROP TABLE IF EXISTS public.ticket_transactions CASCADE;


DROP TABLE IF EXISTS public.tickets CASCADE;


DROP TABLE IF EXISTS public.ticket_types CASCADE;



-- Remove migration record
DELETE FROM public.schema_migrations WHERE version = 5;





*/
;

;
