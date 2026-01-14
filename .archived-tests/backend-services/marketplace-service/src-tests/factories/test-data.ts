// Simple test data generators to replace faker
export const testData = {
  uuid: () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  },
  
  email: () => {
    const random = Math.floor(Math.random() * 10000);
    return `test${random}@example.com`;
  },
  
  alphanumeric: (length: number) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },
  
  price: (min: number = 10, max: number = 500) => {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
};
