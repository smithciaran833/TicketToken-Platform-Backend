const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_51RxcsfJkJx8oljhBMmJw24AvFmPu1uGXq0Ef5DWGt67IDRacHWFAnF0iy1qogYD9Mri1djgkoOCeQXtz26E08p0H00mIr9zHty', {
  apiVersion: '2024-11-20.acacia',
});

async function test() {
  try {
    const account = await stripe.accounts.create({
      type: 'express',
      country: 'US',
      email: 'test@example.com',
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });
    console.log('SUCCESS:', account.id);
  } catch (error) {
    console.error('ERROR:', error.message);
    console.error('TYPE:', error.type);
    console.error('CODE:', error.code);
    console.error('FULL:', error);
  }
}

test();
