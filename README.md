## DataStreams - ERC 7412

WIP

1. Install dependencies:

```
forge install
```

```
npm install
```

2. Compile smart contracts:

```
forge build
```

3. Deploy `DataStreamsERC7412Compatible` smart contract

```
forge create --rpc-url <ARBITRUM_GOERLI_RPC_URL> --private-key <DEPLOYER_PRIVATE_KEY> contracts/DataStreamsERC7412Compatible.sol:DataStreamsERC7412Compatible --constructor-args 0xea9B98Be000FBEA7f6e88D08ebe70EbaAD10224c
```

4. Set the following environment variables

```
CHAINLINK_CLIENT_ID=
CHAINLINK_CLIENT_SECRET=
CHAINLINK_API_URL=
CHAINLINK_WEBSOCKET_URL=
ALCHEMY_KEY=
DATA_STREAMS_ERC7412_COMPATIBLE_CONTRACT_ADDRESS=
```

5. Trigger `OracleDataRequired` error

```
npm start
```
