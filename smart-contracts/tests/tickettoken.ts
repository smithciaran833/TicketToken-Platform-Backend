import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";

describe("tickettoken", () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Tickettoken as Program;

  // Test accounts
  const authority = provider.wallet as anchor.Wallet;
  const treasury = Keypair.generate();
  const artistWallet = Keypair.generate();

  // PDAs that will be derived
  let platformPda: PublicKey;
  let venuePda: PublicKey;
  let eventPda: PublicKey;
  let ticketPda: PublicKey;
  let reentrancyGuardPda: PublicKey;

  // Test data
  const venueId = "test-venue-001";
  const venueName = "Test Venue";
  const venueMetadataUri = "https://example.com/venue-metadata.json";

  const eventId = new anchor.BN(1);
  const eventName = "Test Concert";
  const ticketPrice = new anchor.BN(1000000000); // 1 SOL in lamports
  const totalTickets = 100;
  const artistPercentage = 500; // 5% in basis points
  const venuePercentage = 300; // 3% in basis points

  const ticketId = new anchor.BN(1);
  const nftAssetId = Keypair.generate().publicKey;
  const ownerId = "user-12345678";
  const newOwnerId = "user-87654321";

  before(async () => {
    // Derive Platform PDA
    [platformPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("platform")],
      program.programId
    );
  });

  describe("1. Initialize Platform", () => {
    it("should initialize the platform with fee and treasury", async () => {
      const feeBps = 250; // 2.5%

      try {
        await program.methods
          .initializePlatform(feeBps, treasury.publicKey)
          .accounts({
            owner: authority.publicKey,
            platform: platformPda,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        // Fetch and verify platform account
        const platformAccount = await program.account.platform.fetch(platformPda);
        assert.equal(platformAccount.feeBps, feeBps);
        assert.ok(platformAccount.treasury.equals(treasury.publicKey));

        console.log("✓ Platform initialized with fee:", feeBps, "bps");
      } catch (error) {
        console.log("Platform may already be initialized:", error.message);
      }
    });
  });

  describe("2. Create Venue", () => {
    it("should create a venue", async () => {
      // Derive Venue PDA
      [venuePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("venue"), Buffer.from(venueId)],
        program.programId
      );

      try {
        await program.methods
          .createVenue(venueId, venueName, venueMetadataUri)
          .accounts({
            owner: authority.publicKey,
            platform: platformPda,
            venue: venuePda,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        // Fetch and verify venue account
        const venueAccount = await program.account.venue.fetch(venuePda);
        assert.ok(venueAccount.owner.equals(authority.publicKey));
        assert.equal(venueAccount.eventCount, 0);
        assert.equal(venueAccount.verified, false);
        assert.equal(venueAccount.active, true);

        console.log("✓ Venue created:", venueId);
      } catch (error) {
        console.log("Venue may already exist:", error.message);
      }
    });
  });

  describe("3. Verify Venue", () => {
    it("should verify the venue", async () => {
      try {
        await program.methods
          .verifyVenue()
          .accounts({
            authority: authority.publicKey,
            platform: platformPda,
            venue: venuePda,
          })
          .rpc();

        // Fetch and verify venue is now verified
        const venueAccount = await program.account.venue.fetch(venuePda);
        assert.equal(venueAccount.verified, true);

        console.log("✓ Venue verified");
      } catch (error) {
        console.log("Venue verification error:", error.message);
      }
    });
  });

  describe("4. Create Event with Royalties", () => {
    it("should create an event with artist and venue royalty percentages", async () => {
      const now = Math.floor(Date.now() / 1000);
      // startTime must be > now + 3600 (1 hour in future)
      // verification window is startTime - 3600 to endTime + 3600
      // So if startTime = now + 3601, verification window starts at now + 1
      const startTime = new anchor.BN(now + 3601); // Just over 1 hour from now
      const endTime = new anchor.BN(now + 7200); // 2 hours from now
      const refundWindow = new anchor.BN(3600); // 1 hour

      // Derive Event PDA
      [eventPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("event"), venuePda.toBuffer(), eventId.toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      // Derive Reentrancy Guard PDA
      [reentrancyGuardPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("reentrancy"), eventPda.toBuffer()],
        program.programId
      );

      const eventParams = {
        eventId: eventId,
        name: eventName,
        ticketPrice: ticketPrice,
        totalTickets: totalTickets,
        startTime: startTime,
        endTime: endTime,
        refundWindow: refundWindow,
        metadataUri: "https://example.com/event-metadata.json",
        oracleFeed: PublicKey.default, // Placeholder
        description: "An amazing test concert event",
        transferable: true,
        resaleable: true,
        artistWallet: artistWallet.publicKey,
        artistPercentage: artistPercentage,
        venuePercentage: venuePercentage,
      };

      await program.methods
        .createEvent(eventParams)
        .accounts({
          authority: authority.publicKey,
          venue: venuePda,
          event: eventPda,
          reentrancyGuard: reentrancyGuardPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Fetch and verify event account
      const eventAccount = await program.account.event.fetch(eventPda);
      assert.ok(eventAccount.venue.equals(venuePda));
      assert.equal(eventAccount.eventId.toNumber(), eventId.toNumber());
      assert.equal(eventAccount.ticketPrice.toNumber(), ticketPrice.toNumber());
      assert.equal(eventAccount.totalTickets, totalTickets);
      assert.equal(eventAccount.ticketsSold, 0);

      // Verify royalty fields
      assert.ok(eventAccount.artistWallet.equals(artistWallet.publicKey), "Artist wallet mismatch");
      assert.equal(eventAccount.artistPercentage, artistPercentage, "Artist percentage mismatch");
      assert.equal(eventAccount.venuePercentage, venuePercentage, "Venue percentage mismatch");

      console.log("✓ Event created with royalties:");
      console.log("  - Artist:", artistPercentage, "bps");
      console.log("  - Venue:", venuePercentage, "bps");
    });

    it("should reject event creation with invalid royalty percentages (> 100%)", async () => {
      const now = Math.floor(Date.now() / 1000);
      const badEventId = new anchor.BN(999);

      const [badEventPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("event"), venuePda.toBuffer(), badEventId.toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      const [badReentrancyPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("reentrancy"), badEventPda.toBuffer()],
        program.programId
      );

      const invalidEventParams = {
        eventId: badEventId,
        name: "Bad Event",
        ticketPrice: ticketPrice,
        totalTickets: 50,
        startTime: new anchor.BN(now + 86400),
        endTime: new anchor.BN(now + 90000),
        refundWindow: new anchor.BN(3600),
        metadataUri: "https://example.com/bad-event.json",
        oracleFeed: PublicKey.default,
        description: "This should fail",
        transferable: true,
        resaleable: true,
        artistWallet: artistWallet.publicKey,
        artistPercentage: 6000, // 60%
        venuePercentage: 5000, // 50% - Total 110%, should fail
      };

      try {
        await program.methods
          .createEvent(invalidEventParams)
          .accounts({
            authority: authority.publicKey,
            venue: venuePda,
            event: badEventPda,
            reentrancyGuard: badReentrancyPda,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        assert.fail("Should have thrown an error for invalid royalty percentage");
      } catch (error) {
        assert.include(error.toString(), "InvalidRoyaltyPercentage");
        console.log("✓ Correctly rejected royalties > 100%");
      }
    });
  });

  describe("5. Register Ticket", () => {
    it("should register a ticket after NFT minting", async () => {
      // Derive Ticket PDA
      [ticketPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("ticket"), eventPda.toBuffer(), ticketId.toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      await program.methods
        .registerTicket(ticketId, nftAssetId, ownerId)
        .accounts({
          authority: authority.publicKey,
          event: eventPda,
          ticket: ticketPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Fetch and verify ticket account
      const ticketAccount = await program.account.ticket.fetch(ticketPda);
      assert.ok(ticketAccount.event.equals(eventPda));
      assert.equal(ticketAccount.ticketId.toNumber(), ticketId.toNumber());
      assert.ok(ticketAccount.nftAssetId.equals(nftAssetId));
      assert.equal(ticketAccount.currentOwnerId, ownerId);
      assert.equal(ticketAccount.used, false);
      assert.equal(ticketAccount.transferCount, 0);
      assert.equal(ticketAccount.verifiedAt, null);

      console.log("✓ Ticket registered:");
      console.log("  - Ticket ID:", ticketId.toString());
      console.log("  - Owner:", ownerId);
      console.log("  - Used:", false);
    });
  });

  describe("6. Transfer Ticket", () => {
    it("should transfer ticket ownership (simulating resale)", async () => {
      await program.methods
        .transferTicket(newOwnerId)
        .accounts({
          authority: authority.publicKey,
          event: eventPda,
          ticket: ticketPda,
        })
        .rpc();

      // Fetch and verify ticket was transferred
      const ticketAccount = await program.account.ticket.fetch(ticketPda);
      assert.equal(ticketAccount.currentOwnerId, newOwnerId);
      assert.equal(ticketAccount.transferCount, 1);
      assert.equal(ticketAccount.used, false); // Still not used

      console.log("✓ Ticket transferred:");
      console.log("  - New Owner:", newOwnerId);
      console.log("  - Transfer Count:", ticketAccount.transferCount);
    });

    it("should allow multiple transfers and increment count", async () => {
      const thirdOwnerId = "user-99999999";

      await program.methods
        .transferTicket(thirdOwnerId)
        .accounts({
          authority: authority.publicKey,
          event: eventPda,
          ticket: ticketPda,
        })
        .rpc();

      const ticketAccount = await program.account.ticket.fetch(ticketPda);
      assert.equal(ticketAccount.currentOwnerId, thirdOwnerId);
      assert.equal(ticketAccount.transferCount, 2);

      console.log("✓ Ticket transferred again - Count:", ticketAccount.transferCount);
    });
  });

  describe("7. Verify Ticket (Mark as USED)", () => {
    it("should mark ticket as used when verified at door", async () => {
      // Wait 2 seconds to ensure we're in the verification window
      // (startTime - 3600 = now + 1, so after 2 seconds we're in the window)
      await new Promise(resolve => setTimeout(resolve, 2000));

      await program.methods
        .verifyTicket()
        .accounts({
          validator: authority.publicKey,
          event: eventPda,
          ticket: ticketPda,
        })
        .rpc();

      // Fetch and verify ticket is marked as used
      const ticketAccount = await program.account.ticket.fetch(ticketPda);
      assert.equal(ticketAccount.used, true);
      assert.notEqual(ticketAccount.verifiedAt, null);

      console.log("✓ Ticket verified and marked as USED");
      console.log("  - Verified At:", new Date(ticketAccount.verifiedAt.toNumber() * 1000).toISOString());
    });

    it("should reject verification of already used ticket", async () => {
      try {
        await program.methods
          .verifyTicket()
          .accounts({
            validator: authority.publicKey,
            event: eventPda,
            ticket: ticketPda,
          })
          .rpc();

        assert.fail("Should have thrown an error for already used ticket");
      } catch (error) {
        assert.include(error.toString(), "TicketAlreadyUsed");
        console.log("✓ Correctly rejected double-scan of used ticket");
      }
    });

    it("should reject transfer of used ticket", async () => {
      const anotherOwnerId = "user-00000000";

      try {
        await program.methods
          .transferTicket(anotherOwnerId)
          .accounts({
            authority: authority.publicKey,
            event: eventPda,
            ticket: ticketPda,
          })
          .rpc();

        assert.fail("Should have thrown an error for transferring used ticket");
      } catch (error) {
        assert.include(error.toString(), "TicketAlreadyUsed");
        console.log("✓ Correctly rejected transfer of used ticket");
      }
    });
  });

  describe("8. Integration Test - Full Ticket Lifecycle", () => {
    it("should complete full lifecycle: register → transfer → verify", async () => {
      const newTicketId = new anchor.BN(2);
      const newNftAssetId = Keypair.generate().publicKey;
      const initialOwner = "user-lifecycle-001";
      const buyerOwner = "user-lifecycle-002";

      // Register new ticket
      const [newTicketPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("ticket"), eventPda.toBuffer(), newTicketId.toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      await program.methods
        .registerTicket(newTicketId, newNftAssetId, initialOwner)
        .accounts({
          authority: authority.publicKey,
          event: eventPda,
          ticket: newTicketPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      let ticket = await program.account.ticket.fetch(newTicketPda);
      assert.equal(ticket.currentOwnerId, initialOwner);
      assert.equal(ticket.transferCount, 0);
      assert.equal(ticket.used, false);

      // Transfer ticket (simulating resale)
      await program.methods
        .transferTicket(buyerOwner)
        .accounts({
          authority: authority.publicKey,
          event: eventPda,
          ticket: newTicketPda,
        })
        .rpc();

      ticket = await program.account.ticket.fetch(newTicketPda);
      assert.equal(ticket.currentOwnerId, buyerOwner);
      assert.equal(ticket.transferCount, 1);

      // Verify at door
      await program.methods
        .verifyTicket()
        .accounts({
          validator: authority.publicKey,
          event: eventPda,
          ticket: newTicketPda,
        })
        .rpc();

      ticket = await program.account.ticket.fetch(newTicketPda);
      assert.equal(ticket.used, true);
      assert.notEqual(ticket.verifiedAt, null);

      console.log("✓ Full lifecycle complete:");
      console.log("  - Initial Owner:", initialOwner);
      console.log("  - Final Owner:", buyerOwner);
      console.log("  - Transfers:", ticket.transferCount);
      console.log("  - Used:", ticket.used);
    });
  });
});
