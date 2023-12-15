import dotenv from 'dotenv';
dotenv.config();
// import ChainlinkDataStreamsConsumer from `@hackbg/chainlink-datastreams-consumer`
// @ts-ignore
import ChainlinkDataStreamsConsumer from '../src/chainlink-datastream-consumer/index.js'
import { Wallet, AbiCoder, JsonRpcProvider, Contract, isError } from 'ethers'
import { dataStreamsErc7412CompatibleAbi, multicall3_1Abi } from './abi.js'

async function fetchOffchainData(SDK: ChainlinkDataStreamsConsumer, oracleQueryData: string) {
    const abiCoder = new AbiCoder();

    const decodedData = abiCoder.decode([`string`, `string[]`, `string`, `uint`, `string`], oracleQueryData);

    const report = await SDK.fetchLatestFeedRaw({
        feed: decodedData[1][0]
    })

    const extraData = "0x" // empty
    const signedOffchainData = abiCoder.encode(["bytes[]", "bytes"], [[report], extraData])

    return signedOffchainData;
}

async function main() {
    try {
        if (!process.env.WALLET_PRIVATE_KEY) {
            console.error(`Environment Variables Not Set`);
            return 1;
        }

        const provider = new JsonRpcProvider(`https://arb-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`);
        const wallet = new Wallet(process.env.WALLET_PRIVATE_KEY, provider);

        const dataStreamsErc7412CompatibleAddress = process.env.DATA_STREAMS_ERC7412_COMPATIBLE_CONTRACT_ADDRESS!;
        const dataStreamsErc7412Compatible = new Contract(dataStreamsErc7412CompatibleAddress, dataStreamsErc7412CompatibleAbi, wallet);

        const multicall3_1Address = process.env.MULTICALL3_1_ADDRESS!;
        const multicall3_1 = new Contract(multicall3_1Address, multicall3_1Abi, wallet);


        const SDK = new ChainlinkDataStreamsConsumer({
            hostname: process.env.CHAINLINK_API_URL!,
            wsHostname: process.env.CHAINLINK_WEBSOCKET_URL!,
            clientID: process.env.CHAINLINK_CLIENT_ID!,
            clientSecret: process.env.CHAINLINK_CLIENT_SECRET!,
        });

        // TODO: This should not be hardcoded, rather pushed as an argument from CLI
        const feedIds = [`0x00027bbaff688c906a3e20a34fe951715d1018d262a5b66e38eda027a674cd1b`]

        try {
            await dataStreamsErc7412Compatible.generate7412CompatibleCall(feedIds);
        } catch (err: any) {
            if (isError(err, `CALL_EXCEPTION`)) {
                const oracleQueryData = err.revert?.args[1];
                const signedOffchainData = await fetchOffchainData(SDK, oracleQueryData);

                const fulfillOracleQueryCalldata = dataStreamsErc7412Compatible.interface.encodeFunctionData(`fulfillOracleQuery`, [signedOffchainData]);

                const call = {
                    target: dataStreamsErc7412CompatibleAddress,
                    allowFailure: true,
                    callData: fulfillOracleQueryCalldata
                }

                const tx = await multicall3_1.aggregate3([call]);

                console.log(`Transaction hash: https://sepolia.arbiscan.io/tx/${tx.hash}`);
            }

        }
    } catch (error) {
        console.error('An error occurred:', error);
    }
}

main();