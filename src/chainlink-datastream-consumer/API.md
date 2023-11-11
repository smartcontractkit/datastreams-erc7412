### Authentication

**_Credentials will be provided to you by your Chainlink Solution Architect._**

All routes require the following three headers for user authentication

- Authorization: The user’s id, which is a uuid that we will provide to you after we create your user
- X-Authorization-Timestamp: The current time in up to nanosecond precision. Must be within 5 seconds of the current time (by default).
- X-Authorization-Signature-SHA256: The HMAC, which is a user generated hash that is created by encrypting parts of the request and its metadata with a shared secret for the user that we will provide

Authentication Error Response Codes:

- Error code 400 if the timestamp is invalid.
- Error code 401 if the user is unauthorized. Most often seen when the server produces an HMAC that differs from what the client provide
- Error code 420 (Bad Request) is the most common error type. It occurs when:
  - There’s any missing/malformed query arguments
  - If the user requested a feed that they don’t have permission to access or that doesn’t exist
  - If the user is missing required headers or if those headers have bad values
- Error code 500 on internal server errors (something went wrong on our side).

### Paths

| Endpoint             | Type      | Description                                                                                                     | Sample Request                                                      | Sample Response                                                                                                                                                                                                                                                                                        |
| -------------------- | --------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| /api/v1/reports/bulk | HTTP GET  | Return multiple reports for multiple FeedIDs and the same timestamp.                                            | GET /api/v1/reports/bulk?feedIDs=0x..., 0x..., 0x...&timestamp=XXXX | {"reports": [{ "feedID": hex encoded feedId, "validFromTimestamp": report's earliest applicable timestamp, "observationsTimestamp": report's latest applicable timestamp "fullReport": a blob containing the report context + body, can be passed unmodified to the contract for verification },...] } |
| /api/v1/reports      | HTTP GET  | Returns a single report for a given timestamp.                                                                  | GET /api/v1/reports?feedID=0x...&timestamp=XXXX                     | { "report"{ "feedID": hex encoded feedId, "validFromTimestamp": report's earliest applicable timestamp, "observationsTimestamp": report's latest applicable timestamp "fullReport": a blob containing the report context + body, can be passed unmodified to the contract for verification }           |
| /api/v1/ws           | websocket | Establishes a streaming websocket connection that sends reports for the given feedID(s) after they are verified | GET /api/v1/ws?feedIDs=0x..., 0x..., 0x...                          | { "report": { "feedID": hex encoded feedId, "fullReport": a blob containing the report context + body, can be passed unmodified to the contract for verification } }                                                                                                                                   |

### Parameters

| Parameter (w/ correct casing) | Description                                                         | Type            |
| ----------------------------- | ------------------------------------------------------------------- | --------------- |
| feedID(s)                     | Report Feed ID(s) in hex format, may optionally be prefixed with 0x | list of bytes32 |
| timestamp                     | Retrieve report(s) whose timerange includes this number             | int32           |

Granularity in seconds |
