import { Address } from '@ton/core';
import { TonClient } from '@ton/ton';
import { SubscriptionFactory } from './build/SubscriptionFactory_SubscriptionFactory';

const FACTORY_ADDRESS = 'EQDSme6rVSaWqgWWNtqY9b-1ILxAoxh5a1o8nhVYag5MHYUs';

(async () => {
    const client = new TonClient({
        endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC',
        apiKey: '48d1010f4b83aef80086a889e221ee2d860d4d30915406c731461829db67f825'
    });

    const factoryAddress = Address.parse(FACTORY_ADDRESS);
    const factory = client.open(SubscriptionFactory.fromAddress(factoryAddress));

    try {
        const owner = await factory.getOwner();
        console.log('\n=== Factory Contract Info ===');
        console.log('Factory Address:', FACTORY_ADDRESS);
        console.log('Owner Address:', owner.toString());
        console.log('Owner (testnet format):', owner.toString({ testOnly: true }));
        console.log('Owner (raw):', owner.toRawString());
    } catch (error) {
        console.error('Error:', error);
    }
})();
