# Chainlink Data Streams Consumer

This package can authenticate to the Chainlink Data Streams API,
fetch reports from feeds, and decode them to a format that is
usable in a JavaScript environment.

In Node.js, it can also subscribe to the corresponding WebSocket API,
and receive low-latency updates. For now, the latter is unavailable
in browsers, because the header-based authentication used by the
Chainlink for WebSockets does not seem to be usable in Web browsers.

To consume real-time feeds in browsers, it's recommended to proxy them
through a backend service.

## Installing

This package is not published in NPM yet. You can add it to your project like this:

```
npm i --save git+https://github.com/hackbg/chainlink-datastreams-consumer.git
```

## Connecting

Use your authentication credentials to instantiate the default export of the module.

```javascript
import ChainlinkDatastreamsConsumer from "@hackbg/chainlink-datastreams-consumer";

const api = new ChainlinkDatastreamsConsumer({
  hostname: "...",
  wsHostname: "...",
  clientID: "...",
  clientSecret: "...",
});
```

## Fetching data from feeds

Use the `fetchFeed` method to pull the data from one feed for a given point in time.
This asynchronously returns an instance of the `Report` object, which combines the fields
from the SingleReport, FullReport, and ReportBlob types.

```javascript
const report = await api.fetchFeed({
  timestamp: "1694212245",
  feed: "0x0002F18A75A7750194A6476C9AB6D51276952471BD90404904211A9D47F34E64",
});
```

Use the `fetchFeeds` method to pull the data from multiple feeds for a given point in time.
This asynchronously returns a `Record<FeedId, Report>`.

```javascript
const reports = await api.fetchFeeds({
  timestamp: "1694212245",
  feeds: ["0x00023496426b520583ae20a66d80484e0fc18544866a5b0bfee15ec771963274", "0x0002f18a75a7750194a6476c9ab6d51276952471bd90404904211a9d47f34e64"],
});
```

## Subscribing to feeds

In Node.js, you can also use the WebSocket-based API.

The optional `feeds` parameter allows you to connect and subscribe in a single expression.
Use the instance's `on`, `once` and `off` methods to set up event handling.

```javascript
import ChainlinkDatastreamsConsumer from "@hackbg/chainlink-datastreams-consumer";

const api = new ChainlinkDatastreamsConsumer({
  hostname: "...",
  wsHostname: "...",
  clientID: "...",
  clientSecret: "...",
  feeds: ["0x...", "0x...", "0x..."],
}).on("report", (report) => {
  console.log(report);
});
```

It's recommended to keep a single SDK instance per credential set, and use
the asynchronous `subscribeTo` and `unsubscribeFrom` methods to change the
set of feeds to which the SDK is listening.

```javascript
await api.subscribeTo("0x...");

await api.subscribeTo(["0x...", "0x..."]);

await api.unsubscribeFrom("0x...");

await api.unsubscribeFrom(["0x...", "0x..."]);
```

The underlying WebSocket is automatically closed and reopened when the
list of feeds changes; when there are 0 feeds, it remains closed.

The IDs of currently subscribed feeds are available on the `feeds`
property, as a read-only `Set`.
