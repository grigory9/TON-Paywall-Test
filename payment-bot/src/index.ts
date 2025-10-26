import { config } from 'dotenv';
import { PaymentBot } from './bot';

// Load environment variables
config();

// Validate required environment variables
const requiredEnvVars = [
  'PAYMENT_BOT_TOKEN',
  'DATABASE_URL',
  'FACTORY_CONTRACT_ADDRESS',
  'TON_NETWORK'
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// Production environment checks
if (process.env.NODE_ENV === 'production') {
  const productionChecks = [
    {
      key: 'DATABASE_URL',
      test: (val: string) => val.includes('localhost') || val.includes('127.0.0.1'),
      message: 'DATABASE_URL contains localhost in production!'
    },
    {
      key: 'TON_NETWORK',
      test: (val: string) => val === 'testnet',
      message: 'Running on testnet in production mode!'
    }
  ];

  for (const check of productionChecks) {
    const value = process.env[check.key];
    if (value && check.test(value)) {
      console.error(`⚠️  SECURITY WARNING: ${check.message}`);
      console.error('  If this is intentional, set NODE_ENV to development');
      process.exit(1);
    }
  }
}

async function main() {
  console.log('🚀 Starting Payment Bot...');
  console.log(`Network: ${process.env.TON_NETWORK}`);
  console.log(`Factory: ${process.env.FACTORY_CONTRACT_ADDRESS}`);

  const bot = new PaymentBot(
    process.env.PAYMENT_BOT_TOKEN!,
    process.env.DATABASE_URL!
  );

  // Handle graceful shutdown
  process.once('SIGINT', () => {
    console.log('\n⏹ Shutting down Payment Bot...');
    bot.stop();
    process.exit(0);
  });

  process.once('SIGTERM', () => {
    console.log('\n⏹ Shutting down Payment Bot...');
    bot.stop();
    process.exit(0);
  });

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught exception:', error);
  });

  process.on('unhandledRejection', (error) => {
    console.error('❌ Unhandled rejection:', error);
  });

  try {
    await bot.start();
    console.log('✅ Payment Bot started successfully');
  } catch (error) {
    console.error('❌ Failed to start Payment Bot:', error);
    process.exit(1);
  }
}

main();
