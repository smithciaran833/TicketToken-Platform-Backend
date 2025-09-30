import { logger } from '../config/logger';
import { db } from '../config/database';

interface TranslationData {
  [key: string]: string | TranslationData;
}

export class I18nService {
  private translations: Map<string, TranslationData> = new Map();
  private readonly supportedLanguages = ['en', 'es', 'fr', 'de', 'pt', 'zh', 'ja'];
  private readonly defaultLanguage = 'en';

  async loadTranslations() {
    for (const lang of this.supportedLanguages) {
      const translations = await db('translations')
        .where('language', lang)
        .select('key', 'value');

      const data: TranslationData = {};
      for (const trans of translations) {
        this.setNestedProperty(data, trans.key, trans.value);
      }

      this.translations.set(lang, data);
    }

    logger.info('Translations loaded', { 
      languages: this.supportedLanguages 
    });
  }

  translate(
    key: string,
    language: string = this.defaultLanguage,
    variables?: Record<string, any>
  ): string {
    const lang = this.supportedLanguages.includes(language) 
      ? language 
      : this.defaultLanguage;

    const translations = this.translations.get(lang) || {};
    const value = this.getNestedProperty(translations, key);

    if (!value) {
      logger.warn('Translation missing', { key, language });
      return key;
    }

    // Replace variables
    let translated = value as string;
    if (variables) {
      Object.entries(variables).forEach(([varKey, varValue]) => {
        translated = translated.replace(
          new RegExp(`{{${varKey}}}`, 'g'),
          String(varValue)
        );
      });
    }

    return translated;
  }

  detectLanguage(text: string): string {
    // Simple language detection based on character sets
    // In production, would use a proper language detection library
    
    if (/[\u4e00-\u9fff]/.test(text)) return 'zh'; // Chinese
    if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return 'ja'; // Japanese
    if (/[àâäæçéèêëïîôùûüÿœ]/i.test(text)) return 'fr'; // French
    if (/[áéíóúñ¿¡]/i.test(text)) return 'es'; // Spanish
    if (/[äöüßẞ]/i.test(text)) return 'de'; // German
    if (/[ãõçáéíóú]/i.test(text)) return 'pt'; // Portuguese
    
    return 'en';
  }

  async translateTemplate(
    templateContent: string,
    fromLang: string,
    toLang: string
  ): Promise<string> {
    // In production, this would use a translation API (Google Translate, DeepL, etc.)
    // For now, return the original content
    
    logger.info('Template translation requested', { 
      from: fromLang, 
      to: toLang 
    });
    
    return templateContent;
  }

  formatDate(date: Date, language: string): string {
    const locale = {
      en: 'en-US',
      es: 'es-ES',
      fr: 'fr-FR',
      de: 'de-DE',
      pt: 'pt-BR',
      zh: 'zh-CN',
      ja: 'ja-JP',
    }[language] || 'en-US';

    return date.toLocaleDateString(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  formatCurrency(amount: number, currency: string, language: string): string {
    const locale = {
      en: 'en-US',
      es: 'es-ES',
      fr: 'fr-FR',
      de: 'de-DE',
      pt: 'pt-BR',
      zh: 'zh-CN',
      ja: 'ja-JP',
    }[language] || 'en-US';

    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
    }).format(amount);
  }

  private setNestedProperty(obj: any, path: string, value: any) {
    const keys = path.split('.');
    let current = obj;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    
    current[keys[keys.length - 1]] = value;
  }

  private getNestedProperty(obj: any, path: string): any {
    const keys = path.split('.');
    let current = obj;
    
    for (const key of keys) {
      if (!current[key]) return null;
      current = current[key];
    }
    
    return current;
  }
}

export const i18nService = new I18nService();
