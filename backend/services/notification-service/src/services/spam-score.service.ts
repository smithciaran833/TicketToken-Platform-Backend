import { logger } from '../config/logger';

interface SpamCheckResult {
  score: number;
  flags: string[];
  passed: boolean;
  recommendations: string[];
}

export class SpamScoreService {
  private readonly MAX_ACCEPTABLE_SCORE = 5;
  
  async checkContent(
    subject: string,
    content: string,
    htmlContent?: string
  ): Promise<SpamCheckResult> {
    const flags: string[] = [];
    const recommendations: string[] = [];
    let score = 0;

    // Combine all content for analysis
    const fullContent = `${subject} ${content} ${htmlContent || ''}`.toLowerCase();

    // Check spam trigger words
    score += this.checkSpamWords(fullContent, flags);
    
    // Check capitalization
    score += this.checkCapitalization(fullContent, flags);
    
    // Check punctuation
    score += this.checkPunctuation(fullContent, flags);
    
    // Check links
    score += this.checkLinks(htmlContent || content, flags);
    
    // Check images ratio
    if (htmlContent) {
      score += this.checkImageRatio(htmlContent, flags);
    }
    
    // Check subject line
    score += this.checkSubjectLine(subject, flags);
    
    // Generate recommendations
    if (score > 3) {
      recommendations.push('Consider rewording to avoid spam triggers');
    }
    if (flags.includes('excessive_caps')) {
      recommendations.push('Reduce use of capital letters');
    }
    if (flags.includes('too_many_links')) {
      recommendations.push('Reduce the number of links');
    }

    const result = {
      score,
      flags,
      passed: score <= this.MAX_ACCEPTABLE_SCORE,
      recommendations,
    };

    logger.info('Spam check completed', result);
    return result;
  }

  private checkSpamWords(content: string, flags: string[]): number {
    let score = 0;
    
    const highRiskWords = [
      'viagra', 'pills', 'weight loss', 'get rich', 'work from home',
      'nigerian prince', 'inheritance', 'winner', 'selected'
    ];
    
    const mediumRiskWords = [
      'free', 'guarantee', 'no obligation', 'risk free', 'urgent',
      'act now', 'limited time', 'exclusive deal', 'click here'
    ];
    
    const lowRiskWords = [
      'sale', 'discount', 'offer', 'special', 'new', 'important'
    ];

    // Check high risk words (3 points each)
    for (const word of highRiskWords) {
      if (content.includes(word)) {
        score += 3;
        flags.push(`high_risk_word: ${word}`);
      }
    }

    // Check medium risk words (2 points each)
    for (const word of mediumRiskWords) {
      if (content.includes(word)) {
        score += 2;
        flags.push(`medium_risk_word: ${word}`);
      }
    }

    // Check low risk words (1 point each)
    let lowRiskCount = 0;
    for (const word of lowRiskWords) {
      if (content.includes(word)) {
        lowRiskCount++;
      }
    }
    if (lowRiskCount > 3) {
      score += lowRiskCount;
      flags.push('multiple_promotional_words');
    }

    return score;
  }

  private checkCapitalization(content: string, flags: string[]): number {
    const upperCount = (content.match(/[A-Z]/g) || []).length;
    const totalCount = content.length;
    const ratio = upperCount / totalCount;

    if (ratio > 0.3) {
      flags.push('excessive_caps');
      return 3;
    } else if (ratio > 0.2) {
      flags.push('high_caps');
      return 1;
    }
    
    return 0;
  }

  private checkPunctuation(content: string, flags: string[]): number {
    let score = 0;
    
    // Check excessive exclamation marks
    const exclamationCount = (content.match(/!/g) || []).length;
    if (exclamationCount > 5) {
      score += 2;
      flags.push('excessive_exclamation');
    } else if (exclamationCount > 3) {
      score += 1;
      flags.push('multiple_exclamation');
    }

    // Check excessive question marks
    const questionCount = (content.match(/\?/g) || []).length;
    if (questionCount > 5) {
      score += 1;
      flags.push('excessive_questions');
    }

    // Check for $$$ or similar
    if (content.includes('$$$') || content.includes('€€€')) {
      score += 2;
      flags.push('money_symbols');
    }

    return score;
  }

  private checkLinks(content: string, flags: string[]): number {
    const linkCount = (content.match(/https?:\/\//gi) || []).length;
    
    if (linkCount > 10) {
      flags.push('too_many_links');
      return 3;
    } else if (linkCount > 5) {
      flags.push('multiple_links');
      return 1;
    }
    
    // Check for URL shorteners
    const shorteners = ['bit.ly', 'tinyurl', 'goo.gl', 'ow.ly'];
    for (const shortener of shorteners) {
      if (content.includes(shortener)) {
        flags.push('url_shortener');
        return 2;
      }
    }
    
    return 0;
  }

  private checkImageRatio(htmlContent: string, flags: string[]): number {
    const imgCount = (htmlContent.match(/<img/gi) || []).length;
    const textLength = htmlContent.replace(/<[^>]*>/g, '').length;
    
    if (textLength < 100 && imgCount > 1) {
      flags.push('image_heavy');
      return 2;
    }
    
    return 0;
  }

  private checkSubjectLine(subject: string, flags: string[]): number {
    let score = 0;
    
    // Check if subject is all caps
    if (subject === subject.toUpperCase() && subject.length > 5) {
      flags.push('subject_all_caps');
      score += 2;
    }
    
    // Check for RE: or FWD: spam
    if (subject.match(/^(re:|fwd?:)/i) && !subject.match(/^(re:|fwd?):\s*\w/i)) {
      flags.push('fake_reply');
      score += 3;
    }
    
    // Check for empty or very short subject
    if (subject.length < 3) {
      flags.push('short_subject');
      score += 1;
    }
    
    return score;
  }
}

export const spamScoreService = new SpamScoreService();
