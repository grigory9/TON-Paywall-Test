import { toNano } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { SubscriptionFactory } from '../build/SubscriptionFactory_SubscriptionFactory';

/**
 * Deploy SubscriptionFactory Contract
 *
 * This factory contract will be used to deploy individual subscription contracts
 * for each Telegram channel that uses the paywall system.
 */
export async function run(provider: NetworkProvider) {
    console.log('\n🚀 Deploying SubscriptionFactory Contract...\n');

    // Get the owner address (the address that will own the factory)
    const ownerAddress = provider.sender().address!;

    console.log(`👤 Owner Address: ${ownerAddress.toString()}`);
    console.log(`🌐 Network: ${provider.network()}\n`);

    // Initialize factory with owner address
    const factory = provider.open(await SubscriptionFactory.fromInit(ownerAddress));

    console.log(`📍 Factory Address: ${factory.address.toString()}\n`);

    // Check if already deployed
    const isDeployed = await provider.isContractDeployed(factory.address);

    if (isDeployed) {
        console.log('✅ SubscriptionFactory already deployed!');
        console.log('\n📋 Update your .env file:');
        console.log(`FACTORY_CONTRACT_ADDRESS="${factory.address.toString()}"\n`);

        console.log('📊 Verify on TONScan:');
        const network = provider.network();
        const scanUrl = network === 'mainnet'
            ? `https://tonscan.org/address/${factory.address.toString()}`
            : `https://testnet.tonscan.org/address/${factory.address.toString()}`;
        console.log(`   ${scanUrl}\n`);
        return;
    }

    console.log('⏳ Deploying contract...');
    console.log('💰 Deployment cost: ~0.05 TON');
    console.log('⚠️  Please approve the transaction in your wallet\n');

    // Deploy using Deployable trait
    await factory.send(
        provider.sender(),
        {
            value: toNano('0.05'),
            bounce: false
        },
        {
            $$type: 'Deploy',
            queryId: 0n
        }
    );

    // Wait for deployment to complete
    await provider.waitForDeploy(factory.address);

    console.log('✅ SubscriptionFactory deployed successfully!\n');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📋 Contract Configuration:');
    console.log(`   Factory Address: ${factory.address.toString()}`);
    console.log(`   Owner: ${ownerAddress.toString()}`);
    console.log(`   Deployment Fee: 0.1 TON`);
    console.log(`   Network: ${provider.network()}`);
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('📝 Next Steps:\n');
    console.log('1. Update .env file in project root:');
    console.log(`   FACTORY_CONTRACT_ADDRESS="${factory.address.toString()}"\n`);

    console.log('2. Verify on TONScan:');
    const network = provider.network();
    const scanUrl = network === 'mainnet'
        ? `https://tonscan.org/address/${factory.address.toString()}`
        : `https://testnet.tonscan.org/address/${factory.address.toString()}`;
    console.log(`   ${scanUrl}\n`);

    console.log('3. Start the bots:');
    console.log('   cd admin-bot && npm run dev');
    console.log('   cd payment-bot && npm run dev\n');

    console.log('4. Test channel setup:');
    console.log('   • Open admin bot in Telegram');
    console.log('   • Use /start command');
    console.log('   • Follow channel setup wizard');
    console.log('   • Bot will use this factory to deploy subscription contracts\n');

    console.log('✅ Deployment complete! Factory is ready to use.');
}
