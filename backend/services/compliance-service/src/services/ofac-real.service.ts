import axios from 'axios';
import xml2js from 'xml2js';
import { db } from './database.service';
import { redis } from './redis.service';

export class RealOFACService {
  private readonly OFAC_SDN_URL = 'https://www.treasury.gov/ofac/downloads/sdn.xml';
  private readonly OFAC_CONSOLIDATED_URL = 'https://www.treasury.gov/ofac/downloads/consolidated/consolidated.xml';
  
  async downloadAndUpdateOFACList(): Promise<void> {
    try {
      console.log('📥 Downloading OFAC SDN list from Treasury...');
      
      const response = await axios.get(this.OFAC_SDN_URL, {
        responseType: 'text',
        timeout: 30000
      });
      
      const parser = new xml2js.Parser();
      const result = await parser.parseStringPromise(response.data);
      
      // Clear existing OFAC data
      await db.query('TRUNCATE TABLE ofac_sdn_list');
      
      // Parse and store SDN entries
      const sdnEntries = result.sdnList?.sdnEntry || [];
      let processed = 0;
      
      for (const entry of sdnEntries) {
        const uid = entry.uid?.[0];
        const firstName = entry.firstName?.[0] || '';
        const lastName = entry.lastName?.[0] || '';
        const fullName = `${firstName} ${lastName}`.trim();
        const sdnType = entry.sdnType?.[0];
        const programList = entry.programList?.[0]?.program || [];
        
        await db.query(
          `INSERT INTO ofac_sdn_list 
           (uid, full_name, first_name, last_name, sdn_type, programs, raw_data)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [uid, fullName, firstName, lastName, sdnType, 
           JSON.stringify(programList), JSON.stringify(entry)]
        );
        
        processed++;
        if (processed % 100 === 0) {
          console.log(`  Processed ${processed} OFAC entries...`);
        }
      }
      
      console.log(`✅ OFAC list updated: ${processed} entries`);
      
      // Update last update timestamp
      await redis.set('ofac:last_update', new Date().toISOString());
      
    } catch (error) {
      console.error('❌ Failed to update OFAC list:', error);
      throw error;
    }
  }
  
  async checkAgainstOFAC(name: string, fuzzyMatch: boolean = true): Promise<{
    isMatch: boolean;
    confidence: number;
    matches: any[];
  }> {
    const normalizedName = name.toUpperCase().trim();
    
    // Check cache first
    const cacheKey = `ofac:check:${normalizedName}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
    
    // Search in database
    let query = `
      SELECT * FROM ofac_sdn_list 
      WHERE UPPER(full_name) = $1
    `;
    
    if (fuzzyMatch) {
      // Use PostgreSQL's similarity functions
      query = `
        SELECT *, 
               similarity(UPPER(full_name), $1) as score
        FROM ofac_sdn_list 
        WHERE similarity(UPPER(full_name), $1) > 0.3
        ORDER BY score DESC
        LIMIT 10
      `;
    }
    
    const result = await db.query(query, [normalizedName]);
    
    const response = {
      isMatch: result.rows.length > 0,
      confidence: result.rows[0]?.score ? Math.round(result.rows[0].score * 100) : 0,
      matches: result.rows.map(row => ({
        name: row.full_name,
        type: row.sdn_type,
        programs: row.programs,
        score: row.score
      }))
    };
    
    // Cache for 24 hours
    await redis.set(cacheKey, JSON.stringify(response), 86400);
    
    return response;
  }
}

export const realOFACService = new RealOFACService();
