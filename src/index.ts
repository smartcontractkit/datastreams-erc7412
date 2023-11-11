import dotenv from 'dotenv';
dotenv.config();
// import ChainlinkDataStreamsConsumer from `@hackbg/chainlink-datastreams-consumer`
// @ts-ignore
import ChainlinkDataStreamsConsumer from '../src/chainlink-datastream-consumer/index.js'
import { AbiCoder, JsonRpcProvider, Contract, isError } from 'ethers'
import { dataStreamsErc7412CompatibleAbi } from './abi.js'

async function fetchOffchainData(SDK: ChainlinkDataStreamsConsumer, oracleQueryData: string) {
    const abiCoder = new AbiCoder();

    const decodedData = abiCoder.decode([`string`, `string[]`, `string`, `uint`, `string`], oracleQueryData);

    const reports = await SDK.fetchFeeds({
        timestamp: `${decodedData[3]}`,
        feeds: decodedData[1]
    })

    console.log(reports);
}

async function main() {
    try {
        const contractAddress = process.env.DATA_STREAMS_ERC7412_COMPATIBLE_CONTRACT_ADDRESS!;
        const provider = new JsonRpcProvider(`https://arb-goerli.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`);
        const contract = new Contract(contractAddress, dataStreamsErc7412CompatibleAbi, provider);


        const SDK = new ChainlinkDataStreamsConsumer({
            hostname: process.env.CHAINLINK_API_URL!,
            wsHostname: process.env.CHAINLINK_WEBSOCKET_URL!,
            clientID: process.env.CHAINLINK_CLIENT_ID!,
            clientSecret: process.env.CHAINLINK_CLIENT_SECRET!,
        });

        const feedIds = [`0x00029584363bcf642315133c335b3646513c20f049602fc7d933be0d3f6360d3`, `0x0002f18a75a7750194a6476c9ab6d51276952471bd90404904211a9d47f34e64`]

        try {
            await contract.generate7412CompatibleCall(feedIds);
        } catch (err: any) {
            if (isError(err, `CALL_EXCEPTION`)) {
                const oracleQueryData = err.revert?.args[1];
                await fetchOffchainData(SDK, oracleQueryData);

                // TODO: Multicall reply
            }

        }
    } catch (error) {
        console.error('An error occurred:', error);
    }
}

main();