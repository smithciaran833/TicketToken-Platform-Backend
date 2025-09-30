import { redis } from './redis.service';

export class OFACService {
  // In production, this would download from Treasury
  private mockOFACList = [
    'Bad Actor Company',
    'Sanctioned Venue LLC',
    'Blocked Entertainment Inc'
  ];
  
  async checkName(name: string): Promise<{
    isMatch: boolean;
    confidence: number;
    matchedName?: string;
  }> {
    // Normalize name for checking
    const normalizedName = name.toLowerCase().trim();
    
    // Check cache first
    const cached = await redis.get(`ofac:${normalizedName}`);
    if (cached) {
      return JSON.parse(cached);
    }
    
    // Mock OFAC check (in production, use real Treasury API)
    let isMatch = false;
    let confidence = 0;
    let matchedName = undefined;
    
    for (const sanctionedName of this.mockOFACList) {
      if (normalizedName.includes(sanctionedName.toLowerCase())) {
        isMatch = true;
        confidence = 95;
        matchedName = sanctionedName;
        break;
      }
      
      // Fuzzy matching simulation
      if (this.fuzzyMatch(normalizedName, sanctionedName.toLowerCase())) {
        isMatch = true;
        confidence = 75;
        matchedName = sanctionedName;
        break;
      }
    }
    
    const result = { isMatch, confidence, matchedName };
    
    // Cache result for 24 hours
    await redis.set(`ofac:${normalizedName}`, JSON.stringify(result), 86400);
    
    return result;
  }
  
  private fuzzyMatch(str1: string, str2: string): boolean {
    // Simple fuzzy match - in production use Levenshtein distance
    const words1 = str1.split(' ');
    const words2 = str2.split(' ');
    
    let matches = 0;
    for (const word1 of words1) {
      for (const word2 of words2) {
        if (word1.length > 3 && word2.length > 3) {
          if (word1.includes(word2) || word2.includes(word1)) {
            matches++;
          }
        }
      }
    }
    
    return matches > 0;
  }
  
  async updateOFACList() {
    // In production: download from https://www.treasury.gov/ofac/downloads/sdn.xml
    console.log('📥 Mock OFAC list update (in production, downloads from Treasury)');
    return true;
  }
}

export const ofacService = new OFACService();
