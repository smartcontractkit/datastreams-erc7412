import dotenv from "dotenv";
dotenv.config();
// import ChainlinkDataStreamsConsumer from `@hackbg/chainlink-datastreams-consumer` // TODO @andrejrakic why are we vendoring this pkg and not importing it? it is a dep in package.json
// @ts-ignore
import ChainlinkDataStreamsConsumer from "../src/chainlink-datastream-consumer/index.js"; 
import { AbiCoder, JsonRpcProvider, Contract, isError } from "ethers";
import { dataStreamsErc7412CompatibleAbi } from "./abi.js";

/* 
* Fetch multiple data streams from Chainlink
*/
async function fetchOffchainData(
  SDK: ChainlinkDataStreamsConsumer,
  oracleQueryData: string
): Promise<{}> {
  const abiCoder = new AbiCoder();

  const decodedData = abiCoder.decode(
    // TODO @andrejrakic the oracleQueryData is the same abi as the StreamsLookUp error right?  
    // The last data type (for extraData)  is bytes, not string?
    // Ref: https://docs.chain.link/chainlink-automation/reference/automation-interfaces#streamslookup-revert
    [`string`, `string[]`, `string`, `uint`, `string`], 
    oracleQueryData
  );

  const reports:{} = await SDK.fetchFeeds({
    timestamp: `${decodedData[3]}`,
    feeds: decodedData[1],
  });

  console.log(reports);
  return reports
}

async function main() {
  try {
    
    if (
      !process.env.DATA_STREAMS_ERC7412_COMPATIBLE_CONTRACT_ADDRESS! ||
      !process.env.ALCHEMY_KEY
    ) {
      throw Error(`Missing environment variables`);
    } // TODO @andrejrakic added this for helpful debugging

    const contractAddress =
      process.env.DATA_STREAMS_ERC7412_COMPATIBLE_CONTRACT_ADDRESS!;
    const provider = new JsonRpcProvider(
      `https://arb-goerli.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`
    );
    const contract = new Contract(
      contractAddress,
      dataStreamsErc7412CompatibleAbi,
      provider
    );

    const SDK = new ChainlinkDataStreamsConsumer({
      hostname: process.env.CHAINLINK_API_URL!,
      wsHostname: process.env.CHAINLINK_WEBSOCKET_URL!,
      clientID: process.env.CHAINLINK_CLIENT_ID!,
      clientSecret: process.env.CHAINLINK_CLIENT_SECRET!,
    });

    const ethUsdFeedIds = [
      `0x00029584363bcf642315133c335b3646513c20f049602fc7d933be0d3f6360d3`,
      `0x0002f18a75a7750194a6476c9ab6d51276952471bd90404904211a9d47f34e64`, // @andrejrakic not found in streams docs. should it be 0x00038d1de2df4b92b594761d8013eb10d97e9f0a002d02c91b99cb912b242e95
    ];

    try {
      await contract.generate7412CompatibleCall(ethUsdFeedIds);
    } catch (err: any) {
      if (isError(err, `CALL_EXCEPTION`)) {
        const oracleQueryData = err.revert?.args[1];
        await fetchOffchainData(SDK, oracleQueryData);

        // TODO: Multicall reply
        // TODO @andrejrakic how are you thinking about this?  One way could be
        // to take each id in the FeedIds returned by in oracleQueryData, 
        // convert them into a `Call3` struct as per multicall3_1
        // and put the verifier contract as the target for each
        // and then pass that array of call structs to the multicall contract?
        // That way its the verification step that is done as multicall. 
        
      }
    }
  } catch (error) {
    console.error("An error occurred:", error);
  }
}


