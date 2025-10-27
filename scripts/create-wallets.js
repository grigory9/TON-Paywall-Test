#!/usr/bin/env node

/**
 * TON Wallet Creation Script
 *
 * Creates two wallets for deployment:
 * 1. Owner Wallet - Receives subscription payments from channels
 * 2. Deployment Wallet - Deploys the factory contract
 *
 * This script uses TON SDK (@ton/ton, @ton/crypto) for wallet generation
 * and balance verification on testnet/mainnet.
 */

const { mnemonicNew, mnemonicToPrivateKey } = require('@ton/crypto');
const { TonClient, WalletContractV4, Address } = require('@ton/ton');
const { getHttpEndpoint } = require('@orbs-network/ton-access');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

const CACHE_FILE = path.join(process.cwd(), '.deploy-cache');
const MIN_BALANCE_OWNER = 1.0; // TON
const MIN_BALANCE_DEPLOYMENT = 1.0; // TON

/**
 * Read cached wallet data if exists
 */
function readCache(key) {
  if (!fs.existsSync(CACHE_FILE)) {
    return null;
  }

  const content = fs.readFileSync(CACHE_FILE, 'utf-8');
  const lines = content.split('\n');

  for (const line of lines) {
    if (line.startsWith(`${key}=`)) {
      return line.substring(key.length + 1);
    }
  }

  return null;
}

/**
 * Write wallet data to cache
 */
function writeCache(key, value) {
  let content = '';

  if (fs.existsSync(CACHE_FILE)) {
    content = fs.readFileSync(CACHE_FILE, 'utf-8');
  }

  // Remove existing entry for this key
  const lines = content.split('\n').filter(line => !line.startsWith(`${key}=`));

  // Add new entry
  lines.push(`${key}=${value}`);

  fs.writeFileSync(CACHE_FILE, lines.join('\n'), { mode: 0o600 });
}

/**
 * Ask user a yes/no question
 */
function askYesNo(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question(`${question} (Y/n): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() !== 'n');
    });
  });
}

/**
 * Wait for user to press Enter
 */
function waitForEnter(message) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question(`${message}\n`, () => {
      rl.close();
      resolve();
    });
  });
}

/**
 * Generate new TON wallet with mnemonic
 */
async function generateWallet(network) {
  // Generate 24-word mnemonic
  const mnemonic = await mnemonicNew(24);

  // Convert mnemonic to keypair
  const keyPair = await mnemonicToPrivateKey(mnemonic);

  // Create wallet contract (v4r2 is current standard)
  const wallet = WalletContractV4.create({
    workchain: 0,
    publicKey: keyPair.publicKey
  });

  return {
    address: wallet.address.toString({ testOnly: network === 'testnet' }),
    mnemonic: mnemonic.join(' '),
    publicKey: keyPair.publicKey.toString('hex')
  };
}

/**
 * Get wallet balance from blockchain
 */
async function getBalance(address, network) {
  try {
    // Get endpoint for network
    const endpoint = await getHttpEndpoint({
      network: network === 'testnet' ? 'testnet' : 'mainnet'
    });

    // Create TON client
    const client = new TonClient({ endpoint });

    // Parse address
    const addr = Address.parse(address);

    // Get balance
    const balance = await client.getBalance(addr);

    // Convert from nanotons to TON
    return Number(balance) / 1e9;
  } catch (error) {
    console.error(`${colors.red}Error checking balance: ${error.message}${colors.reset}`);
    return 0;
  }
}

/**
 * Wait for wallet to be funded
 */
async function waitForFunding(address, network, minBalance, walletName) {
  console.log(`\n${colors.yellow}Waiting for ${walletName} to be funded...${colors.reset}`);
  console.log(`${colors.cyan}Minimum required: ${minBalance} TON${colors.reset}\n`);

  let attempts = 0;
  const maxAttempts = 60; // 5 minutes with 5-second intervals

  while (attempts < maxAttempts) {
    const balance = await getBalance(address, network);

    process.stdout.write(`\r${colors.cyan}Current balance: ${balance.toFixed(4)} TON${colors.reset}     `);

    if (balance >= minBalance) {
      console.log(`\n${colors.green}✓ ${walletName} funded successfully!${colors.reset}\n`);
      return balance;
    }

    attempts++;
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
  }

  console.log(`\n${colors.yellow}Timeout waiting for funding. Please check the wallet and try again.${colors.reset}\n`);
  return 0;
}

/**
 * Display wallet information
 */
function displayWallet(name, wallet, network) {
  console.log(`\n${colors.bold}${colors.green}${name}${colors.reset}`);
  console.log(`${'='.repeat(70)}`);
  console.log(`${colors.cyan}Address:${colors.reset}`);
  console.log(`  ${wallet.address}`);
  console.log(`\n${colors.cyan}Mnemonic (24 words):${colors.reset}`);
  console.log(`  ${wallet.mnemonic}`);
  console.log(`\n${colors.yellow}⚠️  SAVE THIS MNEMONIC SECURELY!${colors.reset}`);
  console.log(`   This is the ONLY way to recover your wallet.`);
  console.log(`   Never share it with anyone.`);
  console.log(`${'='.repeat(70)}\n`);
}

/**
 * Main wallet creation flow
 */
async function main() {
  // Get network from environment or command line
  const network = process.argv[2] || process.env.TON_NETWORK || 'testnet';

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║          TON Wallet Creation for Paywall Deployment         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log(`${colors.cyan}Network: ${network}${colors.reset}\n`);

  let ownerWallet, deploymentWallet;
  let useExisting = false;

  // Check for existing wallets in cache
  const cachedOwnerAddress = readCache('OWNER_WALLET_ADDRESS');
  const cachedDeploymentAddress = readCache('DEPLOYMENT_WALLET_ADDRESS');

  if (cachedOwnerAddress && cachedDeploymentAddress) {
    console.log(`${colors.yellow}Found existing wallet configuration:${colors.reset}`);
    console.log(`  Owner Wallet: ${cachedOwnerAddress}`);
    console.log(`  Deployment Wallet: ${cachedDeploymentAddress}\n`);

    useExisting = await askYesNo('Use existing wallets?');

    if (useExisting) {
      ownerWallet = {
        address: cachedOwnerAddress,
        mnemonic: readCache('OWNER_WALLET_MNEMONIC'),
        publicKey: readCache('OWNER_WALLET_PUBKEY')
      };

      deploymentWallet = {
        address: cachedDeploymentAddress,
        mnemonic: readCache('DEPLOYMENT_WALLET_MNEMONIC'),
        publicKey: readCache('DEPLOYMENT_WALLET_PUBKEY')
      };
    }
  }

  // Generate new wallets if needed
  if (!useExisting) {
    console.log(`${colors.cyan}Generating Owner Wallet...${colors.reset}`);
    ownerWallet = await generateWallet(network);
    displayWallet('OWNER WALLET (Receives Payments)', ownerWallet, network);

    console.log(`${colors.cyan}Generating Deployment Wallet...${colors.reset}`);
    deploymentWallet = await generateWallet(network);
    displayWallet('DEPLOYMENT WALLET (Deploys Contracts)', deploymentWallet, network);

    // Save to cache
    writeCache('OWNER_WALLET_ADDRESS', ownerWallet.address);
    writeCache('OWNER_WALLET_MNEMONIC', ownerWallet.mnemonic);
    writeCache('OWNER_WALLET_PUBKEY', ownerWallet.publicKey);

    writeCache('DEPLOYMENT_WALLET_ADDRESS', deploymentWallet.address);
    writeCache('DEPLOYMENT_WALLET_MNEMONIC', deploymentWallet.mnemonic);
    writeCache('DEPLOYMENT_WALLET_PUBKEY', deploymentWallet.publicKey);

    console.log(`${colors.green}✓ Wallet information saved to ${CACHE_FILE}${colors.reset}`);
    console.log(`${colors.red}⚠️  Keep this file secure! It contains your wallet mnemonics.${colors.reset}\n`);
  }

  // Display funding instructions
  console.log(`\n${colors.bold}${colors.yellow}FUNDING REQUIRED${colors.reset}`);
  console.log(`${'='.repeat(70)}`);
  console.log(`\nPlease send TON to these addresses:\n`);

  console.log(`${colors.cyan}1. Owner Wallet (${MIN_BALANCE_OWNER} TON):${colors.reset}`);
  console.log(`   ${ownerWallet.address}`);

  console.log(`\n${colors.cyan}2. Deployment Wallet (${MIN_BALANCE_DEPLOYMENT} TON):${colors.reset}`);
  console.log(`   ${deploymentWallet.address}\n`);

  if (network === 'testnet') {
    console.log(`${colors.yellow}Get testnet TON from faucet:${colors.reset}`);
    console.log(`   https://testnet.tonfaucet.com`);
    console.log(`   https://t.me/testgiver_ton_bot\n`);
  } else {
    console.log(`${colors.yellow}Send mainnet TON from your wallet or exchange${colors.reset}\n`);
  }

  await waitForEnter('Press Enter once you have sent TON to both addresses...');

  // Check balances
  console.log(`${colors.cyan}Verifying wallet balances...${colors.reset}\n`);

  const ownerBalance = await waitForFunding(
    ownerWallet.address,
    network,
    MIN_BALANCE_OWNER,
    'Owner Wallet'
  );

  const deploymentBalance = await waitForFunding(
    deploymentWallet.address,
    network,
    MIN_BALANCE_DEPLOYMENT,
    'Deployment Wallet'
  );

  if (ownerBalance < MIN_BALANCE_OWNER || deploymentBalance < MIN_BALANCE_DEPLOYMENT) {
    console.log(`${colors.red}✗ Insufficient balance in one or both wallets${colors.reset}`);
    console.log(`${colors.yellow}Please fund the wallets and run this script again${colors.reset}\n`);
    process.exit(1);
  }

  // Success!
  console.log(`\n${colors.bold}${colors.green}SUCCESS!${colors.reset}`);
  console.log(`${'='.repeat(70)}`);
  console.log(`${colors.green}✓ Owner Wallet: ${ownerBalance.toFixed(4)} TON${colors.reset}`);
  console.log(`${colors.green}✓ Deployment Wallet: ${deploymentBalance.toFixed(4)} TON${colors.reset}`);
  console.log(`${'='.repeat(70)}\n`);

  // Output wallet info for shell script to parse
  console.log('WALLET_CREATION_SUCCESS=true');
  console.log(`OWNER_WALLET_ADDRESS=${ownerWallet.address}`);
  console.log(`DEPLOYMENT_WALLET_ADDRESS=${deploymentWallet.address}`);
  console.log(`OWNER_WALLET_MNEMONIC=${ownerWallet.mnemonic}`);
  console.log(`DEPLOYMENT_WALLET_MNEMONIC=${deploymentWallet.mnemonic}`);

  console.log(`\n${colors.cyan}Next step: Factory contract deployment${colors.reset}\n`);
}

// Run main function
main().catch((error) => {
  console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
  console.error(error.stack);
  process.exit(1);
});
